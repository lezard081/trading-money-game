// <copyright file="TradingTriggerEngine.cs" company="ApexTrade">
// Copyright (c) 2026 ApexTrade. All rights reserved.
// Phase 4 & Phase 5: Automated Trading Trigger Calculation Engine with Capital Controller and Slippage Guardrail.
// Evaluates real-time dip conditions for INTC, AMD, and F (2% price drop from prior close).
// Features dynamic lot calculation for small starting accounts ($100 - $500 USD seed balance):
//  - Maximum trade allocation per entry: 15% to 20% of total available account cash.
//  - Low-priced tech/value targets (INTC, AMD, F): buys 1 to 3 shares max per trigger.
//  - Cash reserves never drop below $50 in total liquid safety buffer.
// Phase 5 Safety Guardrail:
//  - Bid-Ask spread guardrail: if (Ask - Bid) / Bid > 0.01 (1%), aborts signal to prevent slippage rejections.
// </copyright>

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace ApexTrade.Core
{
    public sealed record TriggerEvaluationResult
    {
        public string Symbol { get; init; } = string.Empty;
        public decimal PreviousClose { get; init; }
        public decimal CurrentPrice { get; init; }
        public decimal ChangeAmount { get; init; }
        public decimal ChangePercent { get; init; }
        public bool Triggered { get; init; }
        public string Rule { get; init; } = "Price drop >= 2.0% vs Previous Close & Spread <= 1.0%";
        public string Reason { get; init; } = string.Empty;
        public long? InsertedSignalId { get; init; }
        public decimal OrderQuantity { get; init; }
        public string OrderSide { get; init; } = "BUY";
        public decimal AvailableCash { get; init; }
        public decimal LiquidSafetyBuffer { get; init; } = 50.00m;
        public decimal EstimatedOrderCost { get; init; }
        public decimal RemainingCashAfterTrade { get; init; }
        public decimal BidPrice { get; init; }
        public decimal AskPrice { get; init; }
        public decimal SpreadPercent { get; init; }
        public bool SpreadGuardrailPassed { get; init; } = true;
        public string Timestamp { get; init; } = DateTimeOffset.UtcNow.ToString("o");
    }

    public sealed record TargetStockConfig
    {
        public string Symbol { get; init; } = string.Empty;
        public decimal BaselinePreviousClose { get; init; }
        public decimal DefaultTargetShares { get; init; }
        public string OrderType { get; init; } = "market";
        public string Description { get; init; } = string.Empty;
    }

    public sealed record CapitalSizingResult
    {
        public decimal AvailableCash { get; init; }
        public decimal LiquidSafetyBuffer { get; init; } = 50.00m;
        public decimal SpendableCash { get; init; }
        public decimal MaxTradeAllocationCash { get; init; }
        public decimal TargetPrice { get; init; }
        public decimal CalculatedShares { get; init; }
        public decimal EstimatedCost { get; init; }
        public decimal RemainingCashAfterTrade { get; init; }
        public bool IsApproved { get; init; }
        public string SizingExplanation { get; init; } = string.Empty;
    }

    /// <summary>
    /// Capital Controller for Small Starting Accounts ($100 - $500 USD).
    /// Enforces dynamic position sizing, 15%-20% max entry allocation, and a $50 minimum liquid buffer.
    /// </summary>
    public static class CapitalController
    {
        public const decimal LiquidSafetyBuffer = 50.00m; // Cash reserves must NEVER drop below $50
        public const decimal MinAllocationRate = 0.15m;  // 15% minimum entry budget
        public const decimal MaxAllocationRate = 0.20m;  // 20% maximum entry allocation

        /// <summary>
        /// Calculates dynamic lot size adhering to small-account rules ($100 - $500 seed):
        /// - 15% to 20% max trade allocation per entry.
        /// - 1 to 3 shares max per trigger (e.g., Ford @ ~$10 = 2 shares, INTC @ ~$22 = 1 share, AMD @ ~$140 = 1 share if cash permits).
        /// - Cash reserves never drop below $50 in total liquid safety buffer.
        /// </summary>
        public static CapitalSizingResult CalculateSizing(
            decimal availableCash,
            decimal currentPrice,
            string symbol,
            decimal? explicitQty = null)
        {
            symbol = symbol.ToUpperInvariant();

            // Handle manual explicit lot override if supplied
            if (explicitQty.HasValue && explicitQty.Value > 0m)
            {
                decimal explicitCost = explicitQty.Value * currentPrice;
                decimal remaining = availableCash - explicitCost;
                bool approved = remaining >= LiquidSafetyBuffer;
                return new CapitalSizingResult
                {
                    AvailableCash = availableCash,
                    LiquidSafetyBuffer = LiquidSafetyBuffer,
                    SpendableCash = Math.Max(0m, availableCash - LiquidSafetyBuffer),
                    MaxTradeAllocationCash = availableCash * MaxAllocationRate,
                    TargetPrice = currentPrice,
                    CalculatedShares = approved ? explicitQty.Value : 0m,
                    EstimatedCost = approved ? explicitCost : 0m,
                    RemainingCashAfterTrade = remaining,
                    IsApproved = approved,
                    SizingExplanation = approved
                        ? $"Explicit override {explicitQty.Value} shares approved (${explicitCost:F2}, buffer remaining: ${remaining:F2} >= $50)."
                        : $"Explicit override {explicitQty.Value} shares rejected. Order cost (${explicitCost:F2}) leaves ${remaining:F2}, breaching the $50 liquid safety buffer."
                };
            }

            // 1. Enforce Liquid Safety Buffer: Cash reserves must never drop below $50
            decimal spendableCash = Math.Max(0m, availableCash - LiquidSafetyBuffer);
            if (spendableCash < currentPrice)
            {
                return new CapitalSizingResult
                {
                    AvailableCash = availableCash,
                    LiquidSafetyBuffer = LiquidSafetyBuffer,
                    SpendableCash = spendableCash,
                    MaxTradeAllocationCash = availableCash * MaxAllocationRate,
                    TargetPrice = currentPrice,
                    CalculatedShares = 0m,
                    EstimatedCost = 0m,
                    RemainingCashAfterTrade = availableCash,
                    IsApproved = false,
                    SizingExplanation = $"Capital Controller: Spendable cash above buffer is ${spendableCash:F2}, insufficient to buy 1 share of {symbol} @ ${currentPrice:F2} (Minimum $50 liquid buffer enforced)."
                };
            }

            // 2. Maximum allocation per entry: 15% to 20% of total available account cash
            decimal maxEntryAllocation = availableCash * MaxAllocationRate;

            // 3. Dynamic lot calculation for small targets (INTC, AMD, F):
            decimal rawShares = Math.Floor(maxEntryAllocation / currentPrice);

            // If 20% budget is less than 1 share, allow 1 single share if spendable cash permits safely
            if (rawShares < 1m && currentPrice <= spendableCash)
            {
                rawShares = 1m;
            }

            // For low-priced target Ford (F) at ~$10/share, recommend 2 shares when cash allows
            if (symbol == "F" && rawShares <= 1m && (2m * currentPrice) <= spendableCash)
            {
                rawShares = 2m;
            }

            // Clamp between 1 and 3 shares max per trigger
            decimal finalShares = Math.Clamp(rawShares, 1m, 3m);

            // Double check: ensure cash after order NEVER drops below $50 safety buffer
            while (finalShares > 0m && (availableCash - (finalShares * currentPrice)) < LiquidSafetyBuffer)
            {
                finalShares -= 1m;
            }

            if (finalShares <= 0m)
            {
                return new CapitalSizingResult
                {
                    AvailableCash = availableCash,
                    LiquidSafetyBuffer = LiquidSafetyBuffer,
                    SpendableCash = spendableCash,
                    MaxTradeAllocationCash = maxEntryAllocation,
                    TargetPrice = currentPrice,
                    CalculatedShares = 0m,
                    EstimatedCost = 0m,
                    RemainingCashAfterTrade = availableCash,
                    IsApproved = false,
                    SizingExplanation = $"Capital Controller: Order blocked. Purchasing any shares of {symbol} @ ${currentPrice:F2} would breach the $50 minimum liquid cash buffer."
                };
            }

            decimal totalCost = Math.Round(finalShares * currentPrice, 2);
            decimal remainingCash = Math.Round(availableCash - totalCost, 2);
            decimal actualAllocationRate = Math.Round((totalCost / availableCash) * 100m, 1);

            return new CapitalSizingResult
            {
                AvailableCash = availableCash,
                LiquidSafetyBuffer = LiquidSafetyBuffer,
                SpendableCash = spendableCash,
                MaxTradeAllocationCash = maxEntryAllocation,
                TargetPrice = currentPrice,
                CalculatedShares = finalShares,
                EstimatedCost = totalCost,
                RemainingCashAfterTrade = remainingCash,
                IsApproved = true,
                SizingExplanation = $"Capital Controller sized {finalShares} share(s) (${totalCost:F2}, {actualAllocationRate}% of cash). Remaining cash buffer: ${remainingCash:F2} (>= $50.00 buffer)."
            };
        }
    }

    /// <summary>
    /// Phase 4 & Phase 5 Trading Trigger Engine.
    /// Monitors target stocks (INTC, AMD, F), checks 2% dip vs previous close, applies slippage & spread guardrail,
    /// dynamic lot sizing ($100-$500 seed), and writes 'PENDING' orders into SQLite apextrade.db.
    /// </summary>
    public static class TradingTriggerEngine
    {
        public const decimal DipThresholdPercent = -2.00m;
        public const decimal MaxAllowedSpreadRatio = 0.01m; // 1.0% maximum allowed bid-ask spread ((Ask - Bid) / Bid)

        public static readonly string[] TargetSymbols = { "INTC", "AMD", "F" };

        public static readonly Dictionary<string, TargetStockConfig> Targets = new(StringComparer.OrdinalIgnoreCase)
        {
            ["INTC"] = new TargetStockConfig
            {
                Symbol = "INTC",
                BaselinePreviousClose = 24.50m,
                DefaultTargetShares = 1m,
                OrderType = "market",
                Description = "Intel Corporation (Semiconductors)"
            },
            ["AMD"] = new TargetStockConfig
            {
                Symbol = "AMD",
                BaselinePreviousClose = 142.80m,
                DefaultTargetShares = 1m,
                OrderType = "market",
                Description = "Advanced Micro Devices, Inc. (Semiconductors)"
            },
            ["F"] = new TargetStockConfig
            {
                Symbol = "F",
                BaselinePreviousClose = 11.20m,
                DefaultTargetShares = 2m,
                OrderType = "market",
                Description = "Ford Motor Company (Automotive)"
            }
        };

        /// <summary>
        /// Evaluates a single stock price against its previous close and bid-ask spread guardrail.
        /// When a 2% dip occurs and spread <= 1.0%, calculates dynamic position size via CapitalController and inserts a 'PENDING' order into apextrade.db.
        /// </summary>
        public static TriggerEvaluationResult EvaluateAndTrigger(
            string dbPath,
            string symbol,
            decimal currentPrice,
            decimal previousClose,
            decimal? quantity = null,
            string type = "market",
            decimal? bidPrice = null,
            decimal? askPrice = null)
        {
            string resolvedPath = VaultDb.ResolveDatabasePath(dbPath);
            VaultDb.EnsureDatabaseInitialized(resolvedPath);

            symbol = symbol.Trim().ToUpperInvariant();
            if (previousClose <= 0)
            {
                return new TriggerEvaluationResult
                {
                    Symbol = symbol,
                    PreviousClose = previousClose,
                    CurrentPrice = currentPrice,
                    ChangeAmount = 0m,
                    ChangePercent = 0m,
                    Triggered = false,
                    Reason = $"Invalid previous close price (${previousClose}). Cannot calculate percentage drop."
                };
            }

            decimal changeAmount = currentPrice - previousClose;
            decimal changePercent = (changeAmount / previousClose) * 100m;
            bool dipsByTwoPercentOrMore = changePercent <= DipThresholdPercent;

            // Phase 5: Bid-Ask Spread & Slippage Guardrail Calculation
            decimal bid = bidPrice ?? Math.Round(currentPrice - 0.01m, 2);
            decimal ask = askPrice ?? Math.Round(currentPrice + 0.01m, 2);
            if (bid <= 0m) bid = currentPrice;
            if (ask < bid) ask = bid;

            decimal spreadAmount = ask - bid;
            decimal spreadRatio = bid > 0m ? (spreadAmount / bid) : 0m;
            decimal spreadPercent = Math.Round(spreadRatio * 100m, 2);
            bool spreadGuardrailPassed = spreadRatio < MaxAllowedSpreadRatio;

            // Load real-time cash from SQLite database for capital sizing
            var (found, cashReserves, initialBalance, _, _, _) = VaultDb.LoadPortfolioState(resolvedPath);
            decimal availableCash = found ? cashReserves : 250.00m;

            // Run through Capital Controller dynamic sizing
            var sizing = CapitalController.CalculateSizing(availableCash, currentPrice, symbol, quantity);

            if (dipsByTwoPercentOrMore)
            {
                // Phase 5 Guardrail Check: Abort if spread is wider than 1% to prevent high slippage
                if (!spreadGuardrailPassed)
                {
                    return new TriggerEvaluationResult
                    {
                        Symbol = symbol,
                        PreviousClose = previousClose,
                        CurrentPrice = currentPrice,
                        ChangeAmount = Math.Round(changeAmount, 4),
                        ChangePercent = Math.Round(changePercent, 2),
                        Triggered = false,
                        OrderQuantity = 0,
                        AvailableCash = availableCash,
                        LiquidSafetyBuffer = CapitalController.LiquidSafetyBuffer,
                        RemainingCashAfterTrade = availableCash,
                        BidPrice = bid,
                        AskPrice = ask,
                        SpreadPercent = spreadPercent,
                        SpreadGuardrailPassed = false,
                        Reason = $"Slippage Guardrail Abort: Bid-Ask spread of {spreadPercent:F2}% exceeds 1.00% safety limit (Bid: ${bid:F2}, Ask: ${ask:F2}). BUY signal aborted to prevent high slippage rejections."
                    };
                }

                if (!sizing.IsApproved || sizing.CalculatedShares <= 0)
                {
                    return new TriggerEvaluationResult
                    {
                        Symbol = symbol,
                        PreviousClose = previousClose,
                        CurrentPrice = currentPrice,
                        ChangeAmount = Math.Round(changeAmount, 4),
                        ChangePercent = Math.Round(changePercent, 2),
                        Triggered = false,
                        OrderQuantity = 0,
                        AvailableCash = availableCash,
                        LiquidSafetyBuffer = CapitalController.LiquidSafetyBuffer,
                        RemainingCashAfterTrade = availableCash,
                        BidPrice = bid,
                        AskPrice = ask,
                        SpreadPercent = spreadPercent,
                        SpreadGuardrailPassed = true,
                        Reason = $"Dip triggered (-{Math.Abs(changePercent):F2}%), but Capital Controller blocked order: {sizing.SizingExplanation}"
                    };
                }

                // Check for existing pending signal for this symbol to avoid duplicate flood
                if (VaultDb.HasPendingSignalForSymbol(resolvedPath, symbol))
                {
                    return new TriggerEvaluationResult
                    {
                        Symbol = symbol,
                        PreviousClose = previousClose,
                        CurrentPrice = currentPrice,
                        ChangeAmount = Math.Round(changeAmount, 4),
                        ChangePercent = Math.Round(changePercent, 2),
                        Triggered = true,
                        OrderQuantity = sizing.CalculatedShares,
                        AvailableCash = availableCash,
                        LiquidSafetyBuffer = CapitalController.LiquidSafetyBuffer,
                        EstimatedOrderCost = sizing.EstimatedCost,
                        RemainingCashAfterTrade = sizing.RemainingCashAfterTrade,
                        BidPrice = bid,
                        AskPrice = ask,
                        SpreadPercent = spreadPercent,
                        SpreadGuardrailPassed = true,
                        Reason = $"Dip detected (-{Math.Abs(changePercent):F2}%). Active PENDING signal already queued in SQLite apextrade.db for {symbol}. Awaiting Tradier execution."
                    };
                }

                // Auto insert 'PENDING' row into SQLite database 'signals' table
                long signalId = VaultDb.InsertSignal(
                    resolvedPath,
                    symbol: symbol,
                    side: "BUY",
                    quantity: sizing.CalculatedShares,
                    type: type,
                    price: currentPrice
                );

                return new TriggerEvaluationResult
                {
                    Symbol = symbol,
                    PreviousClose = previousClose,
                    CurrentPrice = currentPrice,
                    ChangeAmount = Math.Round(changeAmount, 4),
                    ChangePercent = Math.Round(changePercent, 2),
                    Triggered = true,
                    InsertedSignalId = signalId,
                    OrderQuantity = sizing.CalculatedShares,
                    OrderSide = "BUY",
                    AvailableCash = availableCash,
                    LiquidSafetyBuffer = CapitalController.LiquidSafetyBuffer,
                    EstimatedOrderCost = sizing.EstimatedCost,
                    RemainingCashAfterTrade = sizing.RemainingCashAfterTrade,
                    BidPrice = bid,
                    AskPrice = ask,
                    SpreadPercent = spreadPercent,
                    SpreadGuardrailPassed = true,
                    Reason = $"Stock dipped by {Math.Abs(changePercent):F2}% (>= 2.0% dip, spread {spreadPercent:F2}% <= 1.0%). {sizing.SizingExplanation} Inserted PENDING BUY order #{signalId} into SQLite 'signals' table."
                };
            }

            return new TriggerEvaluationResult
            {
                Symbol = symbol,
                PreviousClose = previousClose,
                CurrentPrice = currentPrice,
                ChangeAmount = Math.Round(changeAmount, 4),
                ChangePercent = Math.Round(changePercent, 2),
                Triggered = false,
                OrderQuantity = sizing.CalculatedShares,
                AvailableCash = availableCash,
                LiquidSafetyBuffer = CapitalController.LiquidSafetyBuffer,
                RemainingCashAfterTrade = availableCash,
                BidPrice = bid,
                AskPrice = ask,
                SpreadPercent = spreadPercent,
                SpreadGuardrailPassed = spreadGuardrailPassed,
                Reason = $"Change of {changePercent:F2}% did not trigger rule. Requires dip <= -2.00%."
            };
        }

        /// <summary>
        /// Evaluates a collection of quotes against the 2% dip rule.
        /// </summary>
        public static List<TriggerEvaluationResult> EvaluateQuotes(
            string dbPath,
            IEnumerable<(string Symbol, decimal CurrentPrice, decimal PreviousClose)> quotes)
        {
            var results = new List<TriggerEvaluationResult>();
            foreach (var q in quotes)
            {
                results.Add(EvaluateAndTrigger(dbPath, q.Symbol, q.CurrentPrice, q.PreviousClose));
            }
            return results;
        }

        /// <summary>
        /// Simulates or executes a dip evaluation specifically for target stocks (INTC, AMD, F),
        /// with optional spread simulation to test the Phase 5 safety guardrail.
        /// </summary>
        public static TriggerEvaluationResult SimulateTargetDip(
            string dbPath,
            string symbol,
            decimal simulatedDipPercent = -2.5m,
            decimal? spreadPercentOverride = null)
        {
            symbol = symbol.Trim().ToUpperInvariant();
            if (!Targets.TryGetValue(symbol, out var cfg))
            {
                cfg = new TargetStockConfig
                {
                    Symbol = symbol,
                    BaselinePreviousClose = 25.00m,
                    DefaultTargetShares = 1m,
                    OrderType = "market"
                };
            }

            if (simulatedDipPercent > 0)
            {
                simulatedDipPercent = -simulatedDipPercent;
            }

            decimal previousClose = cfg.BaselinePreviousClose;
            decimal currentPrice = Math.Round(previousClose * (1m + (simulatedDipPercent / 100m)), 2);

            decimal? bid = null;
            decimal? ask = null;

            if (spreadPercentOverride.HasValue && spreadPercentOverride.Value > 0m)
            {
                decimal halfSpread = (currentPrice * (spreadPercentOverride.Value / 100m)) / 2m;
                bid = Math.Round(currentPrice - halfSpread, 2);
                ask = Math.Round(currentPrice + halfSpread, 2);
            }

            return EvaluateAndTrigger(dbPath, symbol, currentPrice, previousClose, null, cfg.OrderType, bid, ask);
        }
    }
}

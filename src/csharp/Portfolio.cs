// <copyright file="Portfolio.cs" company="ApexTrade">
// Copyright (c) 2026 ApexTrade. All rights reserved.
// Licensed under the Apache License, Version 2.0.
// </copyright>

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;

namespace ApexTrade.Core
{
    #region Enums and Value Objects

    /// <summary>
    /// Order execution side (Buy or Sell).
    /// </summary>
    public enum OrderSide
    {
        Buy,
        Sell
    }

    /// <summary>
    /// Represents an incoming market stock price ticker event from a financial feed.
    /// </summary>
    public sealed record StockTicker
    {
        public string Symbol { get; init; } = string.Empty;
        public decimal Price { get; init; }
        public decimal Change { get; init; }
        public decimal ChangePercent { get; init; }
        public long Volume { get; init; }
        public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;
        public string Exchange { get; init; } = "NASDAQ";

        public StockTicker() { }

        public StockTicker(string symbol, decimal price, decimal change = 0m, decimal changePercent = 0m, long volume = 0)
        {
            if (string.IsNullOrWhiteSpace(symbol))
                throw new ArgumentException("Ticker symbol cannot be null or whitespace.", nameof(symbol));
            if (price < 0m)
                throw new ArgumentOutOfRangeException(nameof(price), "Stock price cannot be negative.");

            Symbol = symbol.Trim().ToUpperInvariant();
            Price = price;
            Change = change;
            ChangePercent = changePercent;
            Volume = volume;
            Timestamp = DateTimeOffset.UtcNow;
        }
    }

    /// <summary>
    /// Represents an open position in an equity asset within the portfolio.
    /// </summary>
    public sealed class Position
    {
        public string Symbol { get; set; } = string.Empty;
        public decimal Shares { get; set; }
        public decimal AverageCostBasis { get; set; }
        public decimal CurrentPrice { get; set; }
        public decimal TotalCost => Shares * AverageCostBasis;
        public decimal MarketValue => Shares * CurrentPrice;
        public decimal UnrealizedPnL => MarketValue - TotalCost;
        public decimal UnrealizedPnLPercent => TotalCost > 0m
            ? Math.Round((UnrealizedPnL / TotalCost) * 100m, 2)
            : 0m;
        public DateTimeOffset LastUpdated { get; set; } = DateTimeOffset.UtcNow;

        public Position() { }

        public Position(string symbol, decimal shares, decimal costBasis, decimal initialPrice)
        {
            Symbol = symbol.Trim().ToUpperInvariant();
            Shares = shares;
            AverageCostBasis = costBasis;
            CurrentPrice = initialPrice;
            LastUpdated = DateTimeOffset.UtcNow;
        }

        public override string ToString() =>
            $"{Symbol}: {Shares:N2} shares @ Avg ${AverageCostBasis:N2} | Current: ${CurrentPrice:N2} | Val: ${MarketValue:N2} | P&L: {(UnrealizedPnL >= 0 ? "+" : "")}${UnrealizedPnL:N2} ({UnrealizedPnLPercent:N2}%)";
    }

    /// <summary>
    /// Represents an immutable execution record of a Buy or Sell trade,
    /// capturing the trade details and the running execution metrics at that moment.
    /// </summary>
    public sealed record TradeExecution
    {
        public Guid TradeId { get; init; } = Guid.NewGuid();
        public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;
        public string Symbol { get; init; } = string.Empty;

        [JsonConverter(typeof(JsonStringEnumConverter))]
        public OrderSide Side { get; init; }

        public decimal Shares { get; init; }
        public decimal ExecutionPrice { get; init; }
        public decimal TotalAmount => Shares * ExecutionPrice;
        public decimal RealizedPnL { get; init; }
        public decimal RemainingCashBalance { get; init; }

        public int RunningOrderCount { get; init; }
        public decimal RunningAverageProfitPerTrade { get; init; }
        public decimal RunningWinLossRatio { get; init; }
        public decimal RunningWinRatePercent { get; init; }

        public override string ToString() =>
            $"[{Timestamp:HH:mm:ss}] #{RunningOrderCount} {Side.ToString().ToUpper()} {Shares:N2} {Symbol} @ ${ExecutionPrice:N2} (Total: ${TotalAmount:N2}) | Realized: {(RealizedPnL >= 0 ? "+" : "")}${RealizedPnL:N2} | Running Avg P&L: {(RunningAverageProfitPerTrade >= 0 ? "+" : "")}${RunningAverageProfitPerTrade:N2} | W/L: {RunningWinLossRatio:N2}";
    }

    public sealed record TradeStatistics
    {
        public int TotalExecutedOrders { get; init; }
        public int BuyOrdersCount { get; init; }
        public int SellOrdersCount { get; init; }
        public int WinningTradesCount { get; init; }
        public int LosingTradesCount { get; init; }
        public int BreakEvenTradesCount { get; init; }
        public decimal WinLossRatio { get; init; }
        public decimal WinRatePercent { get; init; }
        public decimal AverageProfitPerTrade { get; init; }
        public decimal AverageWinningTrade { get; init; }
        public decimal AverageLosingTrade { get; init; }
        public decimal TotalGrossProfit { get; init; }
        public decimal TotalGrossLoss { get; init; }
        public decimal ProfitFactor { get; init; }
        public decimal LargestWinningTrade { get; init; }
        public decimal LargestLosingTrade { get; init; }
        public decimal TotalSharesTraded { get; init; }
        public decimal TotalDollarTurnover { get; init; }
    }

    public sealed record OrderResult
    {
        public bool Success { get; init; }
        public string Message { get; init; } = string.Empty;
        public TradeExecution? Execution { get; init; }

        public static OrderResult Succeeded(TradeExecution execution) =>
            new() { Success = true, Message = "Order executed successfully.", Execution = execution };

        public static OrderResult Failed(string error) =>
            new() { Success = false, Message = error, Execution = null };
    }

    public sealed record PortfolioSnapshot
    {
        public decimal InitialBalance { get; init; }
        public decimal CashBalance { get; init; }
        public decimal InvestedValue { get; init; }
        public decimal TotalPortfolioValue { get; init; }
        public decimal TotalRealizedPnL { get; init; }
        public decimal TotalUnrealizedPnL { get; init; }
        public decimal TotalNetPnL => TotalRealizedPnL + TotalUnrealizedPnL;
        public decimal TotalReturnPercent { get; init; }
        public int OpenPositionsCount { get; init; }
        public TradeStatistics Statistics { get; init; } = new();
        public IReadOnlyList<Position> Positions { get; init; } = Array.Empty<Position>();
        public IReadOnlyList<TradeExecution> RecentTrades { get; init; } = Array.Empty<TradeExecution>();
        public DateTimeOffset SnapshotTime { get; init; } = DateTimeOffset.UtcNow;
    }

    #endregion

    #region Event Arguments

    public sealed class PriceUpdatedEventArgs : EventArgs
    {
        public StockTicker Ticker { get; }
        public Position? AffectedPosition { get; }

        public PriceUpdatedEventArgs(StockTicker ticker, Position? position)
        {
            Ticker = ticker;
            AffectedPosition = position;
        }
    }

    public sealed class PortfolioUpdatedEventArgs : EventArgs
    {
        public PortfolioSnapshot Snapshot { get; }
        public string TriggerReason { get; }

        public PortfolioUpdatedEventArgs(PortfolioSnapshot snapshot, string reason)
        {
            Snapshot = snapshot;
            TriggerReason = reason;
        }
    }

    public sealed class TradeExecutedEventArgs : EventArgs
    {
        public TradeExecution Trade { get; }
        public TradeStatistics UpdatedStatistics { get; }

        public TradeExecutedEventArgs(TradeExecution trade, TradeStatistics stats)
        {
            Trade = trade;
            UpdatedStatistics = stats;
        }
    }

    #endregion

    public class Portfolio
    {
        public const decimal DefaultInitialBalance = 100_000.00m;

        private readonly object _syncLock = new();
        private readonly Dictionary<string, Position> _positions = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, StockTicker> _latestTickers = new(StringComparer.OrdinalIgnoreCase);
        private readonly List<TradeExecution> _tradeHistory = new();

        public decimal InitialBalance { get; private set; }
        public decimal CashBalance { get; private set; }
        public decimal TotalRealizedPnL { get; private set; }

        public int TotalExecutedOrders
        {
            get
            {
                lock (_syncLock) return _tradeHistory.Count;
            }
        }

        public decimal WinLossRatio => GetTradeStatistics().WinLossRatio;
        public decimal AverageProfitPerTrade => GetTradeStatistics().AverageProfitPerTrade;
        public TradeStatistics Statistics => GetTradeStatistics();

        public event EventHandler<PriceUpdatedEventArgs>? PriceUpdated;
        public event EventHandler<TradeExecutedEventArgs>? TradeExecuted;
        public event EventHandler<PortfolioUpdatedEventArgs>? PortfolioUpdated;

        public Portfolio(decimal initialCash = DefaultInitialBalance)
        {
            if (initialCash <= 0m)
                throw new ArgumentOutOfRangeException(nameof(initialCash), "Initial portfolio balance must be strictly positive.");

            InitialBalance = initialCash;
            CashBalance = initialCash;
            TotalRealizedPnL = 0m;
        }

        #region Market Price Ingestion

        public void ProcessTicker(StockTicker ticker)
        {
            if (ticker == null)
                throw new ArgumentNullException(nameof(ticker));

            string symbol = ticker.Symbol.Trim().ToUpperInvariant();
            _latestTickers[symbol] = ticker;

            Position? updatedPosition = null;
            PortfolioSnapshot snapshot;

            lock (_syncLock)
            {
                if (_positions.TryGetValue(symbol, out var pos))
                {
                    pos.CurrentPrice = ticker.Price;
                    pos.LastUpdated = ticker.Timestamp;
                    updatedPosition = pos;
                }

                snapshot = CreateSnapshotInternal();
            }

            PriceUpdated?.Invoke(this, new PriceUpdatedEventArgs(ticker, updatedPosition));
            if (updatedPosition != null)
            {
                PortfolioUpdated?.Invoke(this, new PortfolioUpdatedEventArgs(snapshot, $"Ticker update for {symbol}"));
            }
        }

        public void ProcessTickers(IEnumerable<StockTicker> tickers)
        {
            if (tickers == null) return;
            foreach (var ticker in tickers)
            {
                ProcessTicker(ticker);
            }
        }

        #endregion

        #region Trading / Order Execution & Running Metrics

        public OrderResult Buy(string symbol, decimal shares, decimal? executionPrice = null)
        {
            if (string.IsNullOrWhiteSpace(symbol))
                return OrderResult.Failed("Symbol cannot be empty.");
            if (shares <= 0m)
                return OrderResult.Failed("Number of shares must be greater than zero.");

            symbol = symbol.Trim().ToUpperInvariant();
            decimal price = executionPrice ?? GetCurrentMarketPrice(symbol);

            if (price <= 0m)
                return OrderResult.Failed($"No market price available for ticker '{symbol}'. Ingest ticker first or supply price.");

            decimal totalCost = Math.Round(shares * price, 2);
            TradeExecution execution;
            PortfolioSnapshot snapshot;
            TradeStatistics currentStats;

            lock (_syncLock)
            {
                if (CashBalance < totalCost)
                {
                    return OrderResult.Failed(
                        $"Insufficient cash balance. Required: ${totalCost:N2}, Available: ${CashBalance:N2}.");
                }

                CashBalance -= totalCost;

                if (_positions.TryGetValue(symbol, out var existing))
                {
                    decimal totalShares = existing.Shares + shares;
                    decimal totalInvested = (existing.Shares * existing.AverageCostBasis) + totalCost;
                    existing.AverageCostBasis = Math.Round(totalInvested / totalShares, 4);
                    existing.Shares = totalShares;
                    existing.CurrentPrice = price;
                    existing.LastUpdated = DateTimeOffset.UtcNow;
                }
                else
                {
                    _positions[symbol] = new Position(symbol, shares, price, price);
                }

                int newOrderCount = _tradeHistory.Count + 1;
                var sellTradesSoFar = _tradeHistory.Where(t => t.Side == OrderSide.Sell).ToList();
                int sellCount = sellTradesSoFar.Count;
                int wins = sellTradesSoFar.Count(t => t.RealizedPnL > 0);
                int losses = sellTradesSoFar.Count(t => t.RealizedPnL < 0);
                decimal runningAvgProfit = sellCount > 0 ? Math.Round(TotalRealizedPnL / sellCount, 2) : 0m;
                decimal runningWLRatio = losses > 0 ? Math.Round((decimal)wins / losses, 2) : (wins > 0 ? wins : 0m);
                decimal runningWinRate = sellCount > 0 ? Math.Round(((decimal)wins / sellCount) * 100m, 2) : 0m;

                execution = new TradeExecution
                {
                    Symbol = symbol,
                    Side = OrderSide.Buy,
                    Shares = shares,
                    ExecutionPrice = price,
                    RealizedPnL = 0m,
                    RemainingCashBalance = CashBalance,
                    RunningOrderCount = newOrderCount,
                    RunningAverageProfitPerTrade = runningAvgProfit,
                    RunningWinLossRatio = runningWLRatio,
                    RunningWinRatePercent = runningWinRate
                };

                _tradeHistory.Add(execution);
                snapshot = CreateSnapshotInternal();
                currentStats = snapshot.Statistics;
            }

            TradeExecuted?.Invoke(this, new TradeExecutedEventArgs(execution, currentStats));
            PortfolioUpdated?.Invoke(this, new PortfolioUpdatedEventArgs(snapshot, $"Executed BUY {shares} {symbol}"));

            return OrderResult.Succeeded(execution);
        }

        public OrderResult Sell(string symbol, decimal shares, decimal? executionPrice = null)
        {
            if (string.IsNullOrWhiteSpace(symbol))
                return OrderResult.Failed("Symbol cannot be empty.");
            if (shares <= 0m)
                return OrderResult.Failed("Number of shares must be greater than zero.");

            symbol = symbol.Trim().ToUpperInvariant();
            decimal price = executionPrice ?? GetCurrentMarketPrice(symbol);

            if (price <= 0m)
                return OrderResult.Failed($"No market price available for ticker '{symbol}'. Ingest ticker first or supply price.");

            TradeExecution execution;
            PortfolioSnapshot snapshot;
            TradeStatistics currentStats;

            lock (_syncLock)
            {
                if (!_positions.TryGetValue(symbol, out var existing) || existing.Shares < shares)
                {
                    decimal available = existing?.Shares ?? 0m;
                    return OrderResult.Failed(
                        $"Insufficient shares of {symbol} to sell. Requested: {shares:N2}, Owned: {available:N2}.");
                }

                decimal grossProceeds = Math.Round(shares * price, 2);
                decimal costBasisOfSoldShares = Math.Round(shares * existing.AverageCostBasis, 2);
                decimal realizedPnL = grossProceeds - costBasisOfSoldShares;

                CashBalance += grossProceeds;
                TotalRealizedPnL += realizedPnL;

                existing.Shares -= shares;
                existing.CurrentPrice = price;
                existing.LastUpdated = DateTimeOffset.UtcNow;

                if (existing.Shares == 0m)
                {
                    _positions.Remove(symbol);
                }

                int newOrderCount = _tradeHistory.Count + 1;
                var pastSells = _tradeHistory.Where(t => t.Side == OrderSide.Sell).ToList();
                int totalSells = pastSells.Count + 1;
                int wins = pastSells.Count(t => t.RealizedPnL > 0) + (realizedPnL > 0 ? 1 : 0);
                int losses = pastSells.Count(t => t.RealizedPnL < 0) + (realizedPnL < 0 ? 1 : 0);
                decimal runningAvgProfit = totalSells > 0 ? Math.Round(TotalRealizedPnL / totalSells, 2) : 0m;
                decimal runningWLRatio = losses > 0 ? Math.Round((decimal)wins / losses, 2) : (wins > 0 ? wins : 0m);
                decimal runningWinRate = totalSells > 0 ? Math.Round(((decimal)wins / totalSells) * 100m, 2) : 0m;

                execution = new TradeExecution
                {
                    Symbol = symbol,
                    Side = OrderSide.Sell,
                    Shares = shares,
                    ExecutionPrice = price,
                    RealizedPnL = realizedPnL,
                    RemainingCashBalance = CashBalance,
                    RunningOrderCount = newOrderCount,
                    RunningAverageProfitPerTrade = runningAvgProfit,
                    RunningWinLossRatio = runningWLRatio,
                    RunningWinRatePercent = runningWinRate
                };

                _tradeHistory.Add(execution);
                snapshot = CreateSnapshotInternal();
                currentStats = snapshot.Statistics;
            }

            TradeExecuted?.Invoke(this, new TradeExecutedEventArgs(execution, currentStats));
            PortfolioUpdated?.Invoke(this, new PortfolioUpdatedEventArgs(snapshot, $"Executed SELL {shares} {symbol}"));

            return OrderResult.Succeeded(execution);
        }

        #endregion

        #region Statistics & Queries

        public TradeStatistics GetTradeStatistics()
        {
            lock (_syncLock)
            {
                return CalculateStatisticsInternal();
            }
        }

        private TradeStatistics CalculateStatisticsInternal()
        {
            int totalOrders = _tradeHistory.Count;
            int buyOrders = 0;
            int sellOrders = 0;
            int wins = 0;
            int losses = 0;
            int breakEven = 0;

            decimal grossProfit = 0m;
            decimal grossLoss = 0m;
            decimal largestWin = 0m;
            decimal largestLoss = 0m;
            decimal totalShares = 0m;
            decimal totalTurnover = 0m;

            foreach (var trade in _tradeHistory)
            {
                totalShares += trade.Shares;
                totalTurnover += trade.TotalAmount;

                if (trade.Side == OrderSide.Buy)
                {
                    buyOrders++;
                }
                else if (trade.Side == OrderSide.Sell)
                {
                    sellOrders++;
                    if (trade.RealizedPnL > 0m)
                    {
                        wins++;
                        grossProfit += trade.RealizedPnL;
                        if (trade.RealizedPnL > largestWin) largestWin = trade.RealizedPnL;
                    }
                    else if (trade.RealizedPnL < 0m)
                    {
                        losses++;
                        decimal absLoss = Math.Abs(trade.RealizedPnL);
                        grossLoss += absLoss;
                        if (trade.RealizedPnL < largestLoss) largestLoss = trade.RealizedPnL;
                    }
                    else
                    {
                        breakEven++;
                    }
                }
            }

            decimal winLossRatio = losses > 0
                ? Math.Round((decimal)wins / losses, 2)
                : (wins > 0 ? wins : 0m);

            decimal winRate = sellOrders > 0
                ? Math.Round(((decimal)wins / sellOrders) * 100m, 2)
                : 0m;

            decimal avgProfitPerTrade = sellOrders > 0
                ? Math.Round(TotalRealizedPnL / sellOrders, 2)
                : 0m;

            decimal avgWin = wins > 0
                ? Math.Round(grossProfit / wins, 2)
                : 0m;

            decimal avgLoss = losses > 0
                ? Math.Round(grossLoss / losses, 2)
                : 0m;

            decimal profitFactor = grossLoss > 0
                ? Math.Round(grossProfit / grossLoss, 2)
                : (grossProfit > 0 ? grossProfit : 1m);

            return new TradeStatistics
            {
                TotalExecutedOrders = totalOrders,
                BuyOrdersCount = buyOrders,
                SellOrdersCount = sellOrders,
                WinningTradesCount = wins,
                LosingTradesCount = losses,
                BreakEvenTradesCount = breakEven,
                WinLossRatio = winLossRatio,
                WinRatePercent = winRate,
                AverageProfitPerTrade = avgProfitPerTrade,
                AverageWinningTrade = avgWin,
                AverageLosingTrade = avgLoss,
                TotalGrossProfit = grossProfit,
                TotalGrossLoss = grossLoss,
                ProfitFactor = profitFactor,
                LargestWinningTrade = largestWin,
                LargestLosingTrade = largestLoss,
                TotalSharesTraded = totalShares,
                TotalDollarTurnover = totalTurnover
            };
        }

        public decimal GetCurrentMarketPrice(string symbol)
        {
            symbol = symbol.Trim().ToUpperInvariant();
            if (_latestTickers.TryGetValue(symbol, out var ticker))
                return ticker.Price;

            lock (_syncLock)
            {
                if (_positions.TryGetValue(symbol, out var pos))
                    return pos.CurrentPrice;
            }

            return 0m;
        }

        public Position? GetPosition(string symbol)
        {
            lock (_syncLock)
            {
                return _positions.TryGetValue(symbol.Trim().ToUpperInvariant(), out var pos) ? pos : null;
            }
        }

        public IReadOnlyList<Position> GetPositions()
        {
            lock (_syncLock)
            {
                return _positions.Values.ToList().AsReadOnly();
            }
        }

        public IReadOnlyList<TradeExecution> GetTradeHistory()
        {
            lock (_syncLock)
            {
                return _tradeHistory.ToList().AsReadOnly();
            }
        }

        public PortfolioSnapshot GetSnapshot()
        {
            lock (_syncLock)
            {
                return CreateSnapshotInternal();
            }
        }

        public void Reset(decimal newInitialBalance = DefaultInitialBalance)
        {
            PortfolioSnapshot snapshot;
            lock (_syncLock)
            {
                InitialBalance = newInitialBalance;
                CashBalance = newInitialBalance;
                TotalRealizedPnL = 0m;
                _positions.Clear();
                _tradeHistory.Clear();
                snapshot = CreateSnapshotInternal();
            }

            PortfolioUpdated?.Invoke(this, new PortfolioUpdatedEventArgs(snapshot, "Portfolio reset to initial balance"));
        }

        public void LoadStateFromDatabase(
            decimal cashReserves,
            decimal initialBalance,
            decimal realizedPnL,
            IEnumerable<Position> positions,
            IEnumerable<TradeExecution> trades)
        {
            PortfolioSnapshot snapshot;
            lock (_syncLock)
            {
                InitialBalance = initialBalance > 0m ? initialBalance : DefaultInitialBalance;
                CashBalance = cashReserves;
                TotalRealizedPnL = realizedPnL;

                _positions.Clear();
                if (positions != null)
                {
                    foreach (var pos in positions)
                    {
                        _positions[pos.Symbol.ToUpperInvariant()] = new Position(pos.Symbol, pos.Shares, pos.AverageCostBasis, pos.CurrentPrice)
                        {
                            LastUpdated = pos.LastUpdated
                        };
                    }
                }

                _tradeHistory.Clear();
                if (trades != null)
                {
                    _tradeHistory.AddRange(trades);
                }

                snapshot = CreateSnapshotInternal();
            }

            PortfolioUpdated?.Invoke(this, new PortfolioUpdatedEventArgs(snapshot, "Portfolio restored from SQLite apextrade.db"));
        }

        private PortfolioSnapshot CreateSnapshotInternal()
        {
            decimal investedValue = 0m;
            decimal totalUnrealizedPnL = 0m;
            var positionClones = new List<Position>(_positions.Count);

            foreach (var pos in _positions.Values)
            {
                investedValue += pos.MarketValue;
                totalUnrealizedPnL += pos.UnrealizedPnL;
                positionClones.Add(new Position(pos.Symbol, pos.Shares, pos.AverageCostBasis, pos.CurrentPrice)
                {
                    LastUpdated = pos.LastUpdated
                });
            }

            decimal totalPortfolioValue = CashBalance + investedValue;
            decimal totalReturnPercent = InitialBalance > 0m
                ? Math.Round(((totalPortfolioValue - InitialBalance) / InitialBalance) * 100m, 2)
                : 0m;

            return new PortfolioSnapshot
            {
                InitialBalance = InitialBalance,
                CashBalance = CashBalance,
                InvestedValue = investedValue,
                TotalPortfolioValue = totalPortfolioValue,
                TotalRealizedPnL = TotalRealizedPnL,
                TotalUnrealizedPnL = totalUnrealizedPnL,
                TotalReturnPercent = totalReturnPercent,
                OpenPositionsCount = _positions.Count,
                Statistics = CalculateStatisticsInternal(),
                Positions = positionClones.AsReadOnly(),
                RecentTrades = _tradeHistory.TakeLast(30).ToList().AsReadOnly()
            };
        }

        #endregion
    }
}

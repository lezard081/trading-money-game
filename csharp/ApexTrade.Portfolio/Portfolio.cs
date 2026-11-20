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
        /// <summary>
        /// Gets the uppercase stock ticker symbol (e.g. "AAPL", "NVDA").
        /// </summary>
        public string Symbol { get; init; } = string.Empty;

        /// <summary>
        /// Gets the current regular market price.
        /// </summary>
        public decimal Price { get; init; }

        /// <summary>
        /// Gets the price change from prior session close.
        /// </summary>
        public decimal Change { get; init; }

        /// <summary>
        /// Gets the percentage change from prior session close.
        /// </summary>
        public decimal ChangePercent { get; init; }

        /// <summary>
        /// Gets the trading volume for the current trading day.
        /// </summary>
        public long Volume { get; init; }

        /// <summary>
        /// Gets the timestamp when the ticker price was recorded.
        /// </summary>
        public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;

        /// <summary>
        /// Gets the exchange name (e.g. "NASDAQ", "NYSE").
        /// </summary>
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
        /// <summary>
        /// Gets or sets the stock ticker symbol.
        /// </summary>
        public string Symbol { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the total number of shares owned.
        /// </summary>
        public decimal Shares { get; set; }

        /// <summary>
        /// Gets or sets the weighted average cost basis per share.
        /// </summary>
        public decimal AverageCostBasis { get; set; }

        /// <summary>
        /// Gets or sets the latest market price received via market tickers.
        /// </summary>
        public decimal CurrentPrice { get; set; }

        /// <summary>
        /// Gets the total cost spent acquiring current shares.
        /// </summary>
        public decimal TotalCost => Shares * AverageCostBasis;

        /// <summary>
        /// Gets the current market valuation of the position (Shares * CurrentPrice).
        /// </summary>
        public decimal MarketValue => Shares * CurrentPrice;

        /// <summary>
        /// Gets the unrealized profit or loss in dollar amount (MarketValue - TotalCost).
        /// </summary>
        public decimal UnrealizedPnL => MarketValue - TotalCost;

        /// <summary>
        /// Gets the unrealized percentage return on invested capital.
        /// </summary>
        public decimal UnrealizedPnLPercent => TotalCost > 0m
            ? Math.Round((UnrealizedPnL / TotalCost) * 100m, 2)
            : 0m;

        /// <summary>
        /// Gets or sets the timestamp of the last ticker price update.
        /// </summary>
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

        // Running Execution Metrics logged with each trade
        public int RunningOrderCount { get; init; }
        public decimal RunningAverageProfitPerTrade { get; init; }
        public decimal RunningWinLossRatio { get; init; }
        public decimal RunningWinRatePercent { get; init; }

        public override string ToString() =>
            $"[{Timestamp:HH:mm:ss}] #{RunningOrderCount} {Side.ToString().ToUpper()} {Shares:N2} {Symbol} @ ${ExecutionPrice:N2} (Total: ${TotalAmount:N2}) | Realized: {(RealizedPnL >= 0 ? "+" : "")}${RealizedPnL:N2} | Running Avg P&L: {(RunningAverageProfitPerTrade >= 0 ? "+" : "")}${RunningAverageProfitPerTrade:N2} | W/L: {RunningWinLossRatio:N2}";
    }

    /// <summary>
    /// Comprehensive performance statistics and execution metrics for the portfolio.
    /// Specifically tracks Win/Loss Ratio, average profit per trade, and total executed orders.
    /// </summary>
    public sealed record TradeStatistics
    {
        /// <summary>
        /// Total number of executed orders (all filled Buys and Sells).
        /// </summary>
        public int TotalExecutedOrders { get; init; }

        /// <summary>
        /// Total number of buy orders executed.
        /// </summary>
        public int BuyOrdersCount { get; init; }

        /// <summary>
        /// Total number of sell orders (closed or trimmed positions).
        /// </summary>
        public int SellOrdersCount { get; init; }

        /// <summary>
        /// Number of closed trades with positive realized profit.
        /// </summary>
        public int WinningTradesCount { get; init; }

        /// <summary>
        /// Number of closed trades with negative realized profit (loss).
        /// </summary>
        public int LosingTradesCount { get; init; }

        /// <summary>
        /// Number of closed trades that broke exactly even.
        /// </summary>
        public int BreakEvenTradesCount { get; init; }

        /// <summary>
        /// Ratio of winning trades to losing trades.
        /// If there are 0 losing trades, returns winning trades count or 0.
        /// </summary>
        public decimal WinLossRatio { get; init; }

        /// <summary>
        /// Win rate percentage (WinningTrades / CompletedSellTrades * 100).
        /// </summary>
        public decimal WinRatePercent { get; init; }

        /// <summary>
        /// Average realized profit or loss per completed trade.
        /// TotalRealizedPnL / SellOrdersCount (or 0 if no sell orders).
        /// </summary>
        public decimal AverageProfitPerTrade { get; init; }

        /// <summary>
        /// Average profit among winning trades.
        /// </summary>
        public decimal AverageWinningTrade { get; init; }

        /// <summary>
        /// Average loss among losing trades.
        /// </summary>
        public decimal AverageLosingTrade { get; init; }

        /// <summary>
        /// Cumulative gross profit from all winning trades.
        /// </summary>
        public decimal TotalGrossProfit { get; init; }

        /// <summary>
        /// Cumulative gross loss from all losing trades.
        /// </summary>
        public decimal TotalGrossLoss { get; init; }

        /// <summary>
        /// Profit Factor: Ratio of gross profits to gross losses.
        /// </summary>
        public decimal ProfitFactor { get; init; }

        /// <summary>
        /// Highest single trade profit recorded.
        /// </summary>
        public decimal LargestWinningTrade { get; init; }

        /// <summary>
        /// Worst single trade loss recorded.
        /// </summary>
        public decimal LargestLosingTrade { get; init; }

        /// <summary>
        /// Total volume of shares transacted across all orders.
        /// </summary>
        public decimal TotalSharesTraded { get; init; }

        /// <summary>
        /// Total gross dollar turnover across all executed orders.
        /// </summary>
        public decimal TotalDollarTurnover { get; init; }
    }

    /// <summary>
    /// Result payload returned from an order execution attempt.
    /// </summary>
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

    /// <summary>
    /// Read-only snapshot of the complete portfolio status at an instant in time.
    /// </summary>
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

    /// <summary>
    /// Core thread-safe data structure managing a stock portfolio starting at $100,000 balance.
    /// Accepts streaming market stock price tickers, recalculates market valuations in real time,
    /// handles order executions, and tracks running logs of past execution metrics
    /// including Win/Loss Ratio, average profit per trade, and total executed orders.
    /// </summary>
    public class Portfolio
    {
        public const decimal DefaultInitialBalance = 100_000.00m;

        private readonly object _syncLock = new();
        private readonly Dictionary<string, Position> _positions = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, StockTicker> _latestTickers = new(StringComparer.OrdinalIgnoreCase);
        private readonly List<TradeExecution> _tradeHistory = new();

        /// <summary>
        /// Gets the initial starting cash balance ($100,000 by default).
        /// </summary>
        public decimal InitialBalance { get; private set; }

        /// <summary>
        /// Gets the current available uninvested cash balance.
        /// </summary>
        public decimal CashBalance { get; private set; }

        /// <summary>
        /// Gets the total realized profit/loss from closed or trimmed positions.
        /// </summary>
        public decimal TotalRealizedPnL { get; private set; }

        /// <summary>
        /// Gets the total number of executed orders (Buys + Sells).
        /// </summary>
        public int TotalExecutedOrders
        {
            get
            {
                lock (_syncLock) return _tradeHistory.Count;
            }
        }

        /// <summary>
        /// Gets the current Win/Loss Ratio (Winning Trades / Losing Trades).
        /// </summary>
        public decimal WinLossRatio => GetTradeStatistics().WinLossRatio;

        /// <summary>
        /// Gets the average profit or loss per completed trade.
        /// </summary>
        public decimal AverageProfitPerTrade => GetTradeStatistics().AverageProfitPerTrade;

        /// <summary>
        /// Gets cumulative trade execution statistics.
        /// </summary>
        public TradeStatistics Statistics => GetTradeStatistics();

        /// <summary>
        /// Fired whenever an incoming stock ticker updates a price in the portfolio.
        /// </summary>
        public event EventHandler<PriceUpdatedEventArgs>? PriceUpdated;

        /// <summary>
        /// Fired whenever a buy or sell trade is successfully executed.
        /// </summary>
        public event EventHandler<TradeExecutedEventArgs>? TradeExecuted;

        /// <summary>
        /// Fired whenever the overall portfolio valuation or cash balance shifts.
        /// </summary>
        public event EventHandler<PortfolioUpdatedEventArgs>? PortfolioUpdated;

        /// <summary>
        /// Initializes a new instance of the <see cref="Portfolio"/> class with $100,000 baseline cash.
        /// </summary>
        /// <param name="initialCash">Starting cash balance (defaults to $100,000.00).</param>
        public Portfolio(decimal initialCash = DefaultInitialBalance)
        {
            if (initialCash <= 0m)
                throw new ArgumentOutOfRangeException(nameof(initialCash), "Initial portfolio balance must be strictly positive.");

            InitialBalance = initialCash;
            CashBalance = initialCash;
            TotalRealizedPnL = 0m;
        }

        #region Market Price Ingestion

        /// <summary>
        /// Ingests an incoming market stock price ticker.
        /// Stores latest market price, refreshes existing open positions, and updates valuations.
        /// </summary>
        /// <param name="ticker">Incoming stock ticker with current price.</param>
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

        /// <summary>
        /// Batch processes multiple incoming market stock price tickers.
        /// </summary>
        /// <param name="tickers">Collection of incoming stock tickers.</param>
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

        /// <summary>
        /// Executes a BUY order for the specified stock ticker symbol.
        /// Validates cash balance, computes new weighted average cost basis, deducts funds,
        /// and records the execution in the running metrics log.
        /// </summary>
        /// <param name="symbol">Stock symbol (e.g. "AAPL", "NVDA").</param>
        /// <param name="shares">Number of shares to purchase.</param>
        /// <param name="executionPrice">Optional execution price (defaults to latest ticker price).</param>
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

                // Deduct cash balance
                CashBalance -= totalCost;

                // Update or create Position using weighted average cost basis formula:
                // NewAvg = ((OldShares * OldAvg) + (NewShares * NewPrice)) / (OldShares + NewShares)
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

                // Compute running metrics at this order fill
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

        /// <summary>
        /// Executes a SELL order for the specified stock ticker symbol.
        /// Validates share holdings, calculates realized P&amp;L, credits cash, trims/closes position,
        /// and updates the running log of past execution metrics (Win/Loss ratio, average profit per trade, total executed orders).
        /// </summary>
        /// <param name="symbol">Stock symbol (e.g. "AAPL", "NVDA").</param>
        /// <param name="shares">Number of shares to sell.</param>
        /// <param name="executionPrice">Optional execution price (defaults to latest ticker price).</param>
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

                // Credit cash and accrue realized P&L
                CashBalance += grossProceeds;
                TotalRealizedPnL += realizedPnL;

                // Update position
                existing.Shares -= shares;
                existing.CurrentPrice = price;
                existing.LastUpdated = DateTimeOffset.UtcNow;

                if (existing.Shares == 0m)
                {
                    _positions.Remove(symbol);
                }

                // Compute updated running execution metrics
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

        /// <summary>
        /// Calculates comprehensive trade execution statistics across all executed orders.
        /// Tracks Win/Loss Ratio, average profit per trade, and total executed orders.
        /// </summary>
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

        /// <summary>
        /// Gets the current market price for a symbol from latest tickers or active positions.
        /// </summary>
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

        /// <summary>
        /// Retrieves the current open position for a given symbol, if any.
        /// </summary>
        public Position? GetPosition(string symbol)
        {
            lock (_syncLock)
            {
                return _positions.TryGetValue(symbol.Trim().ToUpperInvariant(), out var pos) ? pos : null;
            }
        }

        /// <summary>
        /// Gets all active open positions in the portfolio.
        /// </summary>
        public IReadOnlyList<Position> GetPositions()
        {
            lock (_syncLock)
            {
                return _positions.Values.ToList().AsReadOnly();
            }
        }

        /// <summary>
        /// Gets the chronological list of all executed trades and running metric snapshots.
        /// </summary>
        public IReadOnlyList<TradeExecution> GetTradeHistory()
        {
            lock (_syncLock)
            {
                return _tradeHistory.ToList().AsReadOnly();
            }
        }

        /// <summary>
        /// Generates an immutable snapshot of total portfolio valuation, balances, P&amp;L, and trade stats.
        /// </summary>
        public PortfolioSnapshot GetSnapshot()
        {
            lock (_syncLock)
            {
                return CreateSnapshotInternal();
            }
        }

        /// <summary>
        /// Resets the portfolio back to pristine starting cash ($100,000) and closes all positions and history.
        /// </summary>
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

        /// <summary>
        /// Phase 3 The Vault: Hydrates portfolio state and trade history directly from SQLite apextrade.db.
        /// </summary>
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

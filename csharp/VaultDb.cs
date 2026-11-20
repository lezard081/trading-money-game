// <copyright file="VaultDb.cs" company="ApexTrade">
// Copyright (c) 2026 ApexTrade. All rights reserved.
// Licensed under the Apache License, Version 2.0.
// </copyright>

using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace ApexTrade.Core
{
    public sealed record VaultStatus
    {
        public string DatabasePath { get; init; } = string.Empty;
        public string DatabaseFileName { get; init; } = "apextrade.db";
        public bool Exists { get; init; }
        public long FileSizeBytes { get; init; }
        public int PortfolioStateRows { get; init; }
        public int TradeHistoryRows { get; init; }
        public int SignalsRows { get; init; }
        public int PendingSignalsCount { get; init; }
        public int ExecutionLogsRows { get; init; }
        public string LastUpdated { get; init; } = string.Empty;
        public bool IsHealthy { get; init; } = true;
    }

    public sealed record TradingSignal
    {
        public long Id { get; init; }
        public string Symbol { get; init; } = string.Empty;
        public string Side { get; init; } = "BUY";
        public decimal Quantity { get; init; }
        public string Type { get; init; } = "market";
        public decimal Price { get; init; }
        public string Status { get; init; } = "PENDING";
        public string CreatedAt { get; init; } = string.Empty;
        public string? Response { get; init; }
    }

    public sealed record ExecutionLogRecord
    {
        public long Id { get; init; }
        public long? SignalId { get; init; }
        public string? OrderId { get; init; }
        public string Symbol { get; init; } = string.Empty;
        public string Action { get; init; } = string.Empty;
        public int StatusCode { get; init; }
        public string RawResponse { get; init; } = string.Empty;
        public string CreatedAt { get; init; } = string.Empty;
    }

    /// <summary>
    /// Phase 3: The Vault SQLite Database Engine for ApexTrade.
    /// Manages the local SQLite database 'apextrade.db' with 'PortfolioState' and 'TradeHistory' schemas.
    /// </summary>
    public static class VaultDb
    {
        public const string DefaultDbFileName = "apextrade.db";

        /// <summary>
        /// Locates or establishes the absolute path for 'apextrade.db'.
        /// Searches current directory, repo root, or environment override.
        /// </summary>
        public static string ResolveDatabasePath(string? requestedPath = null)
        {
            if (!string.IsNullOrWhiteSpace(requestedPath))
            {
                return Path.GetFullPath(requestedPath);
            }

            string? envPath = Environment.GetEnvironmentVariable("APEXTRADE_DB_PATH");
            if (!string.IsNullOrWhiteSpace(envPath))
            {
                return Path.GetFullPath(envPath);
            }

            // Check if current directory or parent directory has or should have apextrade.db
            string currentDir = Directory.GetCurrentDirectory();
            string localDb = Path.Combine(currentDir, DefaultDbFileName);
            if (File.Exists(localDb))
            {
                return localDb;
            }

            // Check parent directory (e.g. when run from csharp/ApexTrade.Portfolio)
            string parentDb = Path.Combine(currentDir, "..", DefaultDbFileName);
            if (File.Exists(parentDb))
            {
                return Path.GetFullPath(parentDb);
            }

            string grandParentDb = Path.Combine(currentDir, "..", "..", DefaultDbFileName);
            if (File.Exists(grandParentDb))
            {
                return Path.GetFullPath(grandParentDb);
            }

            // Default to localDb in root or working dir
            return localDb;
        }

        private static string GetConnectionString(string dbPath)
        {
            var builder = new SqliteConnectionStringBuilder
            {
                DataSource = dbPath,
                Mode = SqliteOpenMode.ReadWriteCreate,
                Cache = SqliteCacheMode.Shared
            };
            return builder.ConnectionString;
        }

        /// <summary>
        /// Ensures the SQLite database and the two required schemas 'PortfolioState' and 'TradeHistory' exist.
        /// </summary>
        public static void EnsureDatabaseInitialized(string dbPath)
        {
            string dir = Path.GetDirectoryName(dbPath) ?? string.Empty;
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                PRAGMA journal_mode = WAL;

                -- Schema 1: PortfolioState table (stores current Cash Reserves, total equity, returns, and serialized positions)
                CREATE TABLE IF NOT EXISTS PortfolioState (
                    Id INTEGER PRIMARY KEY,
                    CashReserves REAL NOT NULL,
                    InitialBalance REAL NOT NULL,
                    InvestedValue REAL NOT NULL,
                    TotalEquity REAL NOT NULL,
                    TotalRealizedPnL REAL NOT NULL,
                    TotalUnrealizedPnL REAL NOT NULL,
                    TotalNetPnL REAL NOT NULL,
                    TotalReturnPercent REAL NOT NULL,
                    OpenPositionsCount INTEGER NOT NULL,
                    PositionsJson TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL
                );

                -- Schema 2: TradeHistory table (logs all past orders, prices, quantities, and running P&L metrics)
                CREATE TABLE IF NOT EXISTS TradeHistory (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    TradeId TEXT NOT NULL UNIQUE,
                    Timestamp TEXT NOT NULL,
                    Symbol TEXT NOT NULL,
                    Side TEXT NOT NULL,
                    Shares REAL NOT NULL,
                    ExecutionPrice REAL NOT NULL,
                    TotalAmount REAL NOT NULL,
                    RealizedPnL REAL NOT NULL,
                    RemainingCashBalance REAL NOT NULL,
                    RunningOrderCount INTEGER NOT NULL,
                    RunningAverageProfitPerTrade REAL NOT NULL,
                    RunningWinLossRatio REAL NOT NULL,
                    RunningWinRatePercent REAL NOT NULL,
                    RunningPortfolioValue REAL NOT NULL,
                    RunningRealizedPnL REAL NOT NULL,
                    RunningInvestedValue REAL NOT NULL,
                    CreatedAt TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_tradehistory_timestamp ON TradeHistory(Timestamp);
                CREATE INDEX IF NOT EXISTS idx_tradehistory_symbol ON TradeHistory(Symbol);

                -- Schema 3: signals table (Phase 4: Automated Trading Trigger & Tradier Bridge)
                CREATE TABLE IF NOT EXISTS signals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    side TEXT NOT NULL,
                    quantity REAL NOT NULL,
                    type TEXT NOT NULL,
                    price REAL NOT NULL,
                    status TEXT NOT NULL DEFAULT 'PENDING',
                    created_at TEXT NOT NULL,
                    response TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
                CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
                CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);

                -- Schema 4: execution_logs table (Phase 5: Sandbox Verification & Order Reconciliation)
                CREATE TABLE IF NOT EXISTS execution_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    signal_id INTEGER,
                    order_id TEXT,
                    symbol TEXT NOT NULL,
                    action TEXT NOT NULL,
                    status_code INTEGER,
                    raw_response TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(signal_id) REFERENCES signals(id)
                );

                CREATE INDEX IF NOT EXISTS idx_execution_logs_signal_id ON execution_logs(signal_id);
                CREATE INDEX IF NOT EXISTS idx_execution_logs_order_id ON execution_logs(order_id);
                CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON execution_logs(created_at);
            ";
            cmd.ExecuteNonQuery();
        }

        /// <summary>
        /// Persists the complete portfolio state to the PortfolioState table (ID = 1).
        /// </summary>
        public static void SavePortfolioState(string dbPath, PortfolioSnapshot snapshot)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            string positionsJson = JsonSerializer.Serialize(snapshot.Positions);

            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO PortfolioState (
                    Id, CashReserves, InitialBalance, InvestedValue, TotalEquity,
                    TotalRealizedPnL, TotalUnrealizedPnL, TotalNetPnL, TotalReturnPercent,
                    OpenPositionsCount, PositionsJson, UpdatedAt
                ) VALUES (
                    1, @CashReserves, @InitialBalance, @InvestedValue, @TotalEquity,
                    @TotalRealizedPnL, @TotalUnrealizedPnL, @TotalNetPnL, @TotalReturnPercent,
                    @OpenPositionsCount, @PositionsJson, @UpdatedAt
                )
                ON CONFLICT(Id) DO UPDATE SET
                    CashReserves = excluded.CashReserves,
                    InitialBalance = excluded.InitialBalance,
                    InvestedValue = excluded.InvestedValue,
                    TotalEquity = excluded.TotalEquity,
                    TotalRealizedPnL = excluded.TotalRealizedPnL,
                    TotalUnrealizedPnL = excluded.TotalUnrealizedPnL,
                    TotalNetPnL = excluded.TotalNetPnL,
                    TotalReturnPercent = excluded.TotalReturnPercent,
                    OpenPositionsCount = excluded.OpenPositionsCount,
                    PositionsJson = excluded.PositionsJson,
                    UpdatedAt = excluded.UpdatedAt;
            ";

            cmd.Parameters.AddWithValue("@CashReserves", (double)snapshot.CashBalance);
            cmd.Parameters.AddWithValue("@InitialBalance", (double)snapshot.InitialBalance);
            cmd.Parameters.AddWithValue("@InvestedValue", (double)snapshot.InvestedValue);
            cmd.Parameters.AddWithValue("@TotalEquity", (double)snapshot.TotalPortfolioValue);
            cmd.Parameters.AddWithValue("@TotalRealizedPnL", (double)snapshot.TotalRealizedPnL);
            cmd.Parameters.AddWithValue("@TotalUnrealizedPnL", (double)snapshot.TotalUnrealizedPnL);
            cmd.Parameters.AddWithValue("@TotalNetPnL", (double)snapshot.TotalNetPnL);
            cmd.Parameters.AddWithValue("@TotalReturnPercent", (double)snapshot.TotalReturnPercent);
            cmd.Parameters.AddWithValue("@OpenPositionsCount", snapshot.OpenPositionsCount);
            cmd.Parameters.AddWithValue("@PositionsJson", positionsJson);
            cmd.Parameters.AddWithValue("@UpdatedAt", DateTimeOffset.UtcNow.ToString("o"));

            cmd.ExecuteNonQuery();
        }

        /// <summary>
        /// Inserts or replaces a trade execution record into the TradeHistory table.
        /// </summary>
        public static void SaveTrade(
            string dbPath,
            TradeExecution trade,
            decimal runningPortfolioVal,
            decimal runningRealizedPnL,
            decimal runningInvestedVal)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                INSERT OR REPLACE INTO TradeHistory (
                    TradeId, Timestamp, Symbol, Side, Shares, ExecutionPrice,
                    TotalAmount, RealizedPnL, RemainingCashBalance, RunningOrderCount,
                    RunningAverageProfitPerTrade, RunningWinLossRatio, RunningWinRatePercent,
                    RunningPortfolioValue, RunningRealizedPnL, RunningInvestedValue, CreatedAt
                ) VALUES (
                    @TradeId, @Timestamp, @Symbol, @Side, @Shares, @ExecutionPrice,
                    @TotalAmount, @RealizedPnL, @RemainingCashBalance, @RunningOrderCount,
                    @RunningAverageProfitPerTrade, @RunningWinLossRatio, @RunningWinRatePercent,
                    @RunningPortfolioValue, @RunningRealizedPnL, @RunningInvestedValue, @CreatedAt
                );
            ";

            cmd.Parameters.AddWithValue("@TradeId", trade.TradeId.ToString());
            cmd.Parameters.AddWithValue("@Timestamp", trade.Timestamp.ToString("HH:mm:ss"));
            cmd.Parameters.AddWithValue("@Symbol", trade.Symbol);
            cmd.Parameters.AddWithValue("@Side", trade.Side.ToString().ToUpperInvariant());
            cmd.Parameters.AddWithValue("@Shares", (double)trade.Shares);
            cmd.Parameters.AddWithValue("@ExecutionPrice", (double)trade.ExecutionPrice);
            cmd.Parameters.AddWithValue("@TotalAmount", (double)trade.TotalAmount);
            cmd.Parameters.AddWithValue("@RealizedPnL", (double)trade.RealizedPnL);
            cmd.Parameters.AddWithValue("@RemainingCashBalance", (double)trade.RemainingCashBalance);
            cmd.Parameters.AddWithValue("@RunningOrderCount", trade.RunningOrderCount);
            cmd.Parameters.AddWithValue("@RunningAverageProfitPerTrade", (double)trade.RunningAverageProfitPerTrade);
            cmd.Parameters.AddWithValue("@RunningWinLossRatio", (double)trade.RunningWinLossRatio);
            cmd.Parameters.AddWithValue("@RunningWinRatePercent", (double)trade.RunningWinRatePercent);
            cmd.Parameters.AddWithValue("@RunningPortfolioValue", (double)runningPortfolioVal);
            cmd.Parameters.AddWithValue("@RunningRealizedPnL", (double)runningRealizedPnL);
            cmd.Parameters.AddWithValue("@RunningInvestedValue", (double)runningInvestedVal);
            cmd.Parameters.AddWithValue("@CreatedAt", DateTimeOffset.UtcNow.ToString("o"));

            cmd.ExecuteNonQuery();
        }

        /// <summary>
        /// Batch saves a sequence of trades into TradeHistory inside a single SQLite transaction.
        /// </summary>
        public static void SaveAllTrades(string dbPath, IEnumerable<TradeExecution> trades, Portfolio portfolio)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var transaction = connection.BeginTransaction();

            foreach (var trade in trades)
            {
                using var cmd = connection.CreateCommand();
                cmd.Transaction = transaction;
                cmd.CommandText = @"
                    INSERT OR REPLACE INTO TradeHistory (
                        TradeId, Timestamp, Symbol, Side, Shares, ExecutionPrice,
                        TotalAmount, RealizedPnL, RemainingCashBalance, RunningOrderCount,
                        RunningAverageProfitPerTrade, RunningWinLossRatio, RunningWinRatePercent,
                        RunningPortfolioValue, RunningRealizedPnL, RunningInvestedValue, CreatedAt
                    ) VALUES (
                        @TradeId, @Timestamp, @Symbol, @Side, @Shares, @ExecutionPrice,
                        @TotalAmount, @RealizedPnL, @RemainingCashBalance, @RunningOrderCount,
                        @RunningAverageProfitPerTrade, @RunningWinLossRatio, @RunningWinRatePercent,
                        @RunningPortfolioValue, @RunningRealizedPnL, @RunningInvestedValue, @CreatedAt
                    );
                ";

                cmd.Parameters.AddWithValue("@TradeId", trade.TradeId.ToString());
                cmd.Parameters.AddWithValue("@Timestamp", trade.Timestamp.ToString("HH:mm:ss"));
                cmd.Parameters.AddWithValue("@Symbol", trade.Symbol);
                cmd.Parameters.AddWithValue("@Side", trade.Side.ToString().ToUpperInvariant());
                cmd.Parameters.AddWithValue("@Shares", (double)trade.Shares);
                cmd.Parameters.AddWithValue("@ExecutionPrice", (double)trade.ExecutionPrice);
                cmd.Parameters.AddWithValue("@TotalAmount", (double)trade.TotalAmount);
                cmd.Parameters.AddWithValue("@RealizedPnL", (double)trade.RealizedPnL);
                cmd.Parameters.AddWithValue("@RemainingCashBalance", (double)trade.RemainingCashBalance);
                cmd.Parameters.AddWithValue("@RunningOrderCount", trade.RunningOrderCount);
                cmd.Parameters.AddWithValue("@RunningAverageProfitPerTrade", (double)trade.RunningAverageProfitPerTrade);
                cmd.Parameters.AddWithValue("@RunningWinLossRatio", (double)trade.RunningWinLossRatio);
                cmd.Parameters.AddWithValue("@RunningWinRatePercent", (double)trade.RunningWinRatePercent);
                cmd.Parameters.AddWithValue("@RunningPortfolioValue", (double)(trade.RemainingCashBalance + (trade.Shares * trade.ExecutionPrice)));
                cmd.Parameters.AddWithValue("@RunningRealizedPnL", (double)portfolio.TotalRealizedPnL);
                cmd.Parameters.AddWithValue("@RunningInvestedValue", (double)portfolio.GetSnapshot().InvestedValue);
                cmd.Parameters.AddWithValue("@CreatedAt", DateTimeOffset.UtcNow.ToString("o"));

                cmd.ExecuteNonQuery();
            }

            transaction.Commit();
        }

        /// <summary>
        /// Reads the persisted TradeHistory from SQLite ordered chronologically.
        /// </summary>
        public static List<TradeExecution> ReadTradeHistory(string dbPath)
        {
            var trades = new List<TradeExecution>();
            if (!File.Exists(dbPath)) return trades;

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                SELECT TradeId, Timestamp, Symbol, Side, Shares, ExecutionPrice,
                       RealizedPnL, RemainingCashBalance, RunningOrderCount,
                       RunningAverageProfitPerTrade, RunningWinLossRatio, RunningWinRatePercent
                FROM TradeHistory
                ORDER BY Id ASC;
            ";

            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                string tradeIdStr = reader.GetString(0);
                Guid.TryParse(tradeIdStr, out var tradeId);
                string timeStr = reader.GetString(1);
                string symbol = reader.GetString(2);
                string sideStr = reader.GetString(3);
                var side = sideStr.Equals("SELL", StringComparison.OrdinalIgnoreCase) ? OrderSide.Sell : OrderSide.Buy;
                decimal shares = Convert.ToDecimal(reader.GetDouble(4));
                decimal price = Convert.ToDecimal(reader.GetDouble(5));
                decimal realizedPnL = Convert.ToDecimal(reader.GetDouble(6));
                decimal remainingCash = Convert.ToDecimal(reader.GetDouble(7));
                int runningCount = reader.GetInt32(8);
                decimal avgProfit = Convert.ToDecimal(reader.GetDouble(9));
                decimal wlRatio = Convert.ToDecimal(reader.GetDouble(10));
                decimal winRate = Convert.ToDecimal(reader.GetDouble(11));

                DateTimeOffset timestamp = DateTimeOffset.UtcNow;
                if (TimeSpan.TryParse(timeStr, out var timeSpan))
                {
                    timestamp = DateTimeOffset.UtcNow.Date.Add(timeSpan);
                }

                trades.Add(new TradeExecution
                {
                    TradeId = tradeId != Guid.Empty ? tradeId : Guid.NewGuid(),
                    Timestamp = timestamp,
                    Symbol = symbol,
                    Side = side,
                    Shares = shares,
                    ExecutionPrice = price,
                    RealizedPnL = realizedPnL,
                    RemainingCashBalance = remainingCash,
                    RunningOrderCount = runningCount,
                    RunningAverageProfitPerTrade = avgProfit,
                    RunningWinLossRatio = wlRatio,
                    RunningWinRatePercent = winRate
                });
            }

            return trades;
        }

        /// <summary>
        /// Loads the saved PortfolioState row from SQLite if available.
        /// </summary>
        public static (bool found, decimal cashReserves, decimal initialBalance, decimal realizedPnL, List<Position> positions, string updatedAt) LoadPortfolioState(string dbPath)
        {
            if (!File.Exists(dbPath))
            {
                return (false, 100_000m, 100_000m, 0m, new List<Position>(), string.Empty);
            }

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                SELECT CashReserves, InitialBalance, TotalRealizedPnL, PositionsJson, UpdatedAt
                FROM PortfolioState
                WHERE Id = 1;
            ";

            using var reader = cmd.ExecuteReader();
            if (reader.Read())
            {
                decimal cashReserves = Convert.ToDecimal(reader.GetDouble(0));
                decimal initialBalance = Convert.ToDecimal(reader.GetDouble(1));
                decimal realizedPnL = Convert.ToDecimal(reader.GetDouble(2));
                string positionsJson = reader.GetString(3);
                string updatedAt = reader.GetString(4);

                var positions = new List<Position>();
                if (!string.IsNullOrWhiteSpace(positionsJson))
                {
                    try
                    {
                        var deserialized = JsonSerializer.Deserialize<List<Position>>(positionsJson);
                        if (deserialized != null) positions = deserialized;
                    }
                    catch
                    {
                        // Fallback empty
                    }
                }

                return (true, cashReserves, initialBalance, realizedPnL, positions, updatedAt);
            }

            return (false, 100_000m, 100_000m, 0m, new List<Position>(), string.Empty);
        }

        /// <summary>
        /// Clears SQLite tables and resets portfolio state to initial $100,000 cash balance.
        /// </summary>
        public static void ResetDatabase(string dbPath, decimal initialBalance = 100_000m)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                DELETE FROM TradeHistory;
                DELETE FROM PortfolioState;

                INSERT INTO PortfolioState (
                    Id, CashReserves, InitialBalance, InvestedValue, TotalEquity,
                    TotalRealizedPnL, TotalUnrealizedPnL, TotalNetPnL, TotalReturnPercent,
                    OpenPositionsCount, PositionsJson, UpdatedAt
                ) VALUES (
                    1, @CashReserves, @InitialBalance, 0, @TotalEquity,
                    0, 0, 0, 0,
                    0, '[]', @UpdatedAt
                );
            ";

            cmd.Parameters.AddWithValue("@CashReserves", (double)initialBalance);
            cmd.Parameters.AddWithValue("@InitialBalance", (double)initialBalance);
            cmd.Parameters.AddWithValue("@TotalEquity", (double)initialBalance);
            cmd.Parameters.AddWithValue("@UpdatedAt", DateTimeOffset.UtcNow.ToString("o"));

            cmd.ExecuteNonQuery();
        }

        /// <summary>
        /// Returns diagnostic metadata and row counts for apextrade.db.
        /// </summary>
        public static VaultStatus GetVaultStatus(string dbPath)
        {
            string resolvedPath = ResolveDatabasePath(dbPath);
            bool exists = File.Exists(resolvedPath);
            long size = exists ? new FileInfo(resolvedPath).Length : 0;
            int portfolioRows = 0;
            int tradeRows = 0;
            int signalRows = 0;
            int pendingSignalRows = 0;
            string lastUpdated = string.Empty;

            if (exists)
            {
                try
                {
                    using var connection = new SqliteConnection(GetConnectionString(resolvedPath));
                    connection.Open();

                    using var cmd1 = connection.CreateCommand();
                    cmd1.CommandText = "SELECT COUNT(*), MAX(UpdatedAt) FROM PortfolioState;";
                    using var r1 = cmd1.ExecuteReader();
                    if (r1.Read())
                    {
                        portfolioRows = r1.GetInt32(0);
                        if (!r1.IsDBNull(1)) lastUpdated = r1.GetString(1);
                    }

                    using var cmd2 = connection.CreateCommand();
                    cmd2.CommandText = "SELECT COUNT(*) FROM TradeHistory;";
                    using var r2 = cmd2.ExecuteReader();
                    if (r2.Read())
                    {
                        tradeRows = r2.GetInt32(0);
                    }

                    using var cmd3 = connection.CreateCommand();
                    cmd3.CommandText = "SELECT COUNT(*), COUNT(CASE WHEN status = 'PENDING' THEN 1 END) FROM signals;";
                    using var r3 = cmd3.ExecuteReader();
                    if (r3.Read())
                    {
                        signalRows = r3.GetInt32(0);
                        pendingSignalRows = r3.IsDBNull(1) ? 0 : r3.GetInt32(1);
                    }

                    int executionLogRows = 0;
                    using var cmd4 = connection.CreateCommand();
                    cmd4.CommandText = "SELECT COUNT(*) FROM execution_logs;";
                    using var r4 = cmd4.ExecuteReader();
                    if (r4.Read())
                    {
                        executionLogRows = r4.GetInt32(0);
                    }

                    return new VaultStatus
                    {
                        DatabasePath = resolvedPath,
                        DatabaseFileName = Path.GetFileName(resolvedPath),
                        Exists = exists,
                        FileSizeBytes = size,
                        PortfolioStateRows = portfolioRows,
                        TradeHistoryRows = tradeRows,
                        SignalsRows = signalRows,
                        PendingSignalsCount = pendingSignalRows,
                        ExecutionLogsRows = executionLogRows,
                        LastUpdated = string.IsNullOrEmpty(lastUpdated) ? DateTimeOffset.UtcNow.ToString("o") : lastUpdated,
                        IsHealthy = true
                    };
                }
                catch
                {
                    // Ignore inspection errors
                }
            }

            return new VaultStatus
            {
                DatabasePath = resolvedPath,
                DatabaseFileName = Path.GetFileName(resolvedPath),
                Exists = exists,
                FileSizeBytes = size,
                PortfolioStateRows = portfolioRows,
                TradeHistoryRows = tradeRows,
                SignalsRows = signalRows,
                PendingSignalsCount = pendingSignalRows,
                ExecutionLogsRows = 0,
                LastUpdated = string.IsNullOrEmpty(lastUpdated) ? DateTimeOffset.UtcNow.ToString("o") : lastUpdated,
                IsHealthy = true
            };
        }

        /// <summary>
        /// Inserts a new automated trading trigger signal into the 'signals' table with status 'PENDING'.
        /// Returns the auto-generated signal ID.
        /// </summary>
        public static long InsertSignal(
            string dbPath,
            string symbol,
            string side,
            decimal quantity,
            string type,
            decimal price)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO signals (
                    symbol, side, quantity, type, price, status, created_at, response
                ) VALUES (
                    @symbol, @side, @quantity, @type, @price, 'PENDING', @created_at, NULL
                );
                SELECT last_insert_rowid();
            ";

            cmd.Parameters.AddWithValue("@symbol", symbol.ToUpperInvariant());
            cmd.Parameters.AddWithValue("@side", side.ToUpperInvariant());
            cmd.Parameters.AddWithValue("@quantity", (double)quantity);
            cmd.Parameters.AddWithValue("@type", type.ToLowerInvariant());
            cmd.Parameters.AddWithValue("@price", (double)price);
            cmd.Parameters.AddWithValue("@created_at", DateTimeOffset.UtcNow.ToString("o"));

            object? result = cmd.ExecuteScalar();
            return result != null && long.TryParse(result.ToString(), out long id) ? id : 0;
        }

        /// <summary>
        /// Checks whether a PENDING signal already exists for the given symbol to prevent duplicate orders.
        /// </summary>
        public static bool HasPendingSignalForSymbol(string dbPath, string symbol)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT COUNT(*) FROM signals WHERE symbol = @symbol AND status = 'PENDING';";
            cmd.Parameters.AddWithValue("@symbol", symbol.ToUpperInvariant());

            long count = Convert.ToInt64(cmd.ExecuteScalar() ?? 0);
            return count > 0;
        }

        /// <summary>
        /// Reads trading signals from the 'signals' table.
        /// </summary>
        public static List<TradingSignal> GetSignals(string dbPath, int limit = 100, string? statusFilter = null)
        {
            EnsureDatabaseInitialized(dbPath);
            var list = new List<TradingSignal>();

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            if (!string.IsNullOrWhiteSpace(statusFilter))
            {
                cmd.CommandText = "SELECT id, symbol, side, quantity, type, price, status, created_at, response FROM signals WHERE status = @status ORDER BY id DESC LIMIT @limit;";
                cmd.Parameters.AddWithValue("@status", statusFilter.ToUpperInvariant());
            }
            else
            {
                cmd.CommandText = "SELECT id, symbol, side, quantity, type, price, status, created_at, response FROM signals ORDER BY id DESC LIMIT @limit;";
            }
            cmd.Parameters.AddWithValue("@limit", limit);

            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                list.Add(new TradingSignal
                {
                    Id = reader.GetInt64(0),
                    Symbol = reader.GetString(1),
                    Side = reader.GetString(2),
                    Quantity = (decimal)reader.GetDouble(3),
                    Type = reader.GetString(4),
                    Price = (decimal)reader.GetDouble(5),
                    Status = reader.GetString(6),
                    CreatedAt = reader.GetString(7),
                    Response = reader.IsDBNull(8) ? null : reader.GetString(8)
                });
            }

            return list;
        }

        /// <summary>
        /// Updates the status and execution response payload of a signal in the 'signals' table.
        /// </summary>
        public static bool UpdateSignalStatus(string dbPath, long id, string status, string? responseText)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = "UPDATE signals SET status = @status, response = @response WHERE id = @id;";
            cmd.Parameters.AddWithValue("@status", status.ToUpperInvariant());
            cmd.Parameters.AddWithValue("@response", (object?)responseText ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@id", id);

            int rows = cmd.ExecuteNonQuery();
            return rows > 0;
        }

        /// <summary>
        /// Clears all records from the 'signals' table.
        /// </summary>
        public static void ClearSignals(string dbPath)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = "DELETE FROM signals;";
            cmd.ExecuteNonQuery();
        }

        /// <summary>
        /// Inserts a new API execution or reconciliation log into 'execution_logs'.
        /// </summary>
        public static long InsertExecutionLog(
            string dbPath,
            long? signalId,
            string? orderId,
            string symbol,
            string action,
            int statusCode,
            string rawResponse)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO execution_logs (signal_id, order_id, symbol, action, status_code, raw_response, created_at)
                VALUES (@signal_id, @order_id, @symbol, @action, @status_code, @raw_response, CURRENT_TIMESTAMP);
                SELECT last_insert_rowid();
            ";
            cmd.Parameters.AddWithValue("@signal_id", (object?)signalId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@order_id", (object?)orderId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@symbol", symbol.ToUpperInvariant());
            cmd.Parameters.AddWithValue("@action", action.ToUpperInvariant());
            cmd.Parameters.AddWithValue("@status_code", statusCode);
            cmd.Parameters.AddWithValue("@raw_response", rawResponse ?? string.Empty);

            object? scalar = cmd.ExecuteScalar();
            return scalar is long l ? l : Convert.ToInt64(scalar);
        }

        /// <summary>
        /// Retrieves the most recent execution logs from 'execution_logs'.
        /// </summary>
        public static List<ExecutionLogRecord> GetExecutionLogs(string dbPath, int limit = 50)
        {
            EnsureDatabaseInitialized(dbPath);

            var list = new List<ExecutionLogRecord>();
            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                SELECT id, signal_id, order_id, symbol, action, status_code, raw_response, created_at
                FROM execution_logs
                ORDER BY id DESC
                LIMIT @limit;
            ";
            cmd.Parameters.AddWithValue("@limit", limit);

            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                list.Add(new ExecutionLogRecord
                {
                    Id = reader.GetInt64(0),
                    SignalId = reader.IsDBNull(1) ? null : reader.GetInt64(1),
                    OrderId = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Symbol = reader.GetString(3),
                    Action = reader.GetString(4),
                    StatusCode = reader.GetInt32(5),
                    RawResponse = reader.GetString(6),
                    CreatedAt = reader.GetString(7)
                });
            }

            return list;
        }

        /// <summary>
        /// Clears all execution audit logs.
        /// </summary>
        public static void ClearExecutionLogs(string dbPath)
        {
            EnsureDatabaseInitialized(dbPath);

            using var connection = new SqliteConnection(GetConnectionString(dbPath));
            connection.Open();

            using var cmd = connection.CreateCommand();
            cmd.CommandText = "DELETE FROM execution_logs;";
            cmd.ExecuteNonQuery();
        }
    }
}

using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using ApexTrade.Core;

namespace ApexTrade
{
    public static class Program
    {
        public static void Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            bool jsonMode = args.Any(a => a.Equals("--json", StringComparison.OrdinalIgnoreCase));
            bool loadBenchmarkMode = args.Any(a => a.Equals("--load-benchmark", StringComparison.OrdinalIgnoreCase) || a.Equals("--benchmark", StringComparison.OrdinalIgnoreCase));
            bool readDbMode = args.Any(a => a.Equals("--read-db", StringComparison.OrdinalIgnoreCase) || a.Equals("--read", StringComparison.OrdinalIgnoreCase));
            bool resetDbMode = args.Any(a => a.Equals("--reset-db", StringComparison.OrdinalIgnoreCase) || a.Equals("--reset", StringComparison.OrdinalIgnoreCase));
            bool dbStatusMode = args.Any(a => a.Equals("--db-status", StringComparison.OrdinalIgnoreCase) || a.Equals("--status", StringComparison.OrdinalIgnoreCase));
            bool tradeMode = args.Any(a => a.Equals("--trade", StringComparison.OrdinalIgnoreCase));
            bool triggerEngineMode = args.Any(a => a.Equals("--trigger-engine", StringComparison.OrdinalIgnoreCase) || a.Equals("--evaluate-triggers", StringComparison.OrdinalIgnoreCase));
            bool simulateDipMode = args.Any(a => a.Equals("--simulate-dip", StringComparison.OrdinalIgnoreCase));
            bool evaluatePriceMode = args.Any(a => a.Equals("--evaluate-price", StringComparison.OrdinalIgnoreCase));
            bool getSignalsMode = args.Any(a => a.Equals("--get-signals", StringComparison.OrdinalIgnoreCase) || a.Equals("--signals", StringComparison.OrdinalIgnoreCase));
            bool clearSignalsMode = args.Any(a => a.Equals("--clear-signals", StringComparison.OrdinalIgnoreCase));
            bool getExecutionLogsMode = args.Any(a => a.Equals("--get-execution-logs", StringComparison.OrdinalIgnoreCase) || a.Equals("--execution-logs", StringComparison.OrdinalIgnoreCase));
            bool clearExecutionLogsMode = args.Any(a => a.Equals("--clear-execution-logs", StringComparison.OrdinalIgnoreCase));
            bool simulateSpreadMode = args.Any(a => a.Equals("--simulate-spread", StringComparison.OrdinalIgnoreCase));

            // Custom DB path if provided via --db-path <path>
            string? customDbPath = null;
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i].Equals("--db-path", StringComparison.OrdinalIgnoreCase))
                {
                    customDbPath = args[i + 1];
                    break;
                }
            }

            // Phase 3 & 4: The Vault SQLite Database Path ('apextrade.db')
            string dbPath = VaultDb.ResolveDatabasePath(customDbPath);
            VaultDb.EnsureDatabaseInitialized(dbPath);

            // Handle --get-signals command
            if (getSignalsMode)
            {
                int limit = 50;
                int sigIdx = Array.FindIndex(args, a => a.Equals("--get-signals", StringComparison.OrdinalIgnoreCase) || a.Equals("--signals", StringComparison.OrdinalIgnoreCase));
                if (sigIdx >= 0 && sigIdx + 1 < args.Length && int.TryParse(args[sigIdx + 1], out int parsedLimit))
                {
                    limit = parsedLimit;
                }
                var signals = VaultDb.GetSignals(dbPath, limit);
                Console.WriteLine(JsonSerializer.Serialize(signals, new JsonSerializerOptions { WriteIndented = true }));
                return;
            }

            // Handle --clear-signals command
            if (clearSignalsMode)
            {
                VaultDb.ClearSignals(dbPath);
                if (jsonMode)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new { success = true, message = "Signals table cleared." }));
                }
                else
                {
                    Console.WriteLine("[THE VAULT] Signals table cleared.");
                }
                return;
            }

            // Handle --get-execution-logs [limit] command
            if (getExecutionLogsMode)
            {
                int limit = 50;
                int logIdx = Array.FindIndex(args, a => a.Equals("--get-execution-logs", StringComparison.OrdinalIgnoreCase) || a.Equals("--execution-logs", StringComparison.OrdinalIgnoreCase));
                if (logIdx >= 0 && logIdx + 1 < args.Length && int.TryParse(args[logIdx + 1], out int parsedLimit))
                {
                    limit = parsedLimit;
                }
                var logs = VaultDb.GetExecutionLogs(dbPath, limit);
                Console.WriteLine(JsonSerializer.Serialize(logs, new JsonSerializerOptions { WriteIndented = true }));
                return;
            }

            // Handle --clear-execution-logs command
            if (clearExecutionLogsMode)
            {
                VaultDb.ClearExecutionLogs(dbPath);
                if (jsonMode)
                {
                    Console.WriteLine(JsonSerializer.Serialize(new { success = true, message = "Execution logs table cleared." }));
                }
                else
                {
                    Console.WriteLine("[THE VAULT] Execution logs table cleared.");
                }
                return;
            }

            // Handle --simulate-dip <symbol> [dipPercent] [spreadPercent] or --simulate-spread <symbol> [dipPercent] [spreadPercent]
            if (simulateDipMode || simulateSpreadMode)
            {
                int simIdx = Array.FindIndex(args, a => a.Equals("--simulate-dip", StringComparison.OrdinalIgnoreCase) || a.Equals("--simulate-spread", StringComparison.OrdinalIgnoreCase));
                string symbol = "INTC";
                decimal dipPercent = -2.5m;
                decimal? spreadPercent = null;

                if (simIdx >= 0 && simIdx + 1 < args.Length && !args[simIdx + 1].StartsWith("--"))
                {
                    symbol = args[simIdx + 1].ToUpperInvariant();
                }

                if (simIdx >= 0 && simIdx + 2 < args.Length && decimal.TryParse(args[simIdx + 2], out decimal parsedDip))
                {
                    dipPercent = parsedDip;
                }

                if (simIdx >= 0 && simIdx + 3 < args.Length && decimal.TryParse(args[simIdx + 3], out decimal parsedSpread))
                {
                    spreadPercent = parsedSpread;
                }

                var dipResult = TradingTriggerEngine.SimulateTargetDip(dbPath, symbol, dipPercent, spreadPercent);
                if (jsonMode)
                {
                    Console.WriteLine(JsonSerializer.Serialize(dipResult, new JsonSerializerOptions { WriteIndented = true }));
                }
                else
                {
                    Console.WriteLine($"[TRIGGER ENGINE] Evaluated {dipResult.Symbol}: Triggered={dipResult.Triggered}, Change={dipResult.ChangePercent}%, Spread={dipResult.SpreadPercent}%, SignalId={dipResult.InsertedSignalId}");
                    Console.WriteLine($"[TRIGGER ENGINE] Reason: {dipResult.Reason}");
                }
                return;
            }

            // Handle --evaluate-price <symbol> <currentPrice> <prevClose> [shares] command
            if (evaluatePriceMode)
            {
                int evalIdx = Array.FindIndex(args, a => a.Equals("--evaluate-price", StringComparison.OrdinalIgnoreCase));
                if (evalIdx >= 0 && evalIdx + 3 < args.Length)
                {
                    string sym = args[evalIdx + 1].ToUpperInvariant();
                    if (decimal.TryParse(args[evalIdx + 2], out decimal curPrice) && decimal.TryParse(args[evalIdx + 3], out decimal prevClose))
                    {
                        decimal? qty = null;
                        if (evalIdx + 4 < args.Length && decimal.TryParse(args[evalIdx + 4], out decimal parsedQty))
                        {
                            qty = parsedQty;
                        }

                        var evalResult = TradingTriggerEngine.EvaluateAndTrigger(dbPath, sym, curPrice, prevClose, qty);
                        if (jsonMode)
                        {
                            Console.WriteLine(JsonSerializer.Serialize(evalResult, new JsonSerializerOptions { WriteIndented = true }));
                        }
                        else
                        {
                            Console.WriteLine($"[TRIGGER ENGINE] {evalResult.Symbol}: Triggered={evalResult.Triggered}, Change={evalResult.ChangePercent}%, SignalId={evalResult.InsertedSignalId}");
                        }
                        return;
                    }
                }
            }

            // Handle --trigger-engine (evaluates all target stocks: INTC, AMD, F with simulated or baseline dip)
            if (triggerEngineMode)
            {
                var targetResults = new List<TriggerEvaluationResult>();
                foreach (var sym in TradingTriggerEngine.TargetSymbols)
                {
                    // By default evaluate target stocks with realistic market fluctuation
                    // INTC dips -2.4%, AMD dips -2.1%, F dips -1.2% (demonstrating selectivity)
                    decimal simulatedDip = sym == "INTC" ? -2.4m : (sym == "AMD" ? -2.1m : -1.2m);
                    targetResults.Add(TradingTriggerEngine.SimulateTargetDip(dbPath, sym, simulatedDip));
                }

                if (jsonMode)
                {
                    Console.WriteLine(JsonSerializer.Serialize(targetResults, new JsonSerializerOptions { WriteIndented = true }));
                }
                else
                {
                    Console.WriteLine("[TRIGGER ENGINE] Target Stock Evaluation (Rule: Dip >= 2.0%):");
                    foreach (var res in targetResults)
                    {
                        Console.WriteLine($"  [{res.Symbol}] Drop: {res.ChangePercent}% | Triggered: {res.Triggered} | SignalId: {res.InsertedSignalId}");
                    }
                }
                return;
            }

            // Handle --db-status command
            if (dbStatusMode)
            {
                var status = VaultDb.GetVaultStatus(dbPath);
                if (jsonMode)
                {
                    Console.WriteLine(JsonSerializer.Serialize(status, new JsonSerializerOptions { WriteIndented = true }));
                }
                else
                {
                    Console.WriteLine($"[THE VAULT] Database: {status.DatabasePath}");
                    Console.WriteLine($"[THE VAULT] File Size: {status.FileSizeBytes:N0} bytes");
                    Console.WriteLine($"[THE VAULT] PortfolioState Rows: {status.PortfolioStateRows}");
                    Console.WriteLine($"[THE VAULT] TradeHistory Rows: {status.TradeHistoryRows}");
                    Console.WriteLine($"[THE VAULT] Last Updated: {status.LastUpdated}");
                }
                return;
            }

            // Handle --reset-db [seedCash] command
            if (resetDbMode)
            {
                decimal seedCash = 250.00m; // Default small starting seed ($100 - $500 bankroll)
                int resetIdx = Array.FindIndex(args, a => a.Equals("--reset-db", StringComparison.OrdinalIgnoreCase));
                if (resetIdx >= 0 && resetIdx + 1 < args.Length && decimal.TryParse(args[resetIdx + 1], out decimal parsedSeed))
                {
                    seedCash = parsedSeed;
                }

                VaultDb.ResetDatabase(dbPath, seedCash);
                var portfolioReset = new Portfolio(seedCash);
                var resetSnapshot = portfolioReset.GetSnapshot();
                VaultDb.SavePortfolioState(dbPath, resetSnapshot);

                if (jsonMode)
                {
                    Console.WriteLine(JsonSerializer.Serialize(resetSnapshot, new JsonSerializerOptions { WriteIndented = true }));
                }
                else
                {
                    Console.WriteLine($"[THE VAULT] Database '{dbPath}' reset to ${seedCash:N2} seed cash balance. Trade history cleared.");
                }
                return;
            }

            // Handle --load-benchmark command: execute benchmark sequence, save all trades to TradeHistory, save balance to PortfolioState
            if (loadBenchmarkMode)
            {
                VaultDb.ResetDatabase(dbPath, 100_000m);
                var benchmarkPortfolio = ExecuteBenchmarkSequence(!jsonMode);

                // Phase 3: Save to SQLite 'apextrade.db'
                var allTrades = benchmarkPortfolio.GetTradeHistory();
                VaultDb.SaveAllTrades(dbPath, allTrades, benchmarkPortfolio);
                var snapshot = benchmarkPortfolio.GetSnapshot();
                VaultDb.SavePortfolioState(dbPath, snapshot);

                if (jsonMode)
                {
                    Console.WriteLine(JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true }));
                }
                else
                {
                    Console.WriteLine();
                    Console.WriteLine($"[THE VAULT] Successfully persisted {allTrades.Count} benchmark trades to 'TradeHistory' and portfolio state to 'PortfolioState' in {dbPath}.");
                }
                return;
            }

            // Handle --trade <side> <symbol> <shares> [price] command
            if (tradeMode)
            {
                // Find index of --trade
                int tradeIdx = Array.FindIndex(args, a => a.Equals("--trade", StringComparison.OrdinalIgnoreCase));
                if (tradeIdx >= 0 && tradeIdx + 3 < args.Length)
                {
                    string sideStr = args[tradeIdx + 1].ToUpperInvariant();
                    string symbol = args[tradeIdx + 2].ToUpperInvariant();
                    if (decimal.TryParse(args[tradeIdx + 3], out decimal shares))
                    {
                        decimal? priceOverride = null;
                        if (tradeIdx + 4 < args.Length && decimal.TryParse(args[tradeIdx + 4], out decimal parsedPrice))
                        {
                            priceOverride = parsedPrice;
                        }

                        // Load existing state from SQLite
                        var p = new Portfolio(100_000m);
                        var (found, cash, initial, realized, positions, _) = VaultDb.LoadPortfolioState(dbPath);
                        var history = VaultDb.ReadTradeHistory(dbPath);

                        if (found)
                        {
                            p.LoadStateFromDatabase(cash, initial, realized, positions, history);
                        }

                        OrderResult result;
                        if (sideStr == "BUY")
                        {
                            result = p.Buy(symbol, shares, priceOverride);
                        }
                        else
                        {
                            result = p.Sell(symbol, shares, priceOverride);
                        }

                        if (result.Success && result.Execution != null)
                        {
                            var updatedSnapshot = p.GetSnapshot();
                            VaultDb.SaveTrade(
                                dbPath,
                                result.Execution,
                                updatedSnapshot.TotalPortfolioValue,
                                updatedSnapshot.TotalRealizedPnL,
                                updatedSnapshot.InvestedValue
                            );
                            VaultDb.SavePortfolioState(dbPath, updatedSnapshot);

                            if (jsonMode)
                            {
                                Console.WriteLine(JsonSerializer.Serialize(updatedSnapshot, new JsonSerializerOptions { WriteIndented = true }));
                            }
                            else
                            {
                                Console.WriteLine($"[TRADE FILLED & PERSISTED] {result.Message}");
                            }
                            return;
                        }
                        else
                        {
                            if (jsonMode)
                            {
                                Console.WriteLine(JsonSerializer.Serialize(new { success = false, error = result.Message }));
                            }
                            else
                            {
                                Console.Error.WriteLine($"[TRADE REJECTED] {result.Message}");
                            }
                            Environment.Exit(1);
                            return;
                        }
                    }
                }
            }

            // Handle --read-db or default: reads data from SQLite apextrade.db
            var (hasState, currentCash, startBalance, currentRealized, currentPositions, lastUpdated) = VaultDb.LoadPortfolioState(dbPath);
            var dbTrades = VaultDb.ReadTradeHistory(dbPath);

            var activePortfolio = new Portfolio(100_000m);

            if (hasState && (dbTrades.Count > 0 || currentPositions.Count > 0 || currentCash != 100_000m))
            {
                // Repopulate from SQLite
                activePortfolio.LoadStateFromDatabase(currentCash, startBalance, currentRealized, currentPositions, dbTrades);
                if (!jsonMode)
                {
                    Console.WriteLine($"[THE VAULT] Repopulated portfolio from SQLite '{dbPath}' (Last Updated: {lastUpdated})");
                    Console.WriteLine($"[THE VAULT] Restored {dbTrades.Count} trade history records and {currentPositions.Count} open positions.");
                }
            }
            else
            {
                // First boot: Initialize with benchmark sequence and persist to SQLite
                if (!jsonMode)
                {
                    Console.WriteLine($"[THE VAULT] Initializing clean SQLite database '{dbPath}' with baseline benchmark sequence...");
                }
                activePortfolio = ExecuteBenchmarkSequence(!jsonMode);
                var allTrades = activePortfolio.GetTradeHistory();
                VaultDb.SaveAllTrades(dbPath, allTrades, activePortfolio);
                VaultDb.SavePortfolioState(dbPath, activePortfolio.GetSnapshot());
            }

            var finalSnapshot = activePortfolio.GetSnapshot();

            if (jsonMode)
            {
                var options = new JsonSerializerOptions { WriteIndented = true };
                Console.WriteLine(JsonSerializer.Serialize(finalSnapshot, options));
                return;
            }

            PrintConsoleReport(finalSnapshot, dbPath);
        }

        /// <summary>
        /// Executes the realistic 8-trade benchmark sequence (4 buys, price updates, 4 sells).
        /// </summary>
        public static Portfolio ExecuteBenchmarkSequence(bool verbose)
        {
            var portfolio = new Portfolio(100_000.00m);

            if (verbose)
            {
                Console.WriteLine("=========================================================================================");
                Console.WriteLine(" APEXTRADE CORE C# ENGINE — PHASE 3: THE VAULT (SQLITE PERSISTENCE)");
                Console.WriteLine("=========================================================================================");
                Console.WriteLine($"[1] Initialized portfolio with Cash Balance: ${portfolio.CashBalance:N2}");
                Console.WriteLine();
            }

            // Ingest initial market tickers
            portfolio.ProcessTicker(new StockTicker("AAPL", 347.10m, 3.19m, 0.93m, 33_494_235));
            portfolio.ProcessTicker(new StockTicker("NVDA", 217.94m, 1.94m, 0.90m, 80_981_303));
            portfolio.ProcessTicker(new StockTicker("MSFT", 531.33m, -1.27m, -0.24m, 17_052_100));
            portfolio.ProcessTicker(new StockTicker("TSLA", 407.46m, 15.84m, 4.04m, 43_402_190));

            // Execute Buys
            portfolio.Buy("AAPL", 50m);
            portfolio.Buy("NVDA", 120m);
            portfolio.Buy("MSFT", 30m);
            portfolio.Buy("TSLA", 25m);

            // Market updates
            portfolio.ProcessTicker(new StockTicker("AAPL", 356.50m, 9.40m, 2.71m, 41_200_000));
            portfolio.ProcessTicker(new StockTicker("NVDA", 228.30m, 10.36m, 4.75m, 99_400_000));
            portfolio.ProcessTicker(new StockTicker("MSFT", 522.10m, -9.23m, -1.74m, 22_500_000));
            portfolio.ProcessTicker(new StockTicker("TSLA", 422.00m, 14.54m, 3.57m, 51_000_000));

            // Execute Sells
            portfolio.Sell("NVDA", 50m);
            portfolio.Sell("AAPL", 25m);
            portfolio.Sell("MSFT", 15m);
            portfolio.Sell("TSLA", 15m);

            return portfolio;
        }

        private static void PrintConsoleReport(PortfolioSnapshot snapshot, string dbPath)
        {
            var stats = snapshot.Statistics;
            var vault = VaultDb.GetVaultStatus(dbPath);

            Console.WriteLine();
            Console.WriteLine("=========================================================================================");
            Console.WriteLine($" THE VAULT STATUS — SQLITE DATABASE ('{Path.GetFileName(dbPath)}')");
            Console.WriteLine("=========================================================================================");
            Console.WriteLine($" Database File:             {vault.DatabasePath}");
            Console.WriteLine($" Storage Size:              {vault.FileSizeBytes:N0} bytes");
            Console.WriteLine($" PortfolioState Table:      {vault.PortfolioStateRows} row (Active)");
            Console.WriteLine($" TradeHistory Table:        {vault.TradeHistoryRows} orders logged");
            Console.WriteLine($" Last Vault Write:          {vault.LastUpdated}");
            Console.WriteLine("-----------------------------------------------------------------------------------------");
            Console.WriteLine(" TRADE EXECUTION METRICS & PERFORMANCE REPORT");
            Console.WriteLine("-----------------------------------------------------------------------------------------");
            Console.WriteLine($" Total Executed Orders:     {stats.TotalExecutedOrders} ({stats.BuyOrdersCount} Buys, {stats.SellOrdersCount} Sells)");
            Console.WriteLine($" Winning Trades:            {stats.WinningTradesCount}");
            Console.WriteLine($" Losing Trades:             {stats.LosingTradesCount}");
            Console.WriteLine($" Win/Loss Ratio:            {stats.WinLossRatio:N2} ({(stats.LosingTradesCount > 0 ? $"{stats.WinningTradesCount}:{stats.LosingTradesCount}" : "3:1")})");
            Console.WriteLine($" Win Rate %:                {stats.WinRatePercent:N2}%");
            Console.WriteLine($" Average Profit Per Trade:  {(stats.AverageProfitPerTrade >= 0 ? "+" : "")}${stats.AverageProfitPerTrade:N2}");
            Console.WriteLine($" Average Winning Trade:     +${stats.AverageWinningTrade:N2}");
            Console.WriteLine($" Average Losing Trade:      -${Math.Abs(stats.AverageLosingTrade):N2}");
            Console.WriteLine($" Profit Factor:             {stats.ProfitFactor:N2}");
            Console.WriteLine($" Largest Winning Trade:     +${stats.LargestWinningTrade:N2}");
            Console.WriteLine($" Largest Losing Trade:      -${Math.Abs(stats.LargestLosingTrade):N2}");
            Console.WriteLine($" Gross Profit / Loss:       +${stats.TotalGrossProfit:N2} / -${stats.TotalGrossLoss:N2}");
            Console.WriteLine($" Total Shares Transacted:   {stats.TotalSharesTraded:N0} shares");
            Console.WriteLine($" Total Dollar Turnover:     ${stats.TotalDollarTurnover:N2}");
            Console.WriteLine("-----------------------------------------------------------------------------------------");
            Console.WriteLine(" PORTFOLIO BALANCE REPORT (FROM SQLITE VAULT)");
            Console.WriteLine("-----------------------------------------------------------------------------------------");
            Console.WriteLine($" Initial Capital:           ${snapshot.InitialBalance:N2}");
            Console.WriteLine($" Available Cash Reserves:   ${snapshot.CashBalance:N2}");
            Console.WriteLine($" Invested Securities:       ${snapshot.InvestedValue:N2}");
            Console.WriteLine($" Total Net Portfolio:       ${snapshot.TotalPortfolioValue:N2}");
            Console.WriteLine($" Total Realized Profit:     +${snapshot.TotalRealizedPnL:N2}");
            Console.WriteLine($" Total Unrealized P&L:      {(snapshot.TotalUnrealizedPnL >= 0 ? "+" : "")}${snapshot.TotalUnrealizedPnL:N2}");
            Console.WriteLine($" Net Total Return:          {(snapshot.TotalNetPnL >= 0 ? "+" : "")}${snapshot.TotalNetPnL:N2} ({snapshot.TotalReturnPercent:+0.00;-0.00}%)");
            Console.WriteLine("-----------------------------------------------------------------------------------------");
            Console.WriteLine($"{"SYMBOL",-8} {"SHARES",-10} {"AVG COST",-12} {"CURRENT",-12} {"MARKET VAL",-14} {"UNREALIZED P&L",-18} {"ROI %"}");
            Console.WriteLine("-----------------------------------------------------------------------------------------");

            foreach (var pos in snapshot.Positions)
            {
                string pnlStr = $"{(pos.UnrealizedPnL >= 0 ? "+" : "")}${pos.UnrealizedPnL:N2}";
                string roiStr = $"{(pos.UnrealizedPnLPercent >= 0 ? "+" : "")}{pos.UnrealizedPnLPercent:N2}%";
                Console.WriteLine($"{pos.Symbol,-8} {pos.Shares,-10:N0} ${pos.AverageCostBasis,-11:N2} ${pos.CurrentPrice,-11:N2} ${pos.MarketValue,-13:N2} {pnlStr,-18} {roiStr}");
            }

            Console.WriteLine("-----------------------------------------------------------------------------------------");
            Console.WriteLine(" RUNNING EXECUTION LOG (FROM SQLITE 'TradeHistory' TABLE):");
            foreach (var trade in snapshot.RecentTrades)
            {
                Console.WriteLine($" • {trade}");
            }
            Console.WriteLine("=========================================================================================");
        }
    }
}

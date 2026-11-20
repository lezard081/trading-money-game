/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TopNav } from './components/TopNav.tsx';
import { StockChart } from './components/StockChart.tsx';
import { WatchlistTable } from './components/WatchlistTable.tsx';
import { StockDetailCard } from './components/StockDetailCard.tsx';
import { PythonScriptEngine } from './components/PythonScriptEngine.tsx';
import { CSharpEngine } from './components/CSharpEngine.tsx';
import { PortfolioVisualizer } from './components/PortfolioVisualizer.tsx';
import { AutomatedTradingTriggerPanel } from './components/AutomatedTradingTriggerPanel.tsx';
import { LiveNewsSection } from './components/LiveNewsSection.tsx';
import { ApiDocs } from './components/ApiDocs.tsx';
import { Roadmap } from './components/Roadmap.tsx';
import { StockQuote, CandleData, PortfolioState, PortfolioPosition, TradeRecord, TradeStatistics, VaultDbStatus } from './types.ts';
import { Terminal, ArrowUpRight, TrendingUp, RefreshCw, Briefcase, Activity, Database, ShieldCheck, Zap } from 'lucide-react';

const INITIAL_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'INTC', 'AMD', 'F', 'GOOGL', 'AMZN', 'TSLA'];
const INITIAL_PORTFOLIO_CASH = 100_000.00;

const INITIAL_TRADE_STATS: TradeStatistics = {
  totalExecutedOrders: 0,
  buyOrdersCount: 0,
  sellOrdersCount: 0,
  winningTradesCount: 0,
  losingTradesCount: 0,
  breakEvenTradesCount: 0,
  winLossRatio: 0,
  winRatePercent: 0,
  averageProfitPerTrade: 0,
  averageWinningTrade: 0,
  averageLosingTrade: 0,
  totalGrossProfit: 0,
  totalGrossLoss: 0,
  profitFactor: 1,
  largestWinningTrade: 0,
  largestLosingTrade: 0,
  totalSharesTraded: 0,
  totalDollarTurnover: 0,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'terminal' | 'visualizer' | 'triggers' | 'portfolio' | 'python' | 'docs' | 'roadmap'>('visualizer');
  const [symbols, setSymbols] = useState<string[]>(INITIAL_SYMBOLS);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('AAPL');
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);
  const [timeframe, setTimeframe] = useState<string>('1d');
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Phase 3: The Vault SQLite Database State
  const [vaultStatus, setVaultStatus] = useState<VaultDbStatus | null>(null);
  const [isVaultLoading, setIsVaultLoading] = useState(false);
  const [isSyncingVault, setIsSyncingVault] = useState(false);

  // Phase 2 & 3: C# Portfolio State Tracking $100,000 Balance & Running Trade Stats in SQLite apextrade.db
  const [portfolio, setPortfolio] = useState<PortfolioState>(() => {
    return {
      initialBalance: INITIAL_PORTFOLIO_CASH,
      cashBalance: INITIAL_PORTFOLIO_CASH,
      investedValue: 0,
      totalPortfolioValue: INITIAL_PORTFOLIO_CASH,
      totalRealizedPnL: 0,
      totalUnrealizedPnL: 0,
      totalNetPnL: 0,
      totalReturnPercent: 0,
      positions: {},
      tradeHistory: [],
      statistics: INITIAL_TRADE_STATS,
    };
  });

  // Recompute portfolio valuations & running trade statistics in memory
  const recomputePortfolio = (
    currentCash: number,
    positionsMap: Record<string, PortfolioPosition>,
    realizedPnL: number,
    history: TradeRecord[]
  ): PortfolioState => {
    let investedVal = 0;
    let unrealizedVal = 0;

    Object.values(positionsMap).forEach((pos) => {
      investedVal += pos.marketValue;
      unrealizedVal += pos.unrealizedPnL;
    });

    const totalVal = currentCash + investedVal;
    const netPnL = realizedPnL + unrealizedVal;
    const returnPct = INITIAL_PORTFOLIO_CASH > 0 ? (netPnL / INITIAL_PORTFOLIO_CASH) * 100 : 0;

    let buyOrdersCount = 0;
    let sellOrdersCount = 0;
    let winningTradesCount = 0;
    let losingTradesCount = 0;
    let breakEvenTradesCount = 0;
    let totalGrossProfit = 0;
    let totalGrossLoss = 0;
    let largestWinningTrade = 0;
    let largestLosingTrade = 0;
    let totalSharesTraded = 0;
    let totalDollarTurnover = 0;

    history.forEach((t) => {
      totalSharesTraded += t.shares;
      totalDollarTurnover += t.totalAmount;
      if (t.side === 'BUY') {
        buyOrdersCount++;
      } else {
        sellOrdersCount++;
        if (t.realizedPnL > 0) {
          winningTradesCount++;
          totalGrossProfit += t.realizedPnL;
          if (t.realizedPnL > largestWinningTrade) largestWinningTrade = t.realizedPnL;
        } else if (t.realizedPnL < 0) {
          losingTradesCount++;
          totalGrossLoss += Math.abs(t.realizedPnL);
          if (t.realizedPnL < largestLosingTrade) largestLosingTrade = t.realizedPnL;
        } else {
          breakEvenTradesCount++;
        }
      }
    });

    const winLossRatio = losingTradesCount > 0
      ? Number((winningTradesCount / losingTradesCount).toFixed(2))
      : (winningTradesCount > 0 ? winningTradesCount : 0);

    const winRatePercent = sellOrdersCount > 0
      ? Number(((winningTradesCount / sellOrdersCount) * 100).toFixed(2))
      : 0;

    const averageProfitPerTrade = sellOrdersCount > 0
      ? Number((realizedPnL / sellOrdersCount).toFixed(2))
      : 0;

    const averageWinningTrade = winningTradesCount > 0
      ? Number((totalGrossProfit / winningTradesCount).toFixed(2))
      : 0;

    const averageLosingTrade = losingTradesCount > 0
      ? Number((totalGrossLoss / losingTradesCount).toFixed(2))
      : 0;

    const profitFactor = totalGrossLoss > 0
      ? Number((totalGrossProfit / totalGrossLoss).toFixed(2))
      : (totalGrossProfit > 0 ? totalGrossProfit : 1);

    const stats: TradeStatistics = {
      totalExecutedOrders: history.length,
      buyOrdersCount,
      sellOrdersCount,
      winningTradesCount,
      losingTradesCount,
      breakEvenTradesCount,
      winLossRatio,
      winRatePercent,
      averageProfitPerTrade,
      averageWinningTrade,
      averageLosingTrade,
      totalGrossProfit: Number(totalGrossProfit.toFixed(2)),
      totalGrossLoss: Number(totalGrossLoss.toFixed(2)),
      profitFactor,
      largestWinningTrade: Number(largestWinningTrade.toFixed(2)),
      largestLosingTrade: Number(largestLosingTrade.toFixed(2)),
      totalSharesTraded: Number(totalSharesTraded.toFixed(2)),
      totalDollarTurnover: Number(totalDollarTurnover.toFixed(2)),
    };

    return {
      initialBalance: INITIAL_PORTFOLIO_CASH,
      cashBalance: Number(currentCash.toFixed(2)),
      investedValue: Number(investedVal.toFixed(2)),
      totalPortfolioValue: Number(totalVal.toFixed(2)),
      totalRealizedPnL: Number(realizedPnL.toFixed(2)),
      totalUnrealizedPnL: Number(unrealizedVal.toFixed(2)),
      totalNetPnL: Number(netPnL.toFixed(2)),
      totalReturnPercent: Number(returnPct.toFixed(2)),
      positions: positionsMap,
      tradeHistory: history,
      statistics: stats,
    };
  };

  // Phase 3: The Vault — Map and apply C# snapshot directly to React state
  const applyCsharpSnapshot = useCallback((snap: any) => {
    if (!snap) return;

    const positionsMap: Record<string, PortfolioPosition> = {};
    const rawPositions = snap.positions || snap.Positions || [];
    rawPositions.forEach((p: any) => {
      const sym = (p.symbol || p.Symbol || '').toUpperCase();
      if (sym) {
        positionsMap[sym] = {
          symbol: sym,
          shares: Number(p.shares ?? p.Shares ?? 0),
          averageCostBasis: Number(p.averageCostBasis ?? p.AverageCostBasis ?? 0),
          currentPrice: Number(p.currentPrice ?? p.CurrentPrice ?? 0),
          marketValue: Number(p.marketValue ?? p.MarketValue ?? 0),
          totalCost: Number(p.totalCost ?? p.TotalCost ?? 0),
          unrealizedPnL: Number(p.unrealizedPnL ?? p.UnrealizedPnL ?? 0),
          unrealizedPnLPercent: Number(p.unrealizedPnLPercent ?? p.UnrealizedPnLPercent ?? 0),
          lastUpdated: p.lastUpdated || p.LastUpdated || new Date().toLocaleTimeString(),
        };
      }
    });

    const rawTrades = snap.recentTrades || snap.RecentTrades || [];
    const trades: TradeRecord[] = rawTrades.map((t: any, idx: number) => {
      const sideRaw = (t.side || t.Side || 'BUY').toString().toUpperCase();
      const side: 'BUY' | 'SELL' = sideRaw === 'SELL' || sideRaw === '1' ? 'SELL' : 'BUY';
      const shares = Number(t.shares ?? t.Shares ?? 0);
      const executionPrice = Number(t.executionPrice ?? t.ExecutionPrice ?? 0);
      const totalAmount = Number(t.totalAmount ?? t.TotalAmount ?? (shares * executionPrice));
      const realizedPnL = Number(t.realizedPnL ?? t.RealizedPnL ?? 0);
      const remainingCashBalance = Number(t.remainingCashBalance ?? t.RemainingCashBalance ?? 100000);

      let ts = t.timestamp ? String(t.timestamp) : new Date().toLocaleTimeString();
      if (ts.includes('T')) {
        try {
          ts = new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        } catch {
          // Keep raw
        }
      }

      return {
        tradeId: t.tradeId || t.TradeId || `TRD-${(idx + 1).toString().padStart(6, '0')}`,
        timestamp: ts,
        symbol: (t.symbol || t.Symbol || '').toUpperCase(),
        side,
        shares,
        executionPrice,
        totalAmount,
        realizedPnL,
        remainingCashBalance,
        runningOrderCount: Number(t.runningOrderCount ?? t.RunningOrderCount ?? (idx + 1)),
        runningAverageProfitPerTrade: Number(t.runningAverageProfitPerTrade ?? t.RunningAverageProfitPerTrade ?? 0),
        runningWinLossRatio: Number(t.runningWinLossRatio ?? t.RunningWinLossRatio ?? 0),
        runningWinRatePercent: Number(t.runningWinRatePercent ?? t.RunningWinRatePercent ?? 0),
        runningPortfolioValue: Number(t.runningPortfolioValue ?? t.RunningPortfolioValue ?? (remainingCashBalance + (shares * executionPrice))),
        runningRealizedPnL: Number(t.runningRealizedPnL ?? t.RunningRealizedPnL ?? 0),
        runningInvestedValue: Number(t.runningInvestedValue ?? t.RunningInvestedValue ?? (shares * executionPrice)),
      };
    });

    const rawStats = snap.statistics || snap.Statistics || {};
    const stats: TradeStatistics = {
      totalExecutedOrders: Number(rawStats.totalExecutedOrders ?? rawStats.TotalExecutedOrders ?? trades.length),
      buyOrdersCount: Number(rawStats.buyOrdersCount ?? rawStats.BuyOrdersCount ?? 0),
      sellOrdersCount: Number(rawStats.sellOrdersCount ?? rawStats.SellOrdersCount ?? 0),
      winningTradesCount: Number(rawStats.winningTradesCount ?? rawStats.WinningTradesCount ?? 0),
      losingTradesCount: Number(rawStats.losingTradesCount ?? rawStats.LosingTradesCount ?? 0),
      breakEvenTradesCount: Number(rawStats.breakEvenTradesCount ?? rawStats.BreakEvenTradesCount ?? 0),
      winLossRatio: Number(rawStats.winLossRatio ?? rawStats.WinLossRatio ?? 0),
      winRatePercent: Number(rawStats.winRatePercent ?? rawStats.WinRatePercent ?? 0),
      averageProfitPerTrade: Number(rawStats.averageProfitPerTrade ?? rawStats.AverageProfitPerTrade ?? 0),
      averageWinningTrade: Number(rawStats.averageWinningTrade ?? rawStats.AverageWinningTrade ?? 0),
      averageLosingTrade: Number(rawStats.averageLosingTrade ?? rawStats.AverageLosingTrade ?? 0),
      totalGrossProfit: Number(rawStats.totalGrossProfit ?? rawStats.TotalGrossProfit ?? 0),
      totalGrossLoss: Number(rawStats.totalGrossLoss ?? rawStats.TotalGrossLoss ?? 0),
      profitFactor: Number(rawStats.profitFactor ?? rawStats.ProfitFactor ?? 1),
      largestWinningTrade: Number(rawStats.largestWinningTrade ?? rawStats.LargestWinningTrade ?? 0),
      largestLosingTrade: Number(rawStats.largestLosingTrade ?? rawStats.LargestLosingTrade ?? 0),
      totalSharesTraded: Number(rawStats.totalSharesTraded ?? rawStats.TotalSharesTraded ?? 0),
      totalDollarTurnover: Number(rawStats.totalDollarTurnover ?? rawStats.TotalDollarTurnover ?? 0),
    };

    const initialBalance = Number(snap.initialBalance ?? snap.InitialBalance ?? 100000);
    const cashBalance = Number(snap.cashBalance ?? snap.CashBalance ?? 100000);
    const investedValue = Number(snap.investedValue ?? snap.InvestedValue ?? 0);
    const totalPortfolioValue = Number(snap.totalPortfolioValue ?? snap.TotalPortfolioValue ?? (cashBalance + investedValue));
    const totalRealizedPnL = Number(snap.totalRealizedPnL ?? snap.TotalRealizedPnL ?? 0);
    const totalUnrealizedPnL = Number(snap.totalUnrealizedPnL ?? snap.TotalUnrealizedPnL ?? 0);
    const totalNetPnL = Number(snap.totalNetPnL ?? snap.TotalNetPnL ?? (totalRealizedPnL + totalUnrealizedPnL));
    const totalReturnPercent = Number(snap.totalReturnPercent ?? snap.TotalReturnPercent ?? (initialBalance > 0 ? (totalNetPnL / initialBalance) * 100 : 0));

    setPortfolio({
      initialBalance,
      cashBalance,
      investedValue,
      totalPortfolioValue,
      totalRealizedPnL,
      totalUnrealizedPnL,
      totalNetPnL,
      totalReturnPercent,
      positions: positionsMap,
      tradeHistory: trades,
      statistics: stats,
    });
  }, []);

  // Fetch portfolio data from SQLite database via C# backend engine
  const fetchPortfolioFromVault = useCallback(async () => {
    setIsVaultLoading(true);
    try {
      const res = await fetch('/api/portfolio');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.portfolio) {
          applyCsharpSnapshot(data.portfolio);
        }
      }
    } catch (err) {
      console.error('Failed to read portfolio from SQLite Vault:', err);
    } finally {
      setIsVaultLoading(false);
    }
  }, [applyCsharpSnapshot]);

  // Fetch SQLite database status (file size, rows count in PortfolioState and TradeHistory)
  const fetchVaultStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/db-status');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.status) {
          setVaultStatus(data.status);
        }
      }
    } catch (err) {
      console.error('Failed to inspect Vault status:', err);
    }
  }, []);

  // Manual sync trigger
  const handleSyncWithVault = useCallback(async () => {
    setIsSyncingVault(true);
    await fetchPortfolioFromVault();
    await fetchVaultStatus();
    setIsSyncingVault(false);
  }, [fetchPortfolioFromVault, fetchVaultStatus]);

  // Boot & Refresh: Automatically read data from SQLite apextrade.db to repopulate portfolio
  useEffect(() => {
    fetchPortfolioFromVault();
    fetchVaultStatus();
  }, [fetchPortfolioFromVault, fetchVaultStatus]);

  // C# Core Function: ProcessTicker (incoming market stock price ticker)
  const handleIngestTicker = useCallback(
    (sym: string, price: number, change: number = 0, changePercent: number = 0) => {
      const symbol = sym.trim().toUpperCase();

      setPortfolio((prev) => {
        const positionsCopy = { ...prev.positions };
        const existing = positionsCopy[symbol];

        if (existing) {
          const newMarketValue = existing.shares * price;
          const newUnrealized = newMarketValue - existing.totalCost;
          const newUnrealizedPercent = existing.totalCost > 0 ? (newUnrealized / existing.totalCost) * 100 : 0;

          positionsCopy[symbol] = {
            ...existing,
            currentPrice: price,
            marketValue: Number(newMarketValue.toFixed(2)),
            unrealizedPnL: Number(newUnrealized.toFixed(2)),
            unrealizedPnLPercent: Number(newUnrealizedPercent.toFixed(2)),
            lastUpdated: new Date().toLocaleTimeString(),
          };
        }

        return recomputePortfolio(prev.cashBalance, positionsCopy, prev.totalRealizedPnL, prev.tradeHistory);
      });
    },
    []
  );

  // Phase 3: Execute Trade via C# backend engine and persist permanently to SQLite apextrade.db
  const handleExecuteTrade = useCallback(
    (sym: string, side: 'BUY' | 'SELL', shares: number, overridePrice?: number): { success: boolean; message: string } => {
      const symbol = sym.trim().toUpperCase();
      const currentQuote = quotes.find((q) => q.symbol === symbol);
      const executionPrice = overridePrice ?? (portfolio.positions[symbol]?.currentPrice || currentQuote?.price || 100);

      if (executionPrice <= 0) {
        return { success: false, message: `No valid market price for ${symbol}.` };
      }

      if (shares <= 0) {
        return { success: false, message: 'Shares must be greater than zero.' };
      }

      // 1. Immediately post to C# backend engine to write to SQLite apextrade.db
      fetch('/api/portfolio/trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, side, shares, price: executionPrice }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.portfolio) {
            applyCsharpSnapshot(data.portfolio);
            fetchVaultStatus();
          }
        })
        .catch((err) => {
          console.error('SQLite trade persistence error:', err);
        });

      // 2. Optimistic UI update
      let result = { success: false, message: '' };

      setPortfolio((prev) => {
        const positionsCopy = { ...prev.positions };
        const historyCopy = [...prev.tradeHistory];
        let newCash = prev.cashBalance;
        let newRealized = prev.totalRealizedPnL;

        if (side === 'BUY') {
          const totalCost = Number((shares * executionPrice).toFixed(2));
          if (newCash < totalCost) {
            result = {
              success: false,
              message: `Insufficient cash! Required: $${totalCost.toFixed(2)}, Available: $${newCash.toFixed(2)}`,
            };
            return prev;
          }

          newCash -= totalCost;
          const existing = positionsCopy[symbol];

          if (existing) {
            const totalShares = existing.shares + shares;
            const totalInvested = existing.shares * existing.averageCostBasis + totalCost;
            const newAvgCost = Number((totalInvested / totalShares).toFixed(4));
            const newMarketVal = totalShares * executionPrice;
            const newUnrealized = newMarketVal - totalInvested;

            positionsCopy[symbol] = {
              symbol,
              shares: totalShares,
              averageCostBasis: newAvgCost,
              currentPrice: executionPrice,
              marketValue: Number(newMarketVal.toFixed(2)),
              totalCost: Number(totalInvested.toFixed(2)),
              unrealizedPnL: Number(newUnrealized.toFixed(2)),
              unrealizedPnLPercent: Number(((newUnrealized / totalInvested) * 100).toFixed(2)),
              lastUpdated: new Date().toLocaleTimeString(),
            };
          } else {
            const marketVal = Number((shares * executionPrice).toFixed(2));
            positionsCopy[symbol] = {
              symbol,
              shares,
              averageCostBasis: executionPrice,
              currentPrice: executionPrice,
              marketValue: marketVal,
              totalCost,
              unrealizedPnL: 0,
              unrealizedPnLPercent: 0,
              lastUpdated: new Date().toLocaleTimeString(),
            };
          }

          const pastSells = historyCopy.filter((t) => t.side === 'SELL');
          const winsSoFar = pastSells.filter((t) => t.realizedPnL > 0).length;
          const lossesSoFar = pastSells.filter((t) => t.realizedPnL < 0).length;
          const sellCount = pastSells.length;
          const runningAvgProfit = sellCount > 0 ? Number((newRealized / sellCount).toFixed(2)) : 0;
          const runningWLRatio = lossesSoFar > 0 ? Number((winsSoFar / lossesSoFar).toFixed(2)) : (winsSoFar > 0 ? winsSoFar : 0);
          const runningWinRate = sellCount > 0 ? Number(((winsSoFar / sellCount) * 100).toFixed(2)) : 0;

          const runningInvested = Object.values(positionsCopy).reduce((acc, p) => acc + p.marketValue, 0);
          const runningPortfolioVal = Number((newCash + runningInvested).toFixed(2));

          const trade: TradeRecord = {
            tradeId: `TRD-${Date.now().toString().slice(-6)}`,
            timestamp: new Date().toLocaleTimeString(),
            symbol,
            side: 'BUY',
            shares,
            executionPrice,
            totalAmount: totalCost,
            realizedPnL: 0,
            remainingCashBalance: Number(newCash.toFixed(2)),
            runningOrderCount: historyCopy.length + 1,
            runningAverageProfitPerTrade: runningAvgProfit,
            runningWinLossRatio: runningWLRatio,
            runningWinRatePercent: runningWinRate,
            runningPortfolioValue: runningPortfolioVal,
            runningRealizedPnL: Number(newRealized.toFixed(2)),
            runningInvestedValue: Number(runningInvested.toFixed(2)),
          };
          historyCopy.push(trade);

          result = {
            success: true,
            message: `BUY ${shares} ${symbol} @ $${executionPrice.toFixed(2)} executed and saved to SQLite apextrade.db.`,
          };
        } else {
          // SELL
          const existing = positionsCopy[symbol];
          if (!existing || existing.shares < shares) {
            result = {
              success: false,
              message: `Insufficient shares of ${symbol}. Owned: ${existing?.shares || 0}, Requested: ${shares}`,
            };
            return prev;
          }

          const grossProceeds = Number((shares * executionPrice).toFixed(2));
          const costBasisOfSold = Number((shares * existing.averageCostBasis).toFixed(2));
          const realizedGain = Number((grossProceeds - costBasisOfSold).toFixed(2));

          newCash += grossProceeds;
          newRealized += realizedGain;

          const remainingShares = existing.shares - shares;
          if (remainingShares === 0) {
            delete positionsCopy[symbol];
          } else {
            const newMarketVal = remainingShares * executionPrice;
            const newTotalCost = remainingShares * existing.averageCostBasis;
            const newUnrealized = newMarketVal - newTotalCost;

            positionsCopy[symbol] = {
              ...existing,
              shares: remainingShares,
              currentPrice: executionPrice,
              marketValue: Number(newMarketVal.toFixed(2)),
              totalCost: Number(newTotalCost.toFixed(2)),
              unrealizedPnL: Number(newUnrealized.toFixed(2)),
              unrealizedPnLPercent: Number(((newUnrealized / newTotalCost) * 100).toFixed(2)),
              lastUpdated: new Date().toLocaleTimeString(),
            };
          }

          const pastSells = historyCopy.filter((t) => t.side === 'SELL');
          const totalSellsNow = pastSells.length + 1;
          const winsNow = pastSells.filter((t) => t.realizedPnL > 0).length + (realizedGain > 0 ? 1 : 0);
          const lossesNow = pastSells.filter((t) => t.realizedPnL < 0).length + (realizedGain < 0 ? 1 : 0);
          const runningAvgProfit = totalSellsNow > 0 ? Number((newRealized / totalSellsNow).toFixed(2)) : 0;
          const runningWLRatio = lossesNow > 0 ? Number((winsNow / lossesNow).toFixed(2)) : (winsNow > 0 ? winsNow : 0);
          const runningWinRate = totalSellsNow > 0 ? Number(((winsNow / totalSellsNow) * 100).toFixed(2)) : 0;

          const runningInvested = Object.values(positionsCopy).reduce((acc, p) => acc + p.marketValue, 0);
          const runningPortfolioVal = Number((newCash + runningInvested).toFixed(2));

          const trade: TradeRecord = {
            tradeId: `TRD-${Date.now().toString().slice(-6)}`,
            timestamp: new Date().toLocaleTimeString(),
            symbol,
            side: 'SELL',
            shares,
            executionPrice,
            totalAmount: grossProceeds,
            realizedPnL: realizedGain,
            remainingCashBalance: Number(newCash.toFixed(2)),
            runningOrderCount: historyCopy.length + 1,
            runningAverageProfitPerTrade: runningAvgProfit,
            runningWinLossRatio: runningWLRatio,
            runningWinRatePercent: runningWinRate,
            runningPortfolioValue: runningPortfolioVal,
            runningRealizedPnL: Number(newRealized.toFixed(2)),
            runningInvestedValue: Number(runningInvested.toFixed(2)),
          };
          historyCopy.push(trade);

          result = {
            success: true,
            message: `SELL ${shares} ${symbol} @ $${executionPrice.toFixed(2)} executed and saved to SQLite apextrade.db (P&L: ${(realizedGain >= 0 ? '+' : '')}$${realizedGain.toFixed(2)}).`,
          };
        }

        return recomputePortfolio(newCash, positionsCopy, newRealized, historyCopy);
      });

      return result;
    },
    [quotes, portfolio.positions, applyCsharpSnapshot, fetchVaultStatus]
  );

  // Phase 3: Reset Portfolio to pristine baseline in SQLite apextrade.db (default $100,000 or custom seed e.g. $100, $250, $500)
  const handleResetPortfolio = useCallback(async (seedCash?: number) => {
    try {
      const res = await fetch('/api/portfolio/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seedCash: seedCash ?? 100000 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.portfolio) {
          applyCsharpSnapshot(data.portfolio);
          await fetchVaultStatus();
          return;
        }
      }
    } catch (err) {
      console.error('Reset SQLite Vault error:', err);
    }

    // Fallback local reset
    const targetCash = seedCash ?? INITIAL_PORTFOLIO_CASH;
    setPortfolio({
      initialBalance: targetCash,
      cashBalance: targetCash,
      investedValue: 0,
      totalPortfolioValue: INITIAL_PORTFOLIO_CASH,
      totalRealizedPnL: 0,
      totalUnrealizedPnL: 0,
      totalNetPnL: 0,
      totalReturnPercent: 0,
      positions: {},
      tradeHistory: [],
      statistics: INITIAL_TRADE_STATS,
    });
  }, [applyCsharpSnapshot, fetchVaultStatus]);

  // Phase 3: Trigger C# backend engine to write the 8 benchmark trades to SQLite apextrade.db
  const handleLoadBenchmarkTrades = useCallback(async () => {
    setIsVaultLoading(true);
    try {
      const res = await fetch('/api/portfolio/benchmark', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.portfolio) {
          applyCsharpSnapshot(data.portfolio);
          await fetchVaultStatus();
          setIsVaultLoading(false);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to trigger benchmark in C# engine:', err);
    } finally {
      setIsVaultLoading(false);
    }
  }, [applyCsharpSnapshot, fetchVaultStatus]);

  // Fetch Quotes
  const fetchQuotes = useCallback(async (symbolList: string[]) => {
    setIsRefreshingQuotes(true);
    try {
      const symString = symbolList.join(',');
      const res = await fetch(`/api/stocks/quotes?symbols=${encodeURIComponent(symString)}`);
      if (res.ok) {
        const data: StockQuote[] = await res.json();
        setQuotes(data);
        setLastRefreshedAt(new Date().toLocaleTimeString());

        // Ingest incoming market price tickers automatically into portfolio
        data.forEach((q) => {
          if (q.price) {
            handleIngestTicker(q.symbol, q.price, q.change || 0, q.change_percent || 0);
          }
        });
      }
    } catch (err) {
      console.error('Failed to fetch stock quotes:', err);
    } finally {
      setIsRefreshingQuotes(false);
    }
  }, [handleIngestTicker]);

  // Fetch Chart Candles
  const fetchHistory = useCallback(async (sym: string, tf: string) => {
    setIsLoadingChart(true);
    try {
      let interval = '5m';
      if (tf === '5d') interval = '15m';
      else if (tf === '1mo') interval = '1d';
      else if (tf === '6mo') interval = '1d';
      else if (tf === '1y') interval = '1wk';

      const res = await fetch(`/api/stocks/history/${encodeURIComponent(sym)}?interval=${interval}&range=${tf}`);
      if (res.ok) {
        const data = await res.json();
        if (data.candles) {
          setCandles(data.candles);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stock candles:', err);
    } finally {
      setIsLoadingChart(false);
    }
  }, []);

  // Initial Quotes Load
  useEffect(() => {
    fetchQuotes(symbols);
  }, [fetchQuotes, symbols]);

  // Initial Candles Load & update when symbol or timeframe changes
  useEffect(() => {
    fetchHistory(selectedSymbol, timeframe);
  }, [fetchHistory, selectedSymbol, timeframe]);

  // Auto-refresh interval (every 20s)
  useEffect(() => {
    if (!autoRefresh) return;
    const intervalId = setInterval(() => {
      fetchQuotes(symbols);
    }, 20000);
    return () => clearInterval(intervalId);
  }, [autoRefresh, fetchQuotes, symbols]);

  // Add symbol to watchlist
  const handleAddSymbol = (newSym: string) => {
    if (!symbols.includes(newSym)) {
      const updated = [...symbols, newSym];
      setSymbols(updated);
      setSelectedSymbol(newSym);
      fetchQuotes(updated);
    } else {
      setSelectedSymbol(newSym);
    }
  };

  // Remove symbol from watchlist
  const handleRemoveSymbol = (symToRemove: string) => {
    if (symbols.length <= 1) return;
    const updated = symbols.filter((s) => s !== symToRemove);
    setSymbols(updated);
    if (selectedSymbol === symToRemove) {
      setSelectedSymbol(updated[0]);
    }
  };

  const selectedQuote = quotes.find((q) => q.symbol === selectedSymbol) || quotes[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Header */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onQuickRunCSharp={() => setActiveTab('portfolio')}
        vaultStatus={vaultStatus}
      />

      {/* Main View Area */}
      <main className="flex-1">
        {/* TAB 1: MARKET TERMINAL (PHASE 1) */}
        {activeTab === 'terminal' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
            {/* Header / Market Status Strip */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
                    Live Market Feed (Phase 1 & Phase 2 Connected)
                  </span>
                </div>
                <span className="text-slate-600 hidden sm:inline">|</span>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  Free Financial API · Real-Time & Intraday
                </span>
              </div>

              {/* Refresh Info and Controls */}
              <div className="flex items-center gap-3 text-xs">
                {lastRefreshedAt && (
                  <span className="text-slate-400 font-mono text-[11px]">
                    Updated: {lastRefreshedAt}
                  </span>
                )}
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                    autoRefresh
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-900 text-slate-500 border-slate-800'
                  }`}
                >
                  Auto-poll: {autoRefresh ? 'ON (20s)' : 'OFF'}
                </button>
                <button
                  onClick={() => fetchQuotes(symbols)}
                  disabled={isRefreshingQuotes}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors border border-slate-700"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshingQuotes ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Quick Hero Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 mt-0.5">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-bold text-white tracking-tight">
                      Phase 2 Active: C# Core Data Structure & $100,000 Portfolio
                    </h1>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      .NET 8.0 C# Engine
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-2xl leading-relaxed">
                    Portfolio balance starts at <strong className="text-white">$100,000.00</strong>. Incoming stock price tickers from Phase 1 continuously mark open positions to market in real-time.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('visualizer')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors shadow-sm shadow-purple-600/30 whitespace-nowrap shrink-0"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Trade Visualizer</span>
                </button>
                <button
                  onClick={() => setActiveTab('portfolio')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 whitespace-nowrap shrink-0"
                >
                  <Briefcase className="w-3.5 h-3.5 text-purple-400" />
                  <span>C# Engine</span>
                </button>
                <button
                  onClick={() => setActiveTab('python')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 whitespace-nowrap shrink-0"
                >
                  <Terminal className="w-3.5 h-3.5 text-amber-400" />
                  <span>Python Engine</span>
                </button>
              </div>
            </div>

            {/* Split Grid: Chart + Details (Top) and Watchlist (Bottom) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Interactive Chart (8 cols) */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                <StockChart
                  symbol={selectedSymbol}
                  currency={selectedQuote?.currency || 'USD'}
                  candles={candles}
                  previousClose={selectedQuote?.previous_close}
                  timeframe={timeframe}
                  setTimeframe={setTimeframe}
                  isLoading={isLoadingChart}
                />

                <WatchlistTable
                  quotes={quotes}
                  selectedSymbol={selectedSymbol}
                  onSelectSymbol={setSelectedSymbol}
                  onAddSymbol={handleAddSymbol}
                  onRemoveSymbol={handleRemoveSymbol}
                  onRefreshAll={() => fetchQuotes(symbols)}
                  isRefreshing={isRefreshingQuotes}
                />
              </div>

              {/* Right Column: Key Metrics & Shared Order Ticket */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                <StockDetailCard
                  quote={selectedQuote}
                  cashBalance={portfolio.cashBalance}
                  onTradeSimulate={(sym, side, shares, price) => handleExecuteTrade(sym, side, shares, price)}
                />
              </div>
            </div>

            {/* Live Financial News & Catalyst Ticker Section */}
            <div className="mt-2">
              <LiveNewsSection
                selectedSymbol={selectedSymbol}
                onSelectSymbol={setSelectedSymbol}
              />
            </div>

            {/* Phase 4: Automated Trading Trigger & Tradier Status Panel on Dashboard */}
            <div className="mt-2">
              <AutomatedTradingTriggerPanel
                portfolio={portfolio}
                onRefreshPortfolio={fetchPortfolioFromVault}
                onResetPortfolio={handleResetPortfolio}
              />
            </div>
          </div>
        )}

        {/* TAB 1.5: DEDICATED AUTO TRIGGERS (TRADIER) VIEW */}
        {activeTab === 'triggers' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <AutomatedTradingTriggerPanel
              portfolio={portfolio}
              onRefreshPortfolio={fetchPortfolioFromVault}
              onResetPortfolio={handleResetPortfolio}
            />
          </div>
        )}

        {/* TAB 2: TRADE VISUALIZER & EQUITY CURVE */}
        {activeTab === 'visualizer' && (
          <PortfolioVisualizer
            portfolio={portfolio}
            liveQuotes={quotes}
            onExecuteTrade={handleExecuteTrade}
            onResetPortfolio={handleResetPortfolio}
            onLoadBenchmarkTrades={handleLoadBenchmarkTrades}
            onNavigateToSimulator={() => setActiveTab('portfolio')}
            vaultStatus={vaultStatus}
            isVaultLoading={isVaultLoading}
            isSyncingVault={isSyncingVault}
            onSyncWithVault={handleSyncWithVault}
          />
        )}

        {/* TAB 3: C# PORTFOLIO (PHASE 2 & PHASE 3: THE VAULT) */}
        {activeTab === 'portfolio' && (
          <CSharpEngine
            liveQuotes={quotes}
            portfolio={portfolio}
            onIngestTicker={handleIngestTicker}
            onExecuteTrade={handleExecuteTrade}
            onResetPortfolio={handleResetPortfolio}
            onLoadBenchmarkTrades={handleLoadBenchmarkTrades}
            vaultStatus={vaultStatus}
            isVaultLoading={isVaultLoading}
            onSyncWithVault={handleSyncWithVault}
          />
        )}

        {/* TAB 3: PYTHON SCRIPT ENGINE (PHASE 1) */}
        {activeTab === 'python' && <PythonScriptEngine />}

        {/* TAB 4: API DOCS */}
        {activeTab === 'docs' && <ApiDocs />}

        {/* TAB 5: ROADMAP */}
        {activeTab === 'roadmap' && <Roadmap />}
      </main>

      {/* Clean Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 px-6 py-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-slate-400">ApexTrade</span>
            <span aria-hidden="true">·</span>
            <span>Stock Broker Architecture — Phase 2 C# Core Portfolio & Ticker Ingestion</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span>.NET 8.0 C# Core Engine</span>
            <span aria-hidden="true">·</span>
            <span>Baseline Cash: $100,000.00</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

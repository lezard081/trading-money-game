import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  PieChart as PieIcon,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Play,
  DollarSign,
  Activity,
  Shield,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Info,
  Database,
  HardDrive,
  RefreshCw,
  Download
} from 'lucide-react';
import { PortfolioState, StockQuote, TradeRecord, VaultDbStatus } from '../types.ts';

interface PortfolioVisualizerProps {
  portfolio: PortfolioState;
  liveQuotes: StockQuote[];
  onExecuteTrade: (symbol: string, side: 'BUY' | 'SELL', shares: number, price?: number) => { success: boolean; message: string };
  onResetPortfolio: () => void;
  onLoadBenchmarkTrades: () => void;
  onNavigateToSimulator: () => void;
  vaultStatus?: VaultDbStatus | null;
  isVaultLoading?: boolean;
  isSyncingVault?: boolean;
  onSyncWithVault?: () => void;
}

const ASSET_COLORS: Record<string, string> = {
  CASH: '#10b981', // Emerald
  AAPL: '#38bdf8', // Sky
  NVDA: '#a855f7', // Purple
  MSFT: '#f59e0b', // Amber
  TSLA: '#ec4899', // Pink
  GOOGL: '#3b82f6', // Blue
  AMZN: '#f97316', // Orange
  META: '#06b6d4', // Cyan
};

const FALLBACK_PALETTE = ['#6366f1', '#14b8a6', '#84cc16', '#eab308', '#d946ef', '#f43f5e'];

interface EquityPoint {
  index: number;
  label: string;
  timestamp: string;
  equity: number;
  cash: number;
  invested: number;
  cumulativeRealizedPnL: number;
  drawdownPercent: number;
  trade?: TradeRecord;
  isInitial?: boolean;
  isCurrent?: boolean;
}

export const PortfolioVisualizer: React.FC<PortfolioVisualizerProps> = ({
  portfolio,
  liveQuotes,
  onResetPortfolio,
  onLoadBenchmarkTrades,
  onNavigateToSimulator,
  vaultStatus,
  isVaultLoading,
  isSyncingVault,
  onSyncWithVault,
}) => {
  const [chartMode, setChartMode] = useState<'equity' | 'pnl' | 'drawdown'>('equity');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [hoveredAssetSymbol, setHoveredAssetSymbol] = useState<string | null>(null);
  const [activeTabSection, setActiveTabSection] = useState<'all' | 'equity' | 'allocation' | 'metrics'>('all');

  // 1. Build Chronological Equity Timeline Points
  const equityPoints: EquityPoint[] = useMemo(() => {
    const points: EquityPoint[] = [];

    // Origin Point (Baseline $100,000 cash)
    points.push({
      index: 0,
      label: 'Initial Capital',
      timestamp: 'Funded',
      equity: portfolio.initialBalance,
      cash: portfolio.initialBalance,
      invested: 0,
      cumulativeRealizedPnL: 0,
      drawdownPercent: 0,
      isInitial: true,
    });

    let runningPeak = portfolio.initialBalance;
    let runningRealized = 0;

    portfolio.tradeHistory.forEach((trade, idx) => {
      runningRealized += trade.realizedPnL;
      
      // Determine equity at this trade
      const equityAtTrade = trade.runningPortfolioValue ?? (trade.remainingCashBalance + (trade.runningInvestedValue ?? 0));
      if (equityAtTrade > runningPeak) {
        runningPeak = equityAtTrade;
      }

      const drawdown = runningPeak > 0 ? ((equityAtTrade - runningPeak) / runningPeak) * 100 : 0;

      points.push({
        index: idx + 1,
        label: `#${trade.runningOrderCount || idx + 1} ${trade.side} ${trade.symbol}`,
        timestamp: trade.timestamp,
        equity: equityAtTrade,
        cash: trade.remainingCashBalance,
        invested: trade.runningInvestedValue ?? Math.max(0, equityAtTrade - trade.remainingCashBalance),
        cumulativeRealizedPnL: runningRealized,
        drawdownPercent: Number(drawdown.toFixed(2)),
        trade,
      });
    });

    // Mark current live state as the latest active endpoint
    const latestPeak = Math.max(runningPeak, portfolio.totalPortfolioValue);
    const currentDrawdown = latestPeak > 0 ? ((portfolio.totalPortfolioValue - latestPeak) / latestPeak) * 100 : 0;

    points.push({
      index: points.length,
      label: 'Live Mark-to-Market',
      timestamp: 'Now',
      equity: portfolio.totalPortfolioValue,
      cash: portfolio.cashBalance,
      invested: portfolio.investedValue,
      cumulativeRealizedPnL: portfolio.totalRealizedPnL,
      drawdownPercent: Number(currentDrawdown.toFixed(2)),
      isCurrent: true,
    });

    return points;
  }, [portfolio]);

  const activeHoveredPoint = hoveredPointIndex !== null && hoveredPointIndex >= 0 && hoveredPointIndex < equityPoints.length
    ? equityPoints[hoveredPointIndex]
    : equityPoints[equityPoints.length - 1];

  // 2. Asset Allocation Breakdown computation
  const allocationData = useMemo(() => {
    const totalVal = Math.max(1, portfolio.totalPortfolioValue);
    const items: Array<{
      symbol: string;
      name: string;
      category: 'CASH' | 'EQUITY';
      marketValue: number;
      percentage: number;
      shares: number;
      costBasis: number;
      currentPrice: number;
      unrealizedPnL: number;
      unrealizedPnLPercent: number;
      color: string;
    }> = [];

    // Cash slice
    const cashPct = (portfolio.cashBalance / totalVal) * 100;
    items.push({
      symbol: 'CASH',
      name: 'Cash Reserve (USD)',
      category: 'CASH',
      marketValue: portfolio.cashBalance,
      percentage: Number(cashPct.toFixed(2)),
      shares: 0,
      costBasis: 1,
      currentPrice: 1,
      unrealizedPnL: 0,
      unrealizedPnLPercent: 0,
      color: ASSET_COLORS.CASH,
    });

    // Positions slices
    Object.values(portfolio.positions).forEach((pos, idx) => {
      const pct = (pos.marketValue / totalVal) * 100;
      const color = ASSET_COLORS[pos.symbol] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
      items.push({
        symbol: pos.symbol,
        name: `${pos.symbol} Common Stock`,
        category: 'EQUITY',
        marketValue: pos.marketValue,
        percentage: Number(pct.toFixed(2)),
        shares: pos.shares,
        costBasis: pos.averageCostBasis,
        currentPrice: pos.currentPrice,
        unrealizedPnL: pos.unrealizedPnL,
        unrealizedPnLPercent: pos.unrealizedPnLPercent,
        color,
      });
    });

    // Sort by market value descending (cash or highest position first)
    items.sort((a, b) => b.marketValue - a.marketValue);

    return {
      items,
      totalValue: totalVal,
      cashPercentage: Number(cashPct.toFixed(2)),
      equityPercentage: Number((100 - cashPct).toFixed(2)),
      openPositionsCount: Object.keys(portfolio.positions).length,
      largestPosition: items.find((i) => i.category === 'EQUITY'),
    };
  }, [portfolio]);

  // 3. SVG Drawing coordinates for Equity Curve
  const chartWidth = 860;
  const chartHeight = 280;
  const padding = { top: 30, right: 35, bottom: 40, left: 75 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const { minVal, maxVal, pathD, areaD, baselineY, peakY, peakVal } = useMemo(() => {
    if (equityPoints.length === 0) {
      return { minVal: 95000, maxVal: 105000, pathD: '', areaD: '', baselineY: 0, peakY: 0, peakVal: 100000 };
    }

    let values: number[] = [];
    if (chartMode === 'equity') {
      values = equityPoints.map((p) => p.equity);
      values.push(100_000); // ensure baseline is within scale
    } else if (chartMode === 'pnl') {
      values = equityPoints.map((p) => p.cumulativeRealizedPnL);
      values.push(0);
    } else {
      values = equityPoints.map((p) => p.drawdownPercent);
      values.push(0);
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || (chartMode === 'equity' ? 2000 : 10);
    const padSpan = span * 0.15; // 15% buffer top & bottom
    const effectiveMin = min - padSpan;
    const effectiveMax = max + padSpan;

    const getX = (idx: number) => {
      if (equityPoints.length <= 1) return padding.left + innerWidth / 2;
      return padding.left + (idx / (equityPoints.length - 1)) * innerWidth;
    };

    const getY = (val: number) => {
      const normalized = (val - effectiveMin) / (effectiveMax - effectiveMin || 1);
      return padding.top + innerHeight - normalized * innerHeight;
    };

    const pointsCoords = equityPoints.map((p, i) => {
      const val = chartMode === 'equity' ? p.equity : chartMode === 'pnl' ? p.cumulativeRealizedPnL : p.drawdownPercent;
      return { x: getX(i), y: getY(val) };
    });

    // Build SVG path
    let pD = '';
    pointsCoords.forEach((pt, i) => {
      if (i === 0) {
        pD += `M ${pt.x} ${pt.y}`;
      } else {
        // Smooth bezier interpolation
        const prev = pointsCoords[i - 1];
        const cpX = (prev.x + pt.x) / 2;
        pD += ` C ${cpX} ${prev.y}, ${cpX} ${pt.y}, ${pt.x} ${pt.y}`;
      }
    });

    // Build closed area path down to baseline
    const bottomY = padding.top + innerHeight;
    const firstX = pointsCoords[0]?.x ?? padding.left;
    const lastX = pointsCoords[pointsCoords.length - 1]?.x ?? padding.left + innerWidth;
    const aD = `${pD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    const bY = chartMode === 'equity' ? getY(100_000) : getY(0);
    const peakValCalculated = Math.max(...equityPoints.map((p) => (chartMode === 'equity' ? p.equity : p.cumulativeRealizedPnL)));
    const pY = getY(peakValCalculated);

    return {
      minVal: effectiveMin,
      maxVal: effectiveMax,
      pathD: pD,
      areaD: aD,
      baselineY: bY,
      peakY: pY,
      peakVal: peakValCalculated,
    };
  }, [equityPoints, chartMode, innerWidth, innerHeight, padding]);

  // Donut chart path calculations
  const donutCenter = 100;
  const donutRadius = 75;
  const donutHole = 52;

  const donutSlices = useMemo(() => {
    let currentAngle = -Math.PI / 2; // start at top (12 o'clock)
    return allocationData.items.map((item) => {
      const sliceAngle = (item.percentage / 100) * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const x1 = donutCenter + donutRadius * Math.cos(startAngle);
      const y1 = donutCenter + donutRadius * Math.sin(startAngle);
      const x2 = donutCenter + donutRadius * Math.cos(endAngle);
      const y2 = donutCenter + donutRadius * Math.sin(endAngle);

      const x3 = donutCenter + donutHole * Math.cos(endAngle);
      const y3 = donutCenter + donutHole * Math.sin(endAngle);
      const x4 = donutCenter + donutHole * Math.cos(startAngle);
      const y4 = donutCenter + donutHole * Math.sin(startAngle);

      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const path = `M ${x1} ${y1} A ${donutRadius} ${donutRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${donutHole} ${donutHole} 0 ${largeArc} 0 ${x4} ${y4} Z`;

      return {
        ...item,
        path,
        startAngle,
        endAngle,
      };
    });
  }, [allocationData]);

  // Diversification Rating
  const diversificationScore = useMemo(() => {
    const stockCount = allocationData.openPositionsCount;
    if (stockCount === 0) return { score: 10, label: '100% Cash / Idle' };
    const maxWeight = Math.max(...allocationData.items.filter((i) => i.category === 'EQUITY').map((i) => i.percentage), 0);
    if (maxWeight > 60) return { score: 35, label: 'High Concentration Risk' };
    if (stockCount >= 4 && maxWeight < 35) return { score: 85, label: 'Balanced Diversification' };
    return { score: 60, label: 'Moderate Distribution' };
  }, [allocationData]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header & Quick Action Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-purple-400" />
              <span>Visualize Trade History & Portfolio Analytics</span>
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
              C# Metrics Integrated
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            Continuous equity curve mapping portfolio net worth from the baseline <strong className="text-white">$100,000.00 cash</strong> across each order fill, paired with an interactive asset allocation breakdown and execution performance statistics.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onLoadBenchmarkTrades}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors shadow-sm shadow-purple-600/30"
            title="Load the 8-trade realistic benchmark sequence from C# Program.cs"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Load Benchmark Trades (8 Orders)</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToSimulator}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span>Open Order Ticket</span>
          </button>

          <button
            type="button"
            onClick={onResetPortfolio}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors border border-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset ($100K)</span>
          </button>
        </div>
      </div>

      {/* Phase 3: The Vault — SQLite Permanent Data Persistence Banner */}
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>Phase 3: The Vault</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-medium">
                  SQLite Active · apextrade.db
                </span>
              </span>
              {vaultStatus && (
                <span className="text-[11px] text-slate-400 font-mono">
                  ({((vaultStatus.fileSizeBytes || 28672) / 1024).toFixed(1)} KB)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Permanently saving data to <code className="text-emerald-300 font-mono">PortfolioState</code> table (Cash Reserves & Equity) and <code className="text-emerald-300 font-mono">TradeHistory</code> table ({vaultStatus?.tradeHistoryRows ?? portfolio.tradeHistory.length} orders logged). Automatically repopulates on boot & refresh.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSyncWithVault && (
            <button
              type="button"
              onClick={onSyncWithVault}
              disabled={isSyncingVault || isVaultLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
              title="Re-read current state from SQLite apextrade.db"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingVault || isVaultLoading ? 'animate-spin' : ''}`} />
              <span>{isSyncingVault || isVaultLoading ? 'Syncing...' : 'Sync from Vault'}</span>
            </button>
          )}

          <a
            href="/api/download/apextrade.db"
            download="apextrade.db"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            title="Download the raw SQLite database file"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Download apextrade.db</span>
          </a>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Net Portfolio Value */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span className="text-[11px] text-slate-400 font-medium">Net Portfolio Equity</span>
          <span className="text-lg font-bold text-white font-mono tabular-nums">
            ${portfolio.totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <div className="flex items-center gap-1 text-[10px] font-mono">
            {portfolio.totalNetPnL >= 0 ? (
              <span className="text-emerald-400 flex items-center">
                <ArrowUpRight className="w-3 h-3" />
                +${portfolio.totalNetPnL.toFixed(2)} ({portfolio.totalReturnPercent >= 0 ? '+' : ''}{portfolio.totalReturnPercent.toFixed(2)}%)
              </span>
            ) : (
              <span className="text-rose-400 flex items-center">
                <ArrowDownRight className="w-3 h-3" />
                -${Math.abs(portfolio.totalNetPnL).toFixed(2)} ({portfolio.totalReturnPercent.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>

        {/* 2. Cash Liquidity */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span className="text-[11px] text-slate-400 font-medium">Cash Reserve</span>
          <span className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
            ${portfolio.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {allocationData.cashPercentage}% Liquid Capital
          </span>
        </div>

        {/* 3. Invested Holdings */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span className="text-[11px] text-slate-400 font-medium">Active Holdings</span>
          <span className="text-lg font-bold text-white font-mono tabular-nums">
            ${portfolio.investedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {allocationData.openPositionsCount} Open Position(s)
          </span>
        </div>

        {/* 4. Win/Loss Ratio */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span className="text-[11px] text-slate-400 font-medium">Win / Loss Ratio</span>
          <span className="text-lg font-bold text-purple-400 font-mono tabular-nums">
            {portfolio.statistics.winLossRatio > 0 ? portfolio.statistics.winLossRatio.toFixed(2) : '—'}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {portfolio.statistics.winningTradesCount}W / {portfolio.statistics.losingTradesCount}L ({portfolio.statistics.winRatePercent.toFixed(1)}%)
          </span>
        </div>

        {/* 5. Average Profit Per Trade */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span className="text-[11px] text-slate-400 font-medium">Avg Profit / Trade</span>
          <span
            className={`text-lg font-bold font-mono tabular-nums ${
              portfolio.statistics.averageProfitPerTrade >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {portfolio.statistics.averageProfitPerTrade >= 0 ? '+' : ''}
            ${portfolio.statistics.averageProfitPerTrade.toFixed(2)}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            Across {portfolio.statistics.sellOrdersCount} closed exit(s)
          </span>
        </div>

        {/* 6. Total Executed Orders */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
          <span className="text-[11px] text-slate-400 font-medium">Total Orders</span>
          <span className="text-lg font-bold text-white font-mono tabular-nums">
            {portfolio.statistics.totalExecutedOrders}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            {portfolio.statistics.buyOrdersCount} Buys · {portfolio.statistics.sellOrdersCount} Sells
          </span>
        </div>
      </div>

      {/* View Segment Control */}
      <div className="flex items-center gap-1 p-1 bg-slate-900/80 rounded-lg border border-slate-800 w-fit text-xs">
        <button
          type="button"
          onClick={() => setActiveTabSection('all')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTabSection === 'all'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Comprehensive Dashboard
        </button>
        <button
          type="button"
          onClick={() => setActiveTabSection('equity')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTabSection === 'equity'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Equity Curve Focus
        </button>
        <button
          type="button"
          onClick={() => setActiveTabSection('allocation')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTabSection === 'allocation'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Asset Allocation
        </button>
        <button
          type="button"
          onClick={() => setActiveTabSection('metrics')}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            activeTabSection === 'metrics'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          C# Trade Metrics
        </button>
      </div>

      {/* SECTION 1: EQUITY CURVE OVER TIME */}
      {(activeTabSection === 'all' || activeTabSection === 'equity') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Portfolio Equity Curve & Mark-to-Market History
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {equityPoints.length} Data Points
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Tracks total portfolio liquidation value across all buy/sell fills against the $100K baseline capital.
              </p>
            </div>

            {/* Metric Mode Switcher */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setChartMode('equity')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  chartMode === 'equity'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Total Equity ($)
              </button>
              <button
                type="button"
                onClick={() => setChartMode('pnl')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  chartMode === 'pnl'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Realized P&L ($)
              </button>
              <button
                type="button"
                onClick={() => setChartMode('drawdown')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  chartMode === 'drawdown'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Drawdown (%)
              </button>
            </div>
          </div>

          {/* Interactive SVG Chart Container */}
          <div className="relative w-full bg-slate-950/80 rounded-xl border border-slate-800/80 p-2 overflow-hidden">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto select-none"
              style={{ maxHeight: '340px' }}
            >
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>

                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                </linearGradient>

                <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.05" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.3" />
                </linearGradient>
              </defs>

              {/* Horizontal grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = padding.top + innerHeight * (1 - pct);
                const val = minVal + pct * (maxVal - minVal);
                return (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={padding.left + innerWidth}
                      y2={y}
                      stroke="#334155"
                      strokeDasharray="3 3"
                      strokeOpacity="0.4"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3}
                      textAnchor="end"
                      fill="#64748b"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {chartMode === 'drawdown'
                        ? `${val.toFixed(1)}%`
                        : `$${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0)}`}
                    </text>
                  </g>
                );
              })}

              {/* Baseline $100K Reference Line (if in equity mode) */}
              {chartMode === 'equity' && baselineY >= padding.top && baselineY <= padding.top + innerHeight && (
                <g>
                  <line
                    x1={padding.left}
                    y1={baselineY}
                    x2={padding.left + innerWidth}
                    y2={baselineY}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth="1.2"
                    strokeOpacity="0.7"
                  />
                  <text
                    x={padding.left + innerWidth - 6}
                    y={baselineY - 5}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    $100,000 Baseline Capital
                  </text>
                </g>
              )}

              {/* Peak High-Water Mark Line */}
              {chartMode === 'equity' && peakY >= padding.top && peakY <= padding.top + innerHeight && (
                <g>
                  <line
                    x1={padding.left}
                    y1={peakY}
                    x2={padding.left + innerWidth}
                    y2={peakY}
                    stroke="#a855f7"
                    strokeDasharray="2 2"
                    strokeWidth="1"
                    strokeOpacity="0.6"
                  />
                  <text
                    x={padding.left + 8}
                    y={peakY - 5}
                    fill="#a855f7"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    Peak: ${peakVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </text>
                </g>
              )}

              {/* Filled Area under curve */}
              {areaD && (
                <path
                  d={areaD}
                  fill={
                    chartMode === 'equity'
                      ? 'url(#equityGradient)'
                      : chartMode === 'pnl'
                      ? 'url(#pnlGradient)'
                      : 'url(#drawdownGradient)'
                  }
                />
              )}

              {/* The main stroke line */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke={chartMode === 'equity' ? '#10b981' : chartMode === 'pnl' ? '#8b5cf6' : '#f43f5e'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Interactive Point Nodes */}
              {equityPoints.map((pt, i) => {
                const getX = () => {
                  if (equityPoints.length <= 1) return padding.left + innerWidth / 2;
                  return padding.left + (i / (equityPoints.length - 1)) * innerWidth;
                };

                const getY = () => {
                  const val = chartMode === 'equity' ? pt.equity : chartMode === 'pnl' ? pt.cumulativeRealizedPnL : pt.drawdownPercent;
                  const normalized = (val - minVal) / (maxVal - minVal || 1);
                  return padding.top + innerHeight - normalized * innerHeight;
                };

                const x = getX();
                const y = getY();
                const isHovered = hoveredPointIndex === i;

                // Color node according to event type
                let nodeFill = '#10b981';
                if (pt.isInitial) nodeFill = '#94a3b8';
                else if (pt.trade?.side === 'BUY') nodeFill = '#38bdf8';
                else if (pt.trade?.side === 'SELL') {
                  nodeFill = pt.trade.realizedPnL >= 0 ? '#10b981' : '#f43f5e';
                }

                return (
                  <g
                    key={i}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPointIndex(i)}
                    onMouseLeave={() => setHoveredPointIndex(null)}
                  >
                    {/* Hover guide line */}
                    {isHovered && (
                      <line
                        x1={x}
                        y1={padding.top}
                        x2={x}
                        y2={padding.top + innerHeight}
                        stroke="#e2e8f0"
                        strokeDasharray="2 2"
                        strokeWidth="1"
                        strokeOpacity="0.5"
                      />
                    )}

                    {/* Outer glow ring on hover */}
                    {isHovered && (
                      <circle
                        cx={x}
                        y={y}
                        r={8}
                        fill={nodeFill}
                        fillOpacity="0.25"
                      />
                    )}

                    {/* Central point circle */}
                    <circle
                      cx={x}
                      y={y}
                      r={isHovered ? 5 : 3.5}
                      fill={nodeFill}
                      stroke="#020617"
                      strokeWidth="1.5"
                      className="transition-all duration-150"
                    />

                    {/* Timestamp / Order # bottom label */}
                    <text
                      x={x}
                      y={padding.top + innerHeight + 18}
                      textAnchor="middle"
                      fill={isHovered ? '#f8fafc' : '#64748b'}
                      fontSize="9"
                      fontFamily="monospace"
                    >
                      {pt.isInitial ? 'T0' : pt.isCurrent ? 'Now' : `#${pt.trade?.runningOrderCount || i}`}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay Card */}
            {activeHoveredPoint && (
              <div className="mt-3 p-3 bg-slate-900 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      activeHoveredPoint.isInitial
                        ? 'bg-slate-400'
                        : activeHoveredPoint.trade?.side === 'BUY'
                        ? 'bg-sky-400'
                        : activeHoveredPoint.trade && activeHoveredPoint.trade.realizedPnL >= 0
                        ? 'bg-emerald-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  <div>
                    <span className="text-white font-bold">{activeHoveredPoint.label}</span>
                    <span className="text-slate-400 ml-2">({activeHoveredPoint.timestamp})</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-slate-300">
                  <div>
                    <span className="text-slate-500">Equity:</span>{' '}
                    <strong className="text-white">
                      ${activeHoveredPoint.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </strong>
                  </div>

                  <div>
                    <span className="text-slate-500">Cash:</span>{' '}
                    <span className="text-emerald-400">
                      ${activeHoveredPoint.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500">Cumulative Realized P&L:</span>{' '}
                    <span
                      className={
                        activeHoveredPoint.cumulativeRealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }
                    >
                      {activeHoveredPoint.cumulativeRealizedPnL >= 0 ? '+' : ''}
                      ${activeHoveredPoint.cumulativeRealizedPnL.toFixed(2)}
                    </span>
                  </div>

                  {activeHoveredPoint.trade?.side === 'SELL' && (
                    <div>
                      <span className="text-slate-500">Trade Realized:</span>{' '}
                      <span
                        className={
                          activeHoveredPoint.trade.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        {activeHoveredPoint.trade.realizedPnL >= 0 ? '+' : ''}
                        ${activeHoveredPoint.trade.realizedPnL.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="text-slate-500">Peak Drawdown:</span>{' '}
                    <span className={activeHoveredPoint.drawdownPercent < 0 ? 'text-rose-400' : 'text-slate-300'}>
                      {activeHoveredPoint.drawdownPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chart Legend & Visual Cues */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                <span>Buy Order Fill</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span>Profitable Sell (Win)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                <span>Unfavorable Sell (Loss)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-slate-400 border-b border-dashed border-slate-300" />
                <span>$100K Baseline</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span>Max Peak Equity: <strong className="text-purple-300">${peakVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: ASSET ALLOCATION BREAKDOWN (Donut + Stacked Bar + Holdings Matrix) */}
      {(activeTabSection === 'all' || activeTabSection === 'allocation') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Donut Chart Visualizer (5 Cols) */}
          <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  <PieIcon className="w-4 h-4 text-purple-400" />
                  Asset Allocation Breakdown
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {allocationData.items.length} Asset Classes
                </span>
              </div>

              {/* Donut Chart Canvas */}
              <div className="flex flex-col items-center justify-center my-4">
                <div className="relative w-52 h-52">
                  <svg viewBox="0 0 200 200" className="w-full h-full select-none">
                    {donutSlices.map((slice) => {
                      const isHovered = hoveredAssetSymbol === slice.symbol;
                      return (
                        <path
                          key={slice.symbol}
                          d={slice.path}
                          fill={slice.color}
                          opacity={hoveredAssetSymbol === null || isHovered ? 1 : 0.4}
                          stroke="#0f172a"
                          strokeWidth="2"
                          className="cursor-pointer transition-opacity duration-150"
                          onMouseEnter={() => setHoveredAssetSymbol(slice.symbol)}
                          onMouseLeave={() => setHoveredAssetSymbol(null)}
                        />
                      );
                    })}
                  </svg>

                  {/* Donut Center Display */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                      {hoveredAssetSymbol ? hoveredAssetSymbol : 'Total Portfolio'}
                    </span>
                    <span className="text-base font-bold text-white font-mono tabular-nums">
                      ${hoveredAssetSymbol
                        ? (allocationData.items.find((i) => i.symbol === hoveredAssetSymbol)?.marketValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : portfolio.totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[11px] font-mono text-purple-300">
                      {hoveredAssetSymbol
                        ? `${(allocationData.items.find((i) => i.symbol === hoveredAssetSymbol)?.percentage || 0).toFixed(1)}% Weight`
                        : `${allocationData.cashPercentage}% Cash`}
                    </span>
                  </div>
                </div>
              </div>

              {/* 100% Horizontal Stacked Bar */}
              <div className="flex flex-col gap-1.5 mt-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Exposure Distribution</span>
                  <span className="font-mono">
                    {allocationData.cashPercentage}% Cash · {allocationData.equityPercentage}% Equities
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-950 border border-slate-800">
                  {allocationData.items.map((item) => (
                    <div
                      key={item.symbol}
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: item.color,
                      }}
                      className="h-full transition-all duration-300"
                      title={`${item.symbol}: ${item.percentage}%`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Allocation Health & Concentration Check */}
            <div className="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-300">Risk Profile:</span>
                <span className="font-medium text-emerald-300">{diversificationScore.label}</span>
              </div>
              <span className="font-mono text-slate-400 text-[11px]">
                Score: {diversificationScore.score}/100
              </span>
            </div>
          </div>

          {/* Allocation Matrix & Holdings Table (7 Cols) */}
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-sky-400" />
                  Asset Allocation Ledger & Mark-to-Market
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {allocationData.items.length} Slices Active
                </span>
              </div>

              <div className="overflow-x-auto mt-3">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                      <th className="py-2 pr-3">Asset</th>
                      <th className="py-2 px-3 text-right">Shares</th>
                      <th className="py-2 px-3 text-right">Market Price</th>
                      <th className="py-2 px-3 text-right">Market Value</th>
                      <th className="py-2 px-3 text-right">Weight</th>
                      <th className="py-2 pl-3 text-right">Unrealized P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {allocationData.items.map((item) => {
                      const isHovered = hoveredAssetSymbol === item.symbol;
                      return (
                        <tr
                          key={item.symbol}
                          onMouseEnter={() => setHoveredAssetSymbol(item.symbol)}
                          onMouseLeave={() => setHoveredAssetSymbol(null)}
                          className={`hover:bg-slate-800/50 transition-colors ${
                            isHovered ? 'bg-slate-800/70' : ''
                          }`}
                        >
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <div>
                                <span className="font-bold text-white">{item.symbol}</span>
                                <span className="text-[10px] text-slate-500 block">
                                  {item.category === 'CASH' ? 'Liquid Cash' : 'Common Equity'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">
                            {item.shares > 0 ? item.shares.toLocaleString() : '—'}
                          </td>

                          <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">
                            {item.category === 'CASH' ? '$1.00' : `$${item.currentPrice.toFixed(2)}`}
                          </td>

                          <td className="py-2.5 px-3 text-right font-bold text-white tabular-nums">
                            ${item.marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          <td className="py-2.5 px-3 text-right text-purple-300 font-semibold tabular-nums">
                            {item.percentage.toFixed(2)}%
                          </td>

                          <td className="py-2.5 pl-3 text-right tabular-nums">
                            {item.category === 'CASH' ? (
                              <span className="text-slate-500">—</span>
                            ) : (
                              <span
                                className={`font-semibold ${
                                  item.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {item.unrealizedPnL >= 0 ? '+' : ''}${item.unrealizedPnL.toFixed(2)} (
                                {item.unrealizedPnLPercent >= 0 ? '+' : ''}
                                {item.unrealizedPnLPercent.toFixed(1)}%)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom summary bar */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Total Capital Account: <strong className="text-white">${portfolio.totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
              <span>Total Unrealized P&L: <strong className={portfolio.totalUnrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {portfolio.totalUnrealizedPnL >= 0 ? '+' : ''}${portfolio.totalUnrealizedPnL.toFixed(2)}
              </strong></span>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: C# EXECUTION METRICS DEEP-DIVE */}
      {(activeTabSection === 'all' || activeTabSection === 'metrics') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-sm font-bold text-white flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-purple-400" />
                C# Performance Metrics Log & Trade Quality Breakdown
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Computed by C# Portfolio core algorithms: Win/Loss Ratio, Profit Factor, Average Win vs Loss, and Dollar Turnover.
              </p>
            </div>
            <span className="text-xs font-mono text-purple-300">
              {portfolio.statistics.sellOrdersCount > 0 ? `${portfolio.statistics.winRatePercent.toFixed(1)}% Win Rate` : 'No Closed Sells Yet'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Win/Loss Ratio & Win Rate Gauge */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Win / Loss Ratio & Gauge</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-purple-400 font-mono tabular-nums">
                    {portfolio.statistics.winLossRatio > 0 ? portfolio.statistics.winLossRatio.toFixed(2) : '—'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    ({portfolio.statistics.winningTradesCount}W : {portfolio.statistics.losingTradesCount}L)
                  </span>
                </div>
              </div>

              {/* Visual Win vs Loss proportional bar */}
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mb-1">
                  <span className="text-emerald-400">Wins: {portfolio.statistics.winningTradesCount}</span>
                  <span className="text-rose-400">Losses: {portfolio.statistics.losingTradesCount}</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden bg-slate-800 flex">
                  <div
                    style={{
                      width: `${portfolio.statistics.winRatePercent}%`,
                    }}
                    className="bg-emerald-500 h-full"
                  />
                  <div
                    style={{
                      width: `${100 - portfolio.statistics.winRatePercent}%`,
                    }}
                    className="bg-rose-500 h-full"
                  />
                </div>
              </div>
            </div>

            {/* 2. Average Profit Per Trade */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Average Profit / Trade</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span
                    className={`text-2xl font-bold font-mono tabular-nums ${
                      portfolio.statistics.averageProfitPerTrade >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {portfolio.statistics.averageProfitPerTrade >= 0 ? '+' : ''}
                    ${portfolio.statistics.averageProfitPerTrade.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
                <span>Avg Win: <strong className="text-emerald-400">+${portfolio.statistics.averageWinningTrade.toFixed(2)}</strong></span>
                <span>Avg Loss: <strong className="text-rose-400">-${portfolio.statistics.averageLosingTrade.toFixed(2)}</strong></span>
              </div>
            </div>

            {/* 3. Profit Factor & Gross Breakdown */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Profit Factor</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold text-white font-mono tabular-nums">
                    {portfolio.statistics.profitFactor.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    (Gross Win / Gross Loss)
                  </span>
                </div>
              </div>

              <div className="mt-3 flex justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
                <span>Gross Gain: <strong className="text-emerald-400">+${portfolio.statistics.totalGrossProfit.toFixed(2)}</strong></span>
                <span>Gross Loss: <strong className="text-rose-400">-${portfolio.statistics.totalGrossLoss.toFixed(2)}</strong></span>
              </div>
            </div>

            {/* 4. Extreme Win vs Loss (Extremes) */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Extremes & Turnover</span>
                <div className="mt-1 flex flex-col gap-0.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Largest Win:</span>
                    <span className="text-emerald-400 font-bold">+${portfolio.statistics.largestWinningTrade.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Largest Loss:</span>
                    <span className="text-rose-400 font-bold">
                      {portfolio.statistics.largestLosingTrade < 0 ? `-$${Math.abs(portfolio.statistics.largestLosingTrade).toFixed(2)}` : '$0.00'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800/80 pt-2">
                <span>Turnover: <strong className="text-white">${portfolio.statistics.totalDollarTurnover.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: RECENT EXECUTION LOG TABLE */}
      {portfolio.tradeHistory.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-sm font-bold text-white flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              Chronological Trade Execution Ledger
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {portfolio.tradeHistory.length} Fills Recorded
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 px-2">Time</th>
                  <th className="py-2 px-2">Side</th>
                  <th className="py-2 px-2">Symbol</th>
                  <th className="py-2 px-2 text-right">Shares</th>
                  <th className="py-2 px-2 text-right">Execution Price</th>
                  <th className="py-2 px-2 text-right">Total Amount</th>
                  <th className="py-2 px-2 text-right">Realized P&L</th>
                  <th className="py-2 px-2 text-right">Remaining Cash</th>
                  <th className="py-2 px-2 text-right">Running W/L</th>
                  <th className="py-2 pl-2 text-right">Running Avg P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {portfolio.tradeHistory.slice().reverse().map((trade) => (
                  <tr key={trade.tradeId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 pr-2 text-slate-500">#{trade.runningOrderCount}</td>
                    <td className="py-2 px-2 text-slate-400">{trade.timestamp}</td>
                    <td className="py-2 px-2">
                      <span
                        className={`font-bold ${
                          trade.side === 'BUY' ? 'text-sky-400' : 'text-amber-400'
                        }`}
                      >
                        {trade.side}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-bold text-white">{trade.symbol}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-300">
                      {trade.shares.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-slate-300">
                      ${trade.executionPrice.toFixed(2)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-white">
                      ${trade.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {trade.side === 'SELL' ? (
                        <span
                          className={`font-semibold ${
                            trade.realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {trade.realizedPnL >= 0 ? '+' : ''}${trade.realizedPnL.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-emerald-400 font-semibold">
                      ${trade.remainingCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-purple-300">
                      {trade.runningWinLossRatio > 0 ? trade.runningWinLossRatio.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums">
                      <span
                        className={
                          trade.runningAverageProfitPerTrade >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        {trade.runningAverageProfitPerTrade >= 0 ? '+' : ''}
                        ${trade.runningAverageProfitPerTrade.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { CheckCircle2, Circle, ArrowRight, Zap, Database, TrendingUp, Cpu } from 'lucide-react';

export const Roadmap: React.FC = () => {
  const phases = [
    {
      phase: 'Phase 1',
      title: 'Live Market Data & Financial API Script Engine',
      status: 'completed',
      icon: Database,
      items: [
        'Standalone Python script (scripts/fetch_stocks.py) using pure standard library',
        'Real-time quotes with bid/ask, day high/low, volume, and percentage change',
        'Historical OHLCV candle streams (1m, 5m, 15m, 1h, 1d, 1mo)',
        'Support for multiple output formats: terminal table, JSON, CSV',
        'Continuous live watch mode with auto-refresh',
        'Integrated web-based Python execution sandbox with live terminal output',
      ],
    },
    {
      phase: 'Phase 2',
      title: 'C# Portfolio Data Structure, Trade Metrics & History Visualizer',
      status: 'completed',
      icon: Zap,
      items: [
        'C# Portfolio class with $100,000 cash balance tracking (csharp/Portfolio.cs)',
        'Incoming market stock price ticker ingestion (ProcessTicker / StockTicker record)',
        'Mark-to-market position revaluation with unrealized P&L recalculation',
        'Weighted average cost basis computation on sequential buy fills',
        'Running log of execution metrics: Win/Loss Ratio, average profit per trade, and total orders',
        'Interactive SVG Equity Curve timeline mapping portfolio growth from $100K baseline',
        'Asset Allocation Breakdown with interactive Donut chart and exposure ledger',
        'Thread-safe concurrency with lock(_syncLock) and event streaming',
        'Interactive in-browser .NET 8 CLI runner with real-time compilation',
      ],
    },
    {
      phase: 'Phase 3',
      title: 'The Vault: SQLite Permanent Data Persistence & C# Backend Engine',
      status: 'completed',
      icon: Database,
      items: [
        'Local SQLite database named apextrade.db running in WAL high-performance journal mode',
        'PortfolioState schema storing Cash Reserves, Invested Capital, Total Equity, and JSON position state',
        'TradeHistory schema logging past orders, execution prices, quantities, side, and running execution metrics',
        'Automatic C# engine writes to SQLite tables on Load Benchmark Trades and real-time order executions',
        'Automatic boot-up and refresh hydration: reads apextrade.db to repopulate portfolio dashboard & equity curve',
        'REST API integration with direct apextrade.db download and C# VaultDb engine source code endpoints',
      ],
    },
    {
      phase: 'Phase 4',
      title: 'Tradier Model Context Protocol (MCP) Server Integration',
      status: 'completed',
      icon: Cpu,
      items: [
        'SQLite signals table schema tracking id, symbol, side, quantity, type, price, status, created_at, response',
        'C# Calculation Engine (TradingTriggerEngine.cs) tracking target stocks: INTC, AMD, F',
        'Automated 2% dip evaluation rule: price drops >= 2.0% vs previous close automatically insert PENDING orders',
        'C# micro-lot sizing (1 to 3 shares max per trigger) and $50 liquid reserve for small accounts ($100–$500 budget)',
        'Slippage & Spread Safety Guardrail: automatically aborts trades if bid-ask spread exceeds 1.0%',
        'Tradier Hosted Model Context Protocol (MCP) Server integration for Account 6YC17358',
        'Natural Language Tool Studio for balance telemetry, live quote spreads, and MCP order routing',
      ],
    },
    {
      phase: 'Phase 5',
      title: 'Portfolio Analytics & Multi-Asset Risk Management',
      status: 'next',
      icon: TrendingUp,
      items: [
        'Portfolio performance benchmarks against S&P 500 (SPY) and NASDAQ (QQQ)',
        'Risk metrics: Sharpe Ratio, Sortino Ratio, Maximum Drawdown, Beta',
        'Asset allocation diversification donut chart (Sectors, Equities, Crypto, Cash)',
        'Multi-asset support (ETFs, Crypto, Forex, Options chains)',
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white">
            Stock Broker Application Roadmap
          </h1>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
            Phase 1, 2, 3 & 4 (Automated Triggers) Live
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Architectural blueprint from Phase 1 data ingestion to Phase 2 C# math, Phase 3 SQLite vault, and Phase 4 Tradier automated execution bridge.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {phases.map((p, idx) => {
          const isDone = p.status === 'completed';
          const isNext = p.status === 'next';
          const IconComponent = p.icon;

          return (
            <div
              key={p.phase}
              className={`p-5 rounded-xl border transition-all ${
                isDone
                  ? 'bg-slate-900/90 border-emerald-500/30'
                  : isNext
                  ? 'bg-slate-900/90 border-amber-500/30'
                  : 'bg-slate-900/40 border-slate-800/80 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isDone
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : isNext
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono tracking-wider text-slate-400">
                        {p.phase}
                      </span>
                      {isDone && (
                        <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active / Completed</span>
                        </span>
                      )}
                      {isNext && (
                        <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                          <Circle className="w-3.5 h-3.5 fill-amber-400/20" />
                          <span>Up Next: Ready to Build</span>
                        </span>
                      )}
                    </div>
                    <h2 className="text-sm font-semibold text-white mt-0.5">{p.title}</h2>
                  </div>
                </div>

                {isNext && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-medium">
                    <span>Ask to start Phase 2</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-3 text-xs text-slate-300">
                {p.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className={`text-xs mt-0.5 font-bold ${
                        isDone ? 'text-emerald-400' : isNext ? 'text-amber-400' : 'text-slate-600'
                      }`}
                    >
                      •
                    </span>
                    <span className={isDone ? 'text-slate-300' : 'text-slate-400'}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

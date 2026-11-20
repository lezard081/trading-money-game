import React, { useState } from 'react';
import {
  Play,
  Download,
  Copy,
  Check,
  Terminal,
  FileCode,
  Clock,
  Cpu,
  RefreshCw,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  ShieldCheck,
  DollarSign,
  TrendingUp,
  Database,
  Layers,
  HardDrive,
  FileSpreadsheet,
} from 'lucide-react';
import { StockQuote, PortfolioState, CSharpRunResponse, VaultDbStatus } from '../types.ts';
import { PortfolioVisualizer } from './PortfolioVisualizer.tsx';
import {
  portfolioCsCode,
  vaultDbCsCode,
  tradingTriggerEngineCsCode,
  programCsCode,
  portfolioStateSqlSchema,
  tradeHistorySqlSchema,
  signalsSqlSchema,
} from '../data/csharpSource.ts';

interface CSharpEngineProps {
  liveQuotes: StockQuote[];
  portfolio: PortfolioState;
  onIngestTicker: (symbol: string, price: number, change: number, changePercent: number) => void;
  onExecuteTrade: (symbol: string, side: 'BUY' | 'SELL', shares: number, price?: number) => { success: boolean; message: string };
  onResetPortfolio: () => void;
  onLoadBenchmarkTrades: () => void;
  vaultStatus?: VaultDbStatus | null;
  isVaultLoading?: boolean;
  onSyncWithVault?: () => Promise<void>;
}

export const CSharpEngine: React.FC<CSharpEngineProps> = ({
  liveQuotes,
  portfolio,
  onIngestTicker,
  onExecuteTrade,
  onResetPortfolio,
  onLoadBenchmarkTrades,
  vaultStatus,
  isVaultLoading = false,
  onSyncWithVault,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'visualizer' | 'vault' | 'simulator' | 'terminal' | 'source' | 'architecture'>('visualizer');
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeSourceFile, setActiveSourceFile] = useState<'Portfolio.cs' | 'VaultDb.cs' | 'TradingTriggerEngine.cs' | 'Program.cs'>('VaultDb.cs');
  const [activeSchemaTab, setActiveSchemaTab] = useState<'PortfolioState' | 'TradeHistory' | 'signals'>('PortfolioState');

  // Manual ticker ingestion form
  const [customSymbol, setCustomSymbol] = useState('NVDA');
  const [customPrice, setCustomPrice] = useState<number>(225.50);
  const [customChange, setCustomChange] = useState<number>(7.56);
  const [customChangePercent, setCustomChangePercent] = useState<number>(3.47);

  // Order trade ticket
  const [orderSymbol, setOrderSymbol] = useState('AAPL');
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderShares, setOrderShares] = useState<number>(25);
  const [orderMessage, setOrderMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // .NET CLI Runner State
  const [isDotnetRunning, setIsDotnetRunning] = useState(false);
  const [dotnetOutput, setDotnetOutput] = useState<CSharpRunResponse | null>(null);
  const [cliPreset, setCliPreset] = useState<'default' | 'read-db' | 'load-benchmark' | 'db-status' | 'reset-db'>('read-db');
  const [jsonMode, setJsonMode] = useState(true);

  // Execute C# program on backend via dotnet CLI
  const runDotnetCLI = async (overridePreset?: string) => {
    setIsDotnetRunning(true);
    const selectedPreset = overridePreset || cliPreset;

    let flags: string[] = [];
    if (selectedPreset === 'read-db') {
      flags = ['--read-db', jsonMode ? '--json' : ''];
    } else if (selectedPreset === 'load-benchmark') {
      flags = ['--load-benchmark', jsonMode ? '--json' : ''];
    } else if (selectedPreset === 'db-status') {
      flags = ['--db-status', jsonMode ? '--json' : ''];
    } else if (selectedPreset === 'reset-db') {
      flags = ['--reset-db', jsonMode ? '--json' : ''];
    } else if (jsonMode) {
      flags = ['--json'];
    }
    flags = flags.filter(Boolean);

    try {
      const resp = await fetch('/api/csharp/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonOutput: jsonMode, flags }),
      });
      const data: CSharpRunResponse = await resp.json();
      setDotnetOutput(data);

      // If user ran read-db or benchmark or reset, sync with vault
      if (['read-db', 'load-benchmark', 'reset-db'].includes(selectedPreset) && onSyncWithVault) {
        onSyncWithVault();
      }
    } catch (err: any) {
      setDotnetOutput({
        success: false,
        exitCode: 1,
        durationMs: 0,
        command: `dotnet run --project csharp/ApexTrade.Portfolio ${flags.join(' ')}`,
        stdout: '',
        stderr: err.message || 'Failed to communicate with dotnet execution engine.',
      });
    } finally {
      setIsDotnetRunning(false);
    }
  };

  const handleManualIngest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSymbol.trim() || customPrice <= 0) return;
    onIngestTicker(customSymbol.trim().toUpperCase(), customPrice, customChange, customChangePercent);
  };

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = onExecuteTrade(orderSymbol, orderSide, orderShares);
    setOrderMessage({ text: result.message, isError: !result.success });
    setTimeout(() => setOrderMessage(null), 5000);
  };

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const openPositionsList = Object.values(portfolio.positions);
  const currentQuoteForOrder = liveQuotes.find((q) => q.symbol === orderSymbol);
  const currentPriceForOrder = currentQuoteForOrder?.price || 100;
  const estimatedOrderCost = currentPriceForOrder * orderShares;

  const currentSourceSnippet =
    activeSourceFile === 'Portfolio.cs'
      ? portfolioCsCode
      : activeSourceFile === 'VaultDb.cs'
      ? vaultDbCsCode
      : activeSourceFile === 'TradingTriggerEngine.cs'
      ? tradingTriggerEngineCsCode
      : programCsCode;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>ApexTrade C# Core Engine</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                .NET 8.0 Active
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 flex items-center gap-1 font-mono">
                <Database className="w-3 h-3 text-purple-400" />
                <span>Phase 3: The Vault</span>
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Enterprise high-performance portfolio accounting with SQLite <code className="text-purple-300 font-mono">apextrade.db</code> persistence, concurrent tick streaming, and running trade metrics.
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onLoadBenchmarkTrades}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors shadow-sm shadow-purple-600/30"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Load Benchmark Trades</span>
          </button>

          {onSyncWithVault && (
            <button
              onClick={() => onSyncWithVault()}
              disabled={isVaultLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isVaultLoading ? 'animate-spin' : ''}`} />
              <span>Sync Vault</span>
            </button>
          )}

          <button
            onClick={onResetPortfolio}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-300 bg-slate-900 hover:bg-rose-950/30 rounded-lg transition-colors border border-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to $100K</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800 text-xs scrollbar-none">
        <button
          onClick={() => setActiveSubTab('visualizer')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
            activeSubTab === 'visualizer'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <span>Visualize Trade History & Allocation</span>
        </button>

        <button
          onClick={() => setActiveSubTab('vault')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
            activeSubTab === 'vault'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-purple-400" />
          <span>Phase 3: The Vault (SQLite Engine)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('simulator')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
            activeSubTab === 'simulator'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>Interactive $100K Simulator</span>
        </button>

        <button
          onClick={() => setActiveSubTab('terminal')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
            activeSubTab === 'terminal'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>Live .NET 8 CLI Runner</span>
        </button>

        <button
          onClick={() => setActiveSubTab('source')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
            activeSubTab === 'source'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-3.5 h-3.5 text-sky-400" />
          <span>C# Source Code ({activeSourceFile})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('architecture')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap ${
            activeSubTab === 'architecture'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>Architecture & Formula Specs</span>
        </button>
      </div>

      {/* TAB 0: VISUALIZE TRADE HISTORY & ALLOCATION */}
      {activeSubTab === 'visualizer' && (
        <PortfolioVisualizer
          portfolio={portfolio}
          liveQuotes={liveQuotes}
          onExecuteTrade={onExecuteTrade}
          onResetPortfolio={onResetPortfolio}
          onLoadBenchmarkTrades={onLoadBenchmarkTrades}
          onNavigateToSimulator={() => setActiveSubTab('simulator')}
          vaultStatus={vaultStatus}
          isVaultLoading={isVaultLoading}
          onSyncWithVault={onSyncWithVault}
        />
      )}

      {/* TAB 1: PHASE 3 - THE VAULT (SQLITE DATABASE ENGINE) */}
      {activeSubTab === 'vault' && (
        <div className="flex flex-col gap-6">
          {/* Vault Status Header Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Database File</span>
              <span className="text-sm font-bold text-white font-mono truncate">
                {vaultStatus?.databaseFileName || 'apextrade.db'}
              </span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                <Check className="w-3 h-3" />
                <span>SQLite 3 (WAL Mode)</span>
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Vault File Size</span>
              <span className="text-sm font-bold text-purple-300 font-mono">
                {vaultStatus?.fileSizeBytes ? `${(vaultStatus.fileSizeBytes / 1024).toFixed(1)} KB` : '28.0 KB'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Zero Overhead</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">PortfolioState Rows</span>
              <span className="text-sm font-bold text-white font-mono">
                {vaultStatus?.portfolioStateRows ?? 1} row
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Primary Key Id=1</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">TradeHistory Rows</span>
              <span className="text-sm font-bold text-white font-mono">
                {vaultStatus?.tradeHistoryRows ?? portfolio.tradeHistory.length} orders
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Immutable Audit Log</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Cash Reserves</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                ${portfolio.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">From apextrade.db</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Total Equity</span>
              <span className="text-sm font-bold text-white font-mono">
                ${portfolio.totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {portfolio.totalReturnPercent >= 0 ? '+' : ''}
                {portfolio.totalReturnPercent.toFixed(2)}% ROI
              </span>
            </div>
          </div>

          {/* Quick Actions & Downloads Bar */}
          <div className="p-4 bg-slate-900/80 border border-purple-500/20 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-semibold text-white">Vault Operations:</span>
              <span className="text-xs text-slate-400">
                All data is auto-persisted to <code className="text-purple-300 font-mono">apextrade.db</code> on every order execution.
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <a
                href="/api/download/apextrade.db"
                download="apextrade.db"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-300 bg-purple-950/60 hover:bg-purple-900/60 rounded-lg border border-purple-500/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download apextrade.db</span>
              </a>

              <a
                href="/api/download/VaultDb.cs"
                download="VaultDb.cs"
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 rounded-lg border border-emerald-500/30 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download VaultDb.cs</span>
              </a>

              {onSyncWithVault && (
                <button
                  onClick={() => onSyncWithVault()}
                  disabled={isVaultLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isVaultLoading ? 'animate-spin' : ''}`} />
                  <span>Sync from Vault</span>
                </button>
              )}
            </div>
          </div>

          {/* Dual Schemas Inspection View */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 6 cols: Schema Selector & DDL */}
            <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-semibold text-white">SQLite Schemas</h3>
                </div>

                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setActiveSchemaTab('PortfolioState')}
                    className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                      activeSchemaTab === 'PortfolioState'
                        ? 'bg-purple-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    PortfolioState
                  </button>
                  <button
                    onClick={() => setActiveSchemaTab('TradeHistory')}
                    className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                      activeSchemaTab === 'TradeHistory'
                        ? 'bg-purple-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    TradeHistory
                  </button>
                  <button
                    onClick={() => setActiveSchemaTab('signals')}
                    className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                      activeSchemaTab === 'signals'
                        ? 'bg-amber-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    signals (Phase 4)
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-400">
                {activeSchemaTab === 'PortfolioState' ? (
                  <p>
                    Stores singleton portfolio state record (<code>Id=1</code>) containing Cash Reserves, total invested securities, P&L breakdown, and serialized active positions JSON.
                  </p>
                ) : activeSchemaTab === 'TradeHistory' ? (
                  <p>
                    Append-only audit ledger recording every executed buy and sell transaction, fill price, quantity, realized gain, and running performance metrics.
                  </p>
                ) : (
                  <p>
                    Phase 4 automated trading queue tracking dip triggers (<code>status='PENDING'</code>), quantity, type, price, and Tradier REST API execution payload (<code>status='EXECUTED'</code>).
                  </p>
                )}
              </div>

              {/* DDL SQL Block */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/60 text-[11px] font-mono text-slate-500">
                  <span>DDL SQL Definition</span>
                  <button
                    onClick={() => copyCode(activeSchemaTab === 'PortfolioState' ? portfolioStateSqlSchema : activeSchemaTab === 'TradeHistory' ? tradeHistorySqlSchema : signalsSqlSchema)}
                    className="text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>Copy DDL</span>
                  </button>
                </div>
                <pre className="text-xs font-mono text-purple-300 overflow-x-auto leading-relaxed">
                  {activeSchemaTab === 'PortfolioState' ? portfolioStateSqlSchema : activeSchemaTab === 'TradeHistory' ? tradeHistorySqlSchema : signalsSqlSchema}
                </pre>
              </div>
            </div>

            {/* Right 6 cols: Live Data Preview from Vault */}
            <div className="lg:col-span-6 bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Live Record Data: <code className="text-purple-300 font-mono">{activeSchemaTab}</code>
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {activeSchemaTab === 'PortfolioState' ? '1 row' : `${portfolio.tradeHistory.length} rows`}
                </span>
              </div>

              {activeSchemaTab === 'PortfolioState' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500 text-[11px]">
                        <th className="py-2 px-3">Column</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3 text-right">Persisted Value in Vault</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      <tr>
                        <td className="py-2 px-3 text-purple-300 font-semibold">Id</td>
                        <td className="py-2 px-3 text-slate-500">INTEGER PK</td>
                        <td className="py-2 px-3 text-right font-bold text-white">1</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-purple-300 font-semibold">CashReserves</td>
                        <td className="py-2 px-3 text-slate-500">REAL</td>
                        <td className="py-2 px-3 text-right text-emerald-400 font-bold">${portfolio.cashBalance.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-purple-300 font-semibold">InitialBalance</td>
                        <td className="py-2 px-3 text-slate-500">REAL</td>
                        <td className="py-2 px-3 text-right text-slate-400">${portfolio.initialBalance.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-purple-300 font-semibold">InvestedValue</td>
                        <td className="py-2 px-3 text-slate-500">REAL</td>
                        <td className="py-2 px-3 text-right text-white">${portfolio.investedValue.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-purple-300 font-semibold">TotalEquity</td>
                        <td className="py-2 px-3 text-slate-500">REAL</td>
                        <td className="py-2 px-3 text-right text-white font-bold">${portfolio.totalPortfolioValue.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-purple-300 font-semibold">TotalRealizedPnL</td>
                        <td className="py-2 px-3 text-slate-500">REAL</td>
                        <td className={`py-2 px-3 text-right font-bold ${portfolio.totalRealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {portfolio.totalRealizedPnL >= 0 ? '+' : ''}${portfolio.totalRealizedPnL.toFixed(2)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-purple-300 font-semibold">OpenPositionsCount</td>
                        <td className="py-2 px-3 text-slate-500">INTEGER</td>
                        <td className="py-2 px-3 text-right text-white">{openPositionsList.length}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-purple-300 font-semibold">UpdatedAt</td>
                        <td className="py-2 px-3 text-slate-500">TEXT</td>
                        <td className="py-2 px-3 text-right text-slate-400">{vaultStatus?.lastUpdated || new Date().toLocaleTimeString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-500 text-[11px]">
                      <tr>
                        <th className="py-2 px-2">Side</th>
                        <th className="py-2 px-2">Symbol</th>
                        <th className="py-2 px-2 text-right">Shares</th>
                        <th className="py-2 px-2 text-right">Price</th>
                        <th className="py-2 px-2 text-right">Realized P&L</th>
                        <th className="py-2 px-2 text-right">Remaining Cash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {portfolio.tradeHistory.map((trade, idx) => (
                        <tr key={trade.tradeId || idx} className="hover:bg-slate-800/40">
                          <td className="py-2 px-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                trade.side === 'BUY'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {trade.side}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-bold text-white">{trade.symbol}</td>
                          <td className="py-2 px-2 text-right">{trade.shares}</td>
                          <td className="py-2 px-2 text-right">${trade.executionPrice.toFixed(2)}</td>
                          <td
                            className={`py-2 px-2 text-right font-semibold ${
                              trade.side === 'SELL'
                                ? trade.realizedPnL >= 0
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {trade.side === 'SELL'
                              ? `${trade.realizedPnL >= 0 ? '+' : ''}$${trade.realizedPnL.toFixed(2)}`
                              : '—'}
                          </td>
                          <td className="py-2 px-2 text-right text-slate-400">${trade.remainingCashBalance.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE $100K PORTFOLIO SIMULATOR */}
      {activeSubTab === 'simulator' && (
        <div className="flex flex-col gap-6">
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Initial Capital</span>
              <span className="text-lg font-bold text-white font-mono tabular-nums">
                ${portfolio.initialBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Phase 2 Baseline</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Available Cash</span>
              <span className="text-lg font-bold text-emerald-400 font-mono tabular-nums">
                ${portfolio.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {((portfolio.cashBalance / portfolio.totalPortfolioValue) * 100).toFixed(1)}% Liquidity
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Invested Securities</span>
              <span className="text-lg font-bold text-white font-mono tabular-nums">
                ${portfolio.investedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {openPositionsList.length} Open Position(s)
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Total Net Portfolio</span>
              <span className="text-lg font-bold text-white font-mono tabular-nums">
                ${portfolio.totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Cash + Securities</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Realized P&L</span>
              <span
                className={`text-lg font-bold font-mono tabular-nums ${
                  portfolio.totalRealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {portfolio.totalRealizedPnL >= 0 ? '+' : ''}
                ${portfolio.totalRealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Closed Profits</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium">Total Net Return</span>
              <div className="flex items-center gap-1">
                {portfolio.totalNetPnL >= 0 ? (
                  <ArrowUpRight className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span
                  className={`text-lg font-bold font-mono tabular-nums ${
                    portfolio.totalNetPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {portfolio.totalNetPnL >= 0 ? '+' : ''}
                  ${portfolio.totalNetPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {portfolio.totalReturnPercent >= 0 ? '+' : ''}
                {portfolio.totalReturnPercent.toFixed(2)}% ROI
              </span>
            </div>
          </div>

          {/* Interactive Trade Execution & Manual Ticker Ingestion */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 8 cols: Open Positions Table */}
            <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white">Active Positions Ledger</h3>
                <span className="text-xs text-slate-400 font-mono">
                  {openPositionsList.length} Active Positions
                </span>
              </div>

              {openPositionsList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No active positions in portfolio. Place a BUY order to open positions and persist into SQLite apextrade.db.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="border-b border-slate-800 text-slate-500 text-[11px]">
                      <tr>
                        <th className="py-2 px-3">Symbol</th>
                        <th className="py-2 px-3 text-right">Shares</th>
                        <th className="py-2 px-3 text-right">Avg Cost</th>
                        <th className="py-2 px-3 text-right">Market Price</th>
                        <th className="py-2 px-3 text-right">Market Value</th>
                        <th className="py-2 px-3 text-right">Unrealized P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {openPositionsList.map((pos) => (
                        <tr key={pos.symbol} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-bold text-white">{pos.symbol}</td>
                          <td className="py-2.5 px-3 text-right">{pos.shares}</td>
                          <td className="py-2.5 px-3 text-right">${pos.averageCostBasis.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right">${pos.currentPrice.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-white">${pos.marketValue.toFixed(2)}</td>
                          <td
                            className={`py-2.5 px-3 text-right font-bold ${
                              pos.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(2)} ({pos.unrealizedPnLPercent.toFixed(2)}%)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right 4 cols: Trade Ticket & Ticker Simulator */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {/* Trade Ticket */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-white">Execute Order</h3>
                  <span className="text-[11px] text-purple-400 font-mono">ExecuteOrder()</span>
                </div>

                <form onSubmit={handleOrderSubmit} className="flex flex-col gap-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderSide('BUY')}
                      className={`py-1.5 rounded font-bold transition-colors ${
                        orderSide === 'BUY'
                          ? 'bg-emerald-500 text-slate-950 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}
                    >
                      BUY
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderSide('SELL')}
                      className={`py-1.5 rounded font-bold transition-colors ${
                        orderSide === 'SELL'
                          ? 'bg-rose-500 text-white shadow-sm'
                          : 'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}
                    >
                      SELL
                    </button>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Symbol</label>
                    <input
                      type="text"
                      value={orderSymbol}
                      onChange={(e) => setOrderSymbol(e.target.value.toUpperCase())}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white font-mono uppercase focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Shares</label>
                    <input
                      type="number"
                      min="1"
                      value={orderShares}
                      onChange={(e) => setOrderShares(parseInt(e.target.value) || 1)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white font-mono tabular-nums focus:outline-none"
                    />
                  </div>

                  <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800/80 flex flex-col gap-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Market Fill Price:</span>
                      <span className="text-white tabular-nums">${currentPriceForOrder.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-300 font-semibold">
                      <span>Estimated {orderSide === 'BUY' ? 'Total Cost' : 'Gross Proceeds'}:</span>
                      <span className="text-purple-300 tabular-nums">${estimatedOrderCost.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className={`w-full py-2.5 rounded-lg font-bold text-xs transition-colors shadow-sm ${
                      orderSide === 'BUY'
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                        : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                    }`}
                  >
                    Execute {orderSide} & Save to SQLite Vault
                  </button>
                </form>

                {orderMessage && (
                  <div
                    className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                      orderMessage.isError
                        ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                        : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{orderMessage.text}</span>
                  </div>
                )}
              </div>

              {/* Ticker Ingestion Simulator */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-white">Ingest Stock Ticker</h3>
                  <span className="text-[11px] text-purple-400 font-mono">ProcessTicker()</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Simulate incoming market ticks. Marks open positions to market in memory and recalculates unrealized returns.
                </p>

                <form onSubmit={handleManualIngest} className="flex flex-col gap-2.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Symbol</label>
                      <input
                        type="text"
                        value={customSymbol}
                        onChange={(e) => setCustomSymbol(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white font-mono uppercase focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">New Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white font-mono tabular-nums focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ingest Ticker ({customSymbol.toUpperCase()}, ${customPrice.toFixed(2)})</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LIVE .NET 8 CLI RUNNER */}
      {activeSubTab === 'terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-white tracking-tight flex items-center justify-between">
                <span>C# Execution Engine</span>
                <span className="text-[11px] font-mono text-purple-400">ApexTrade.Portfolio.csproj</span>
              </h2>

              <p className="text-xs text-slate-400 leading-relaxed">
                Execute compiled .NET 8 commands against <code className="text-purple-300 font-mono">apextrade.db</code> directly on the server container.
              </p>

              {/* Command Presets */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-medium">Select CLI Command Preset</label>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCliPreset('read-db')}
                    className={`p-2.5 rounded-lg text-xs text-left transition-colors border ${
                      cliPreset === 'read-db'
                        ? 'bg-purple-600/20 border-purple-500 text-white font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-mono text-purple-300">--read-db --json</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Read & hydrate portfolio state from SQLite apextrade.db</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCliPreset('load-benchmark')}
                    className={`p-2.5 rounded-lg text-xs text-left transition-colors border ${
                      cliPreset === 'load-benchmark'
                        ? 'bg-purple-600/20 border-purple-500 text-white font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-mono text-purple-300">--load-benchmark --json</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Execute 8 benchmark trades & write into SQLite tables</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCliPreset('db-status')}
                    className={`p-2.5 rounded-lg text-xs text-left transition-colors border ${
                      cliPreset === 'db-status'
                        ? 'bg-purple-600/20 border-purple-500 text-white font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-mono text-purple-300">--db-status</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Query apextrade.db schema row counts & file health</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCliPreset('reset-db')}
                    className={`p-2.5 rounded-lg text-xs text-left transition-colors border ${
                      cliPreset === 'reset-db'
                        ? 'bg-rose-600/20 border-rose-500 text-white font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-mono text-rose-300">--reset-db --json</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Reset SQLite tables to clean $100K cash baseline</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCliPreset('default')}
                    className={`p-2.5 rounded-lg text-xs text-left transition-colors border ${
                      cliPreset === 'default'
                        ? 'bg-purple-600/20 border-purple-500 text-white font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="font-mono text-purple-300">[Default Console Run]</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Full console run with simulated live tickers</div>
                  </button>
                </div>
              </div>

              {/* JSON Toggle */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                <span className="text-slate-400">Structured JSON Output:</span>
                <input
                  type="checkbox"
                  checked={jsonMode}
                  onChange={(e) => setJsonMode(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-purple-600 focus:ring-0"
                />
              </div>

              <button
                type="button"
                onClick={() => runDotnetCLI()}
                disabled={isDotnetRunning}
                className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-600/25 active:scale-98 disabled:opacity-50"
              >
                {isDotnetRunning ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    <span>Executing .NET 8 CLI...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run C# CLI Command</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Terminal Output */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[560px] shadow-2xl">
              <div className="bg-slate-900/90 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                  </div>
                  <span className="text-xs font-mono text-slate-400 ml-2">dotnet 8.0 — ApexTrade.Portfolio</span>
                </div>

                {dotnetOutput && (
                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{dotnetOutput.durationMs}ms</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-slate-500" />
                      <span>exit: {dotnetOutput.exitCode}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 flex-1 overflow-auto font-mono text-xs text-slate-200 leading-relaxed bg-[#030712]">
                {!dotnetOutput && !isDotnetRunning && (
                  <div className="text-slate-500 flex flex-col items-center justify-center h-full gap-2 text-center p-6">
                    <Terminal className="w-8 h-8 text-slate-600 mb-1" />
                    <p className="text-slate-400 font-medium">Ready to run C# Engine & SQLite Vault</p>
                    <p className="text-xs text-slate-600 max-w-sm">
                      Select a command preset on the left and click "Run C# CLI Command" to execute against <code className="text-slate-400">apextrade.db</code>.
                    </p>
                  </div>
                )}

                {isDotnetRunning && (
                  <div className="flex items-center gap-2 text-purple-400">
                    <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full" />
                    <span>Executing dotnet process...</span>
                  </div>
                )}

                {dotnetOutput && (
                  <div className="flex flex-col gap-2">
                    <div className="text-slate-500 select-none">$ {dotnetOutput.command}</div>
                    {dotnetOutput.stdout && (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-slate-200">
                        {dotnetOutput.stdout}
                      </pre>
                    )}
                    {dotnetOutput.stderr && (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-rose-400">
                        {dotnetOutput.stderr}
                      </pre>
                    )}
                    <div className="text-purple-400/80 text-[11px] pt-2 border-t border-slate-900">
                      [.NET Process completed in {dotnetOutput.durationMs}ms with exit status {dotnetOutput.exitCode}]
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: C# SOURCE CODE VIEWER */}
      {activeSubTab === 'source' && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setActiveSourceFile('VaultDb.cs')}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  activeSourceFile === 'VaultDb.cs'
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                VaultDb.cs (Phase 3)
              </button>
              <button
                onClick={() => setActiveSourceFile('Portfolio.cs')}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  activeSourceFile === 'Portfolio.cs'
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Portfolio.cs (Phase 2)
              </button>
              <button
                onClick={() => setActiveSourceFile('TradingTriggerEngine.cs')}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  activeSourceFile === 'TradingTriggerEngine.cs'
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                TradingTriggerEngine.cs (Phase 4)
              </button>
              <button
                onClick={() => setActiveSourceFile('Program.cs')}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  activeSourceFile === 'Program.cs'
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Program.cs (Harness)
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copyCode(currentSourceSnippet)}
                className="text-xs font-medium text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>

              <a
                href={`/api/download/${activeSourceFile}`}
                download={activeSourceFile}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1 ml-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download {activeSourceFile}</span>
              </a>
            </div>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed bg-[#030712] max-h-[600px] overflow-y-auto">
            {currentSourceSnippet}
          </pre>
        </div>
      )}

      {/* TAB 5: ARCHITECTURE & FORMULA SPECS */}
      {activeSubTab === 'architecture' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" />
              <span>Phase 3: The Vault SQLite Persistence Architecture</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Permanent high-speed disk storage using SQLite (<code className="text-purple-300 font-mono">apextrade.db</code>) with write-ahead logging (WAL) mode:
            </p>
            <ul className="text-xs text-slate-300 flex flex-col gap-2">
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">•</span>
                <span><strong>PortfolioState Schema:</strong> Id (PK=1), CashReserves, InitialBalance, InvestedValue, TotalEquity, RealizedPnL, UnrealizedPnL, PositionsJson, UpdatedAt.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">•</span>
                <span><strong>TradeHistory Schema:</strong> Id, TradeId, Timestamp, Symbol, Side, Shares, ExecutionPrice, TotalAmount, RealizedPnL, RemainingCashBalance, RunningOrderCount, RunningWinLossRatio, RunningAverageProfitPerTrade.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">•</span>
                <span><strong>Atomic Flush:</strong> Every trade execution immediately commits to SQLite within an atomic database transaction.</span>
              </li>
            </ul>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white">Weighted Average Cost Basis Math</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              When adding shares to an open position, the C# class calculates the exact weighted average cost basis per share:
            </p>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-purple-300">
              NewAvgCost = ((OldShares * OldAvgCost) + (NewShares * NewFillPrice)) / (OldShares + NewShares)
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Upon selling shares, cost basis remains unchanged, and realized P&L is calculated:
            </p>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-emerald-300">
              RealizedPnL = (SellFillPrice - AverageCostBasis) * SharesSold
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-3 md:col-span-2">
            <h3 className="text-sm font-semibold text-white">Execution Metrics & Running Trade Statistics Formulas</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Real-time formulas logged on each order fill and persisted in <code className="text-purple-300 font-mono">TradeHistory</code>:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex flex-col gap-1">
                <span className="font-semibold text-purple-300">Win / Loss Ratio</span>
                <code className="text-[11px] text-slate-300 font-mono">
                  WinLossRatio = Losses &gt; 0 ? (Wins / Losses) : Wins
                </code>
                <span className="text-[11px] text-slate-500 mt-1">Measures profitability ratio of winning trades over losing trades.</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex flex-col gap-1">
                <span className="font-semibold text-emerald-300">Average Profit Per Trade</span>
                <code className="text-[11px] text-slate-300 font-mono">
                  AvgProfit = Sells &gt; 0 ? (TotalRealizedPnL / Sells) : $0
                </code>
                <span className="text-[11px] text-slate-500 mt-1">Expected return per closed trade across all market executions.</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex flex-col gap-1">
                <span className="font-semibold text-sky-300">Total Executed Orders</span>
                <code className="text-[11px] text-slate-300 font-mono">
                  TotalOrders = BuyOrders + SellOrders
                </code>
                <span className="text-[11px] text-slate-500 mt-1">Monitors throughput and turnover across all filled equity transactions.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

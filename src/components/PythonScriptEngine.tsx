import React, { useState } from 'react';
import { Play, Download, Copy, Check, Terminal, FileCode, Clock, Cpu } from 'lucide-react';
import { PythonRunResponse } from '../types.ts';

export const PythonScriptEngine: React.FC = () => {
  const [symbolsText, setSymbolsText] = useState('AAPL, MSFT, NVDA, TSLA');
  const [format, setFormat] = useState<'table' | 'json' | 'csv'>('table');
  const [isHistory, setIsHistory] = useState(false);
  const [interval, setInterval] = useState('1d');
  const [range, setRange] = useState('1mo');
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<PythonRunResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'runner' | 'source' | 'usage'>('runner');

  const executePython = async () => {
    setIsRunning(true);
    const symbols = symbolsText
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    try {
      const resp = await fetch('/api/python/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols,
          format,
          history: isHistory,
          interval,
          range,
        }),
      });

      const data: PythonRunResponse = await resp.json();
      setRunResult(data);
    } catch (err: any) {
      setRunResult({
        success: false,
        exitCode: 1,
        durationMs: 0,
        command: `python3 scripts/fetch_stocks.py ${symbolsText}`,
        stdout: '',
        stderr: err.message || 'Network request failed',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const currentCliCommand = `python3 scripts/fetch_stocks.py ${symbolsText.replace(/,/g, ' ')}${
    format !== 'table' ? ` --format ${format}` : ''
  }${isHistory ? ` --history --interval ${interval} --range ${range}` : ''}`;

  const copyCommand = () => {
    navigator.clipboard.writeText(currentCliCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const samplePythonSource = `#!/usr/bin/env python3
"""
Stock Broker Application - Phase 1: Live Market Data Fetcher
Zero external dependencies (pure Python 3 standard library).
"""
import urllib.request, json, time, argparse
from datetime import datetime

class StockDataFetcher:
    def __init__(self, timeout=10):
        self.timeout = timeout
        self.headers = {'User-Agent': 'Mozilla/5.0'}

    def get_quote(self, symbol: str):
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1m&range=1d"
        req = urllib.request.Request(url, headers=self.headers)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            data = json.loads(r.read().decode())
            meta = data['chart']['result'][0]['meta']
            price = meta.get('regularMarketPrice')
            prev_close = meta.get('chartPreviousClose') or price
            change = price - prev_close
            return {
                'symbol': symbol,
                'price': price,
                'change': change,
                'change_percent': (change / prev_close) * 100,
                'volume': meta.get('regularMarketVolume'),
                'high': meta.get('regularMarketDayHigh'),
                'low': meta.get('regularMarketDayLow')
            }

if __name__ == '__main__':
    fetcher = StockDataFetcher()
    for s in ['AAPL', 'MSFT', 'NVDA']:
        print(fetcher.get_quote(s))
`;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Phase 1: Python Live Market Data Engine
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Python 3.10 Engine Ready
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Execute the standalone <code className="text-slate-300 font-mono">scripts/fetch_stocks.py</code> script
            interactively to pull real-time quotes, spreads, and OHLCV historical candles using free financial API endpoints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/download/fetch_stocks.py"
            download="fetch_stocks.py"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .py Script</span>
          </a>

          <button
            onClick={copyCommand}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied CLI' : 'Copy CLI Command'}</span>
          </button>
        </div>
      </div>

      {/* Engine Sub-tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setActiveSubTab('runner')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium ${
            activeSubTab === 'runner'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Play className="w-3.5 h-3.5 text-emerald-400" />
          <span>Interactive Script Runner</span>
        </button>

        <button
          onClick={() => setActiveSubTab('source')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium ${
            activeSubTab === 'source'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-3.5 h-3.5 text-sky-400" />
          <span>Python Source Code</span>
        </button>

        <button
          onClick={() => setActiveSubTab('usage')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium ${
            activeSubTab === 'usage'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5 text-amber-400" />
          <span>Library & Bot Integration</span>
        </button>
      </div>

      {/* Tab 1: Interactive Runner */}
      {activeSubTab === 'runner' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls Column */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-white tracking-tight flex items-center justify-between">
                <span>Script Parameters</span>
                <span className="text-[11px] font-mono text-slate-500">scripts/fetch_stocks.py</span>
              </h2>

              {/* Symbol Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400">Stock Tickers (comma separated)</label>
                <input
                  type="text"
                  value={symbolsText}
                  onChange={(e) => setSymbolsText(e.target.value)}
                  placeholder="AAPL, MSFT, NVDA, TSLA"
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 uppercase"
                />
                {/* Preset Chips */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {['AAPL, MSFT, NVDA', 'TSLA, AMZN, GOOGL', 'SPY, QQQ, DIA', 'COIN, PLTR, AMD'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSymbolsText(preset)}
                      className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors font-mono"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Format */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400">Output Format (--format)</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['table', 'json', 'csv'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormat(fmt)}
                      className={`py-1.5 px-3 rounded-lg text-xs font-mono uppercase font-medium transition-colors border ${
                        format === fmt
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40 font-bold'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode Toggle: Quotes vs History */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400">Query Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsHistory(false)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors border ${
                      !isHistory
                        ? 'bg-slate-800 text-white border-slate-700 font-semibold'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    Live Quotes
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHistory(true)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors border ${
                      isHistory
                        ? 'bg-slate-800 text-white border-slate-700 font-semibold'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    OHLCV History (--history)
                  </button>
                </div>
              </div>

              {/* History Parameters (if enabled) */}
              {isHistory && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Interval (--interval)</label>
                    <select
                      value={interval}
                      onChange={(e) => setInterval(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none"
                    >
                      <option value="1m">1m (Intraday)</option>
                      <option value="5m">5m (Intraday)</option>
                      <option value="15m">15m (Intraday)</option>
                      <option value="1h">1h (Hourly)</option>
                      <option value="1d">1d (Daily)</option>
                      <option value="1wk">1wk (Weekly)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Range (--range)</label>
                    <select
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none"
                    >
                      <option value="1d">1 Day</option>
                      <option value="5d">5 Days</option>
                      <option value="1mo">1 Month</option>
                      <option value="3mo">3 Months</option>
                      <option value="6mo">6 Months</option>
                      <option value="1y">1 Year</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Command preview */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-400">Terminal Command to Execute:</span>
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs font-mono text-emerald-400 break-all select-all">
                  $ {currentCliCommand}
                </div>
              </div>

              {/* Execute Action */}
              <button
                type="button"
                onClick={executePython}
                disabled={isRunning}
                className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 active:scale-98 disabled:opacity-50"
              >
                {isRunning ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full" />
                    <span>Executing Python 3 Script...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Execute Python Script Now</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Terminal Output Column */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[520px] shadow-2xl">
              {/* Terminal Window Header */}
              <div className="bg-slate-900/90 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                  </div>
                  <span className="text-xs font-mono text-slate-400 ml-2">bash — python3 runtime</span>
                </div>

                {runResult && (
                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{runResult.durationMs}ms</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-slate-500" />
                      <span>exit: {runResult.exitCode}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Terminal Screen Body */}
              <div className="p-4 flex-1 overflow-auto font-mono text-xs text-slate-200 leading-relaxed bg-[#030712]">
                {!runResult && !isRunning && (
                  <div className="text-slate-500 flex flex-col items-center justify-center h-full gap-2 text-center p-6">
                    <Terminal className="w-8 h-8 text-slate-600 mb-1" />
                    <p className="text-slate-400 font-medium">Ready to execute Python script</p>
                    <p className="text-xs text-slate-600 max-w-sm">
                      Click "Execute Python Script Now" to run <code className="text-slate-400">scripts/fetch_stocks.py</code>{' '}
                      and fetch live stock quotes.
                    </p>
                  </div>
                )}

                {isRunning && (
                  <div className="flex items-center gap-2 text-emerald-400">
                    <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full" />
                    <span>$ {currentCliCommand}</span>
                  </div>
                )}

                {runResult && (
                  <div className="flex flex-col gap-2">
                    <div className="text-slate-500 select-none">$ {runResult.command}</div>
                    {runResult.stdout && (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-slate-200">
                        {runResult.stdout}
                      </pre>
                    )}
                    {runResult.stderr && (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-rose-400">
                        {runResult.stderr}
                      </pre>
                    )}
                    <div className="text-emerald-500/80 text-[11px] pt-2 border-t border-slate-900">
                      [Process completed in {runResult.durationMs}ms with exit status {runResult.exitCode}]
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Python Source Code Viewer */}
      {activeSubTab === 'source' && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-300">scripts/fetch_stocks.py (Production Ready)</span>
            <a
              href="/api/download/fetch_stocks.py"
              download="fetch_stocks.py"
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </a>
          </div>
          <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed bg-[#030712]">
            {samplePythonSource}
          </pre>
        </div>
      )}

      {/* Tab 3: Usage in Bots & Applications */}
      {activeSubTab === 'usage' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white">Import in Custom Python Script</h3>
            <p className="text-xs text-slate-400">
              You can import <code className="text-slate-300 font-mono">StockDataFetcher</code> directly into any Python program:
            </p>
            <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto">
{`from scripts.fetch_stocks import StockDataFetcher

fetcher = StockDataFetcher()

# Get live single quote
quote = fetcher.get_quote('AAPL')
print(f"AAPL Price: \${quote['price']}")

# Batch quotes
portfolio = ['AAPL', 'MSFT', 'NVDA', 'TSLA']
quotes = fetcher.get_quotes(portfolio)
`}
            </pre>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-white">Pandas DataFrame & Backtesting</h3>
            <p className="text-xs text-slate-400">
              Fetch historical OHLCV candles directly into pandas for algorithmic trading and indicator analysis:
            </p>
            <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto">
{`import pandas as pd
from scripts.fetch_stocks import StockDataFetcher

fetcher = StockDataFetcher()
history = fetcher.get_history('NVDA', interval='1d', range_str='6mo')

# Convert candles into a Pandas DataFrame
df = pd.DataFrame(history['candles'])
df['datetime'] = pd.to_datetime(df['timestamp'], unit='s')
df.set_index('datetime', inplace=True)

# Calculate 20-day Moving Average
df['SMA_20'] = df['close'].rolling(window=20).mean()
print(df.tail())
`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { ExternalLink, Database, Globe, KeyRound } from 'lucide-react';

export const ApiDocs: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Financial API Integration Guide (Phase 1)
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Technical specifications for the free financial API powering this stock broker application and the Python script engine.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Endpoint 1 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">1. Real-Time Quotes & Intraday Endpoint</h2>
          </div>
          <p className="text-xs text-slate-400">
            Provides latest regular market price, day high/low, previous close, volume, and timestamp without requiring an API key.
          </p>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-emerald-400 break-all select-all">
            GET https://query1.finance.yahoo.com/v8/finance/chart/{'{SYMBOL}'}?interval=1m&range=1d
          </div>
          <div className="text-[11px] text-slate-400">
            <strong>Key Headers:</strong> User-Agent (browser-like), Accept: application/json.
          </div>
        </div>

        {/* Endpoint 2 */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-white">2. Historical OHLCV Candles Endpoint</h2>
          </div>
          <p className="text-xs text-slate-400">
            Returns open, high, low, close, and volume series for charting and backtesting across customizable timeframes.
          </p>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] text-sky-400 break-all select-all">
            GET https://query1.finance.yahoo.com/v8/finance/chart/{'{SYMBOL}'}?interval=1d&range=1mo
          </div>
          <div className="text-[11px] text-slate-400">
            <strong>Supported intervals:</strong> 1m, 2m, 5m, 15m, 30m, 60m, 1h, 1d, 5d, 1wk, 1mo.
          </div>
        </div>
      </div>

      {/* Field Mapping Reference Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Payload Data Dictionary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40 text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-4 font-medium">Field</th>
                <th className="py-2.5 px-4 font-medium">Path</th>
                <th className="py-2.5 px-4 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[12px]">
              <tr>
                <td className="py-2 px-4 text-white font-bold">regularMarketPrice</td>
                <td className="py-2 px-4 text-slate-400">chart.result[0].meta.regularMarketPrice</td>
                <td className="py-2 px-4 text-slate-300 font-sans text-xs">Latest recorded execution price</td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-white font-bold">chartPreviousClose</td>
                <td className="py-2 px-4 text-slate-400">chart.result[0].meta.chartPreviousClose</td>
                <td className="py-2 px-4 text-slate-300 font-sans text-xs">Prior trading session's official close</td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-white font-bold">indicators.quote</td>
                <td className="py-2 px-4 text-slate-400">chart.result[0].indicators.quote[0]</td>
                <td className="py-2 px-4 text-slate-300 font-sans text-xs">Arrays containing open, high, low, close, volume</td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-white font-bold">timestamp</td>
                <td className="py-2 px-4 text-slate-400">chart.result[0].timestamp</td>
                <td className="py-2 px-4 text-slate-300 font-sans text-xs">UNIX epoch timestamps (seconds) for each candle bar</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Alternative Free Financial APIs */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Alternative Free Financial APIs Supported</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="font-semibold text-slate-200">Finnhub.io</div>
            <p className="text-slate-400 text-[11px] mt-1">
              Free 60 calls/min tier with real-time US quotes and WebSockets.
            </p>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="font-semibold text-slate-200">Stooq API</div>
            <p className="text-slate-400 text-[11px] mt-1">
              Clean CSV daily quotes without registration or API keys.
            </p>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="font-semibold text-slate-200">Alpha Vantage</div>
            <p className="text-slate-400 text-[11px] mt-1">
              Free 25 calls/day tier with technical indicators and crypto/forex.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { StockQuote } from '../types.ts';
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

interface WatchlistTableProps {
  quotes: StockQuote[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onAddSymbol: (symbol: string) => void;
  onRemoveSymbol: (symbol: string) => void;
  onRefreshAll: () => void;
  isRefreshing: boolean;
}

export const WatchlistTable: React.FC<WatchlistTableProps> = ({
  quotes,
  selectedSymbol,
  onSelectSymbol,
  onAddSymbol,
  onRemoveSymbol,
  onRefreshAll,
  isRefreshing,
}) => {
  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbolInput.trim()) return;
    onAddSymbol(newSymbolInput.trim().toUpperCase());
    setNewSymbolInput('');
  };

  const filteredQuotes = quotes.filter((q) =>
    q.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatLargeVol = (vol?: number) => {
    if (!vol) return '—';
    if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
    if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
    if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
    return vol.toLocaleString();
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white tracking-tight">Market Watchlist</h2>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{quotes.length} Assets</span>
            <span aria-hidden="true">·</span>
            <span>Real-time Free API</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Add Symbol Form */}
          <form onSubmit={handleAdd} className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Add ticker (e.g. AMD)"
              value={newSymbolInput}
              onChange={(e) => setNewSymbolInput(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 uppercase focus:outline-none focus:border-emerald-500 w-36 font-mono"
            />
            <button
              type="submit"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
              title="Add Ticker"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Refresh button */}
          <button
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh Quotes"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter / Quick search bar */}
      <div className="px-4 py-2 border-b border-slate-800/60 bg-slate-950/40 flex items-center justify-between text-xs">
        <input
          type="text"
          placeholder="Filter watchlist..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent text-slate-300 placeholder-slate-600 focus:outline-none w-48 text-xs"
        />
        <div className="flex items-center gap-1 text-[11px] text-slate-400">
          <span>Sort: By Order Added</span>
        </div>
      </div>

      {/* High-Density Data Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/40 text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-4 font-medium">Asset</th>
              <th className="py-2.5 px-3 font-medium text-right">Price</th>
              <th className="py-2.5 px-3 font-medium text-right">Change</th>
              <th className="py-2.5 px-3 font-medium text-right">% Chg</th>
              <th className="py-2.5 px-3 font-medium text-right hidden lg:table-cell">Day Range</th>
              <th className="py-2.5 px-3 font-medium text-right hidden sm:table-cell">Volume</th>
              <th className="py-2.5 px-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredQuotes.map((q) => {
              const isSelected = q.symbol === selectedSymbol;
              const isPositive = (q.change ?? 0) >= 0;

              return (
                <tr
                  key={q.symbol}
                  onClick={() => onSelectSymbol(q.symbol)}
                  className={`cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  {/* Asset Symbol & Exchange */}
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white font-mono text-sm">{q.symbol}</span>
                      <span className="text-[11px] text-slate-400 hidden md:inline">
                        {q.exchange || 'NASDAQ'}
                      </span>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-white font-medium">
                    {q.price !== undefined ? `$${q.price.toFixed(2)}` : '—'}
                  </td>

                  {/* Change $ */}
                  <td
                    className={`py-2.5 px-3 text-right font-mono tabular-nums font-medium ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {isPositive ? (
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 shrink-0" />
                      )}
                      <span>
                        {isPositive ? '+' : ''}
                        {q.change !== undefined ? `$${q.change.toFixed(2)}` : '0.00'}
                      </span>
                    </div>
                  </td>

                  {/* Change % */}
                  <td
                    className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {q.change_percent !== undefined ? `${q.change_percent.toFixed(2)}%` : '0.00%'}
                  </td>

                  {/* Day Range */}
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400 hidden lg:table-cell text-[11px]">
                    {q.day_low && q.day_high
                      ? `$${q.day_low.toFixed(2)} - $${q.day_high.toFixed(2)}`
                      : '—'}
                  </td>

                  {/* Volume */}
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300 hidden sm:table-cell">
                    {formatLargeVol(q.volume)}
                  </td>

                  {/* Delete Action */}
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSymbol(q.symbol);
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                      title="Remove from watchlist"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

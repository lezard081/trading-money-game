import React, { useState } from 'react';
import { StockQuote } from '../types.ts';
import { ShieldCheck, Info } from 'lucide-react';

interface StockDetailCardProps {
  quote: StockQuote | undefined;
  cashBalance?: number;
  onTradeSimulate?: (symbol: string, side: 'BUY' | 'SELL', shares: number, price: number) => { success: boolean; message: string } | void;
}

export const StockDetailCard: React.FC<StockDetailCardProps> = ({ quote, cashBalance = 100000, onTradeSimulate }) => {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [shares, setShares] = useState<number>(10);
  const [limitPrice, setLimitPrice] = useState<number>(quote?.price || 150);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);

  if (!quote) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 text-slate-400 text-sm">
        Select a stock to view details and order execution simulator.
      </div>
    );
  }

  const effectivePrice = orderType === 'MARKET' ? (quote.price || 0) : limitPrice;
  const estimatedTotal = effectivePrice * shares;

  const handleExecuteTrade = (e: React.FormEvent) => {
    e.preventDefault();
    setTradeMessage(
      `Simulated ${side} order placed: ${shares} shares of ${quote.symbol} at $${effectivePrice.toFixed(
        2
      )} (Total: $${estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    );
    if (onTradeSimulate) {
      onTradeSimulate(quote.symbol, side, shares, effectivePrice);
    }
    setTimeout(() => setTradeMessage(null), 5000);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Key Market Metrics Matrix */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
              Market Metrics
            </span>
            <div className="text-lg font-bold text-white font-mono">{quote.symbol}</div>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400">Exchange</span>
            <div className="text-xs font-semibold text-slate-200">{quote.exchange || 'NASDAQ'}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-3 gap-x-4 pt-3 text-xs">
          <div>
            <div className="text-slate-400 text-[11px]">Previous Close</div>
            <div className="text-slate-200 font-mono tabular-nums font-medium">
              ${quote.previous_close?.toFixed(2) ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">Day's Range</div>
            <div className="text-slate-200 font-mono tabular-nums font-medium">
              ${quote.day_low?.toFixed(2) ?? '—'} - ${quote.day_high?.toFixed(2) ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">52-Week Range</div>
            <div className="text-slate-200 font-mono tabular-nums font-medium">
              ${quote.fifty_two_week_low?.toFixed(2) ?? '—'} - ${quote.fifty_two_week_high?.toFixed(2) ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">Trading Volume</div>
            <div className="text-slate-200 font-mono tabular-nums font-medium">
              {quote.volume ? quote.volume.toLocaleString() : '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">Asset Type</div>
            <div className="text-slate-200 font-medium">{quote.instrument_type || 'Equity'}</div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">Session Status</div>
            <div className="text-slate-200 font-medium flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Real-Time Feed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Phase 1 Preview: Broker Order Ticket */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white tracking-tight">Order Execution</h3>
            <span className="text-[11px] text-emerald-400 font-medium">Phase 1 Preview</span>
          </div>
          <span className="text-xs text-slate-400 font-mono">Paper Trading</span>
        </div>

        {/* Side Selector */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setSide('BUY')}
            className={`py-1.5 rounded-md transition-colors ${
              side === 'BUY'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            BUY {quote.symbol}
          </button>
          <button
            type="button"
            onClick={() => setSide('SELL')}
            className={`py-1.5 rounded-md transition-colors ${
              side === 'SELL'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            SELL {quote.symbol}
          </button>
        </div>

        <form onSubmit={handleExecuteTrade} className="flex flex-col gap-3 text-xs">
          {/* Order Type */}
          <div className="flex items-center justify-between">
            <label className="text-slate-400">Order Type</label>
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setOrderType('MARKET')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                  orderType === 'MARKET' ? 'bg-slate-800 text-white' : 'text-slate-400'
                }`}
              >
                Market
              </button>
              <button
                type="button"
                onClick={() => setOrderType('LIMIT')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                  orderType === 'LIMIT' ? 'bg-slate-800 text-white' : 'text-slate-400'
                }`}
              >
                Limit
              </button>
            </div>
          </div>

          {/* Limit Price Input if limit order */}
          {orderType === 'LIMIT' && (
            <div className="flex items-center justify-between">
              <label className="text-slate-400">Limit Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                className="w-28 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right text-white font-mono tabular-nums focus:outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {/* Quantity */}
          <div className="flex items-center justify-between">
            <label className="text-slate-400">Shares</label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShares(Math.max(1, shares - 5))}
                className="w-6 h-6 rounded bg-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-700"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                value={shares}
                onChange={(e) => setShares(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-center text-white font-mono tabular-nums focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShares(shares + 5)}
                className="w-6 h-6 rounded bg-slate-800 text-slate-300 flex items-center justify-center font-bold hover:bg-slate-700"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick preset buttons */}
          <div className="flex items-center justify-end gap-1.5 text-[11px]">
            {[1, 5, 10, 50, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setShares(preset)}
                className={`px-2 py-0.5 rounded border border-slate-800 ${
                  shares === preset ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-800 pt-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <span>Estimated Value</span>
              <span className="text-white font-mono tabular-nums font-semibold text-sm">
                ${estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Available Cash Balance</span>
              <span className="font-mono tabular-nums text-emerald-400">${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <button
            type="submit"
            className={`w-full py-2.5 rounded-lg font-bold text-xs transition-colors shadow-sm mt-1 ${
              side === 'BUY'
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
            }`}
          >
            Submit {side} Order ({shares} Shares)
          </button>
        </form>

        {tradeMessage && (
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{tradeMessage}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Synchronized with C# Core Portfolio Data Structure (Phase 2).</span>
        </div>
      </div>
    </div>
  );
};

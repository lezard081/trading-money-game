import React, { useState, useEffect, useCallback } from 'react';
import { Newspaper, TrendingUp, TrendingDown, ExternalLink, RefreshCw, Sparkles, AlertCircle, ShieldCheck } from 'lucide-react';

interface NewsItem {
  title: string;
  source: string;
  time: string;
  url?: string;
  summary: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

interface NewsData {
  symbol: string;
  timestamp?: string;
  valueAnalysis?: string;
  newsItems: NewsItem[];
}

interface LiveNewsSectionProps {
  selectedSymbol: string;
  onSelectSymbol: (sym: string) => void;
}

export const LiveNewsSection: React.FC<LiveNewsSectionProps> = ({ selectedSymbol, onSelectSymbol }) => {
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [groundingSources, setGroundingSources] = useState<{ title?: string; uri?: string }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = useCallback(async (sym: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stocks/news/${encodeURIComponent(sym)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setNewsData(json.data);
          setGroundingSources(json.groundingSources || []);
        } else {
          setError('Failed to load financial news');
        }
      } else {
        setError(`HTTP error ${res.status}`);
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(selectedSymbol);
  }, [selectedSymbol, fetchNews]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-4 shadow-xl">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Newspaper className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">
                Live Financial News & Catalyst Ticker ({selectedSymbol})
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Search Grounded
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Real-time headlines, earnings catalysts, and AI value analysis for {selectedSymbol}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            {['INTC', 'AMD', 'F', 'AAPL', 'MSFT'].map((sym) => (
              <button
                key={sym}
                onClick={() => onSelectSymbol(sym)}
                className={`px-2.5 py-1 rounded-md font-mono text-xs transition-colors ${
                  selectedSymbol === sym
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchNews(selectedSymbol)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* AI Value Catalyst Analysis Box */}
      {newsData?.valueAnalysis && (
        <div className="bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/20 rounded-lg p-3.5 flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
              AI Catalyst & Value Outlook ({selectedSymbol})
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              {newsData.valueAnalysis}
            </p>
          </div>
        </div>
      )}

      {/* News Items List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isLoading && !newsData ? (
          <div className="col-span-2 py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-xs">Fetching search-grounded news updates for {selectedSymbol}...</span>
          </div>
        ) : newsData?.newsItems && newsData.newsItems.length > 0 ? (
          newsData.newsItems.map((item, idx) => {
            const isBullish = item.sentiment === 'bullish';
            const isBearish = item.sentiment === 'bearish';
            return (
              <div
                key={idx}
                className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between gap-3 hover:border-slate-700 transition-all"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {item.source}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-mono">{item.time}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded flex items-center gap-1 ${
                          isBullish
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isBearish
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {isBullish ? <TrendingUp className="w-3 h-3" /> : isBearish ? <TrendingDown className="w-3 h-3" /> : null}
                        {item.sentiment.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-xs font-bold text-white hover:text-emerald-400 transition-colors leading-snug">
                    {item.title}
                  </h3>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {item.summary}
                  </p>
                </div>

                {item.url && (
                  <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px]">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition-colors"
                    >
                      <span>Read Full Article</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="col-span-2 py-8 text-center text-slate-500 text-xs">
            No recent financial news items found for {selectedSymbol}. Click Refresh to query live web sources.
          </div>
        )}
      </div>

      {/* Grounding Sources footer */}
      {groundingSources.length > 0 && (
        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">Verified Sources:</span>
          {groundingSources.map((src, i) => (
            src?.uri ? (
              <a
                key={i}
                href={src.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-emerald-400 hover:underline truncate max-w-[200px]"
                title={src.title || src.uri}
              >
                {src.title || new URL(src.uri).hostname}
              </a>
            ) : null
          ))}
        </div>
      )}
    </div>
  );
};

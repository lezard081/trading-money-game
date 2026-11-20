import React from 'react';
import { Terminal, TrendingUp, BookOpen, Layers, Briefcase, Play, Database } from 'lucide-react';
import { VaultDbStatus } from '../types.ts';

interface TopNavProps {
  activeTab: 'terminal' | 'visualizer' | 'triggers' | 'portfolio' | 'python' | 'docs' | 'roadmap';
  setActiveTab: (tab: 'terminal' | 'visualizer' | 'triggers' | 'portfolio' | 'python' | 'docs' | 'roadmap') => void;
  onQuickRunCSharp: () => void;
  vaultStatus?: VaultDbStatus | null;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  onQuickRunCSharp,
  vaultStatus,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-base">
          ▲
        </div>
        <button
          onClick={() => setActiveTab('terminal')}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-emerald-400 transition-colors text-left"
        >
          ApexTrade
        </button>
      </div>

      {/* Zone 2: Concise navigation links */}
      <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-400">
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'terminal'
              ? 'text-white border-emerald-500 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span>Market Terminal</span>
        </button>

        <button
          onClick={() => setActiveTab('triggers')}
          className={`flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'triggers'
              ? 'text-white border-amber-500 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <span>Auto Triggers (Tradier)</span>
        </button>

        <button
          onClick={() => setActiveTab('visualizer')}
          className={`flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'visualizer'
              ? 'text-white border-purple-500 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <Briefcase className="w-4 h-4 text-purple-400" />
          <span>Trade Visualizer</span>
        </button>

        <button
          onClick={() => setActiveTab('portfolio')}
          className={`flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'portfolio'
              ? 'text-white border-purple-500 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4 text-sky-400" />
          <span>C# Core Engine</span>
        </button>

        <button
          onClick={() => setActiveTab('python')}
          className={`flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'python'
              ? 'text-white border-amber-500 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4 text-amber-400" />
          <span>Python Engine</span>
        </button>

        <button
          onClick={() => setActiveTab('roadmap')}
          className={`flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
            activeTab === 'roadmap'
              ? 'text-white border-indigo-500 font-semibold'
              : 'border-transparent hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Broker Roadmap</span>
        </button>
      </nav>

      {/* Zone 3: SQLite Vault Badge & Primary Action */}
      <div className="flex items-center gap-3 shrink-0">
        <div
          onClick={() => setActiveTab('visualizer')}
          className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono cursor-pointer hover:border-slate-700 transition-colors"
          title="SQLite Database 'apextrade.db' Active — Click to inspect"
        >
          <Database className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">Vault:</span>
          <span className="text-emerald-400 font-semibold">apextrade.db</span>
          {vaultStatus && (
            <span className="text-slate-500 text-[10px]">({vaultStatus.tradeHistoryRows} trades)</span>
          )}
        </div>

        <button
          onClick={onQuickRunCSharp}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-500 transition-colors whitespace-nowrap shrink-0 shadow-sm shadow-purple-600/30 active:scale-95"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>Run C# Engine</span>
        </button>
      </div>
    </header>
  );
};

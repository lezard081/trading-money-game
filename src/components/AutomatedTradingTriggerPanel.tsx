import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  Terminal,
  Zap,
  TrendingDown,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Trash2,
  Layers,
  Coins,
  DollarSign,
  Lock,
  Sliders,
  ChevronRight,
  FileCode,
  ShieldAlert,
  Search,
  Check,
  XCircle,
  FileText,
  Bell,
  Send,
  Cloud,
  Copy,
  CheckCheck,
  Globe,
  Radio,
  Cpu,
  Bot,
  Sparkles,
  MessageSquare,
  Workflow,
  Server,
} from 'lucide-react';
import {
  TradingSignal,
  SignalCounts,
  PollerLogsResponse,
  PortfolioState,
  ExecutionLogRecord,
  NotificationRecord,
  CloudDeploymentInfo,
} from '../types.ts';

interface AutomatedTradingTriggerPanelProps {
  portfolio?: PortfolioState;
  onRefreshPortfolio?: () => void;
  onResetPortfolio?: (seedCash?: number) => void;
}

interface McpQueryResult {
  tool: string;
  data: any;
  naturalResponse: string;
  timestamp: string;
}

export const AutomatedTradingTriggerPanel: React.FC<AutomatedTradingTriggerPanelProps> = ({
  portfolio,
  onRefreshPortfolio,
  onResetPortfolio,
}) => {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [counts, setCounts] = useState<SignalCounts>({ total: 0, pending: 0, executed: 0, filled: 0, rejected: 0, failed: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLogRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [cloudDeploymentInfo, setCloudDeploymentInfo] = useState<CloudDeploymentInfo | null>(null);
  const [activeTableTab, setActiveTableTab] = useState<'signals' | 'audit_logs' | 'webhooks' | 'cloud_deploy'>('signals');

  const [isPollerRunning, setIsPollerRunning] = useState<boolean>(true);
  const [isLoadingSignals, setIsLoadingSignals] = useState<boolean>(false);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState<boolean>(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState<boolean>(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);
  const [isSimulatingDip, setIsSimulatingDip] = useState<boolean>(false);
  const [isResettingBankroll, setIsResettingBankroll] = useState<boolean>(false);
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);
  const [selectedResponse, setSelectedResponse] = useState<{ id: number; symbol: string; title: string; response: string } | null>(null);

  // MCP Interactive Console State
  const [mcpQueryInput, setMcpQueryInput] = useState<string>(
    'Check my Tradier sandbox cash balance and buying power for account 6YC17358'
  );
  const [isSubmittingMcpQuery, setIsSubmittingMcpQuery] = useState<boolean>(false);
  const [mcpLastResult, setMcpLastResult] = useState<McpQueryResult | null>(null);
  const [isRoutingPendingViaMcp, setIsRoutingPendingViaMcp] = useState<boolean>(false);

  // Tablet 1-Click GitHub Push State
  const [githubRepoUrl, setGithubRepoUrl] = useState<string>('');
  const [githubToken, setGithubToken] = useState<string>('');
  const [isPushingToGithub, setIsPushingToGithub] = useState<boolean>(false);
  const [githubPushFeedback, setGithubPushFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Capital Controller & Guardrail feedback message
  const [triggerFeedback, setTriggerFeedback] = useState<{
    text: string;
    type: 'success' | 'warning' | 'info';
    timestamp: string;
  } | null>(null);

  // Custom dip and spread input
  const [customSymbol, setCustomSymbol] = useState<'INTC' | 'AMD' | 'F' | string>('INTC');
  const [customDip, setCustomDip] = useState<number>(-2.5);
  const [customSpread, setCustomSpread] = useState<number>(0.15); // Default 0.15% spread (tight)

  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  // Current cash balance
  const cashBalance = portfolio?.cashBalance ?? 250.00;
  const liquidSafetyBuffer = 50.00;
  const spendableCash = Math.max(0, cashBalance - liquidSafetyBuffer);
  const maxEntryRate = 0.20; // 20% max allocation

  // Target prices
  const targetStockData = [
    {
      symbol: 'INTC',
      name: 'Intel Corporation',
      prevClose: 24.50,
      dipThreshold: 24.01,
      testDipPercent: -2.4,
      testPrice: 23.91,
      minSpendableRequired: 24.50 + liquidSafetyBuffer,
      calculateShares: () => {
        if (spendableCash < 23.91) return 0;
        return 1;
      },
    },
    {
      symbol: 'AMD',
      name: 'Advanced Micro Devices',
      prevClose: 142.80,
      dipThreshold: 139.94,
      testDipPercent: -2.1,
      testPrice: 139.80,
      minSpendableRequired: 139.80 + liquidSafetyBuffer,
      calculateShares: () => {
        if (spendableCash < 139.80) return 0;
        return 1;
      },
    },
    {
      symbol: 'F',
      name: 'Ford Motor Company',
      prevClose: 11.20,
      dipThreshold: 10.97,
      testDipPercent: -2.8,
      testPrice: 10.89,
      minSpendableRequired: 10.89 + liquidSafetyBuffer,
      calculateShares: () => {
        if (spendableCash < 10.89) return 0;
        const affordableBySpendable = Math.floor(spendableCash / 10.89);
        const affordableByAllocation = Math.floor((cashBalance * maxEntryRate) / 10.89);
        const shares = Math.max(1, Math.min(affordableBySpendable, affordableByAllocation));
        return Math.min(3, Math.max(1, shares));
      },
    },
  ];

  // Fetch signals
  const fetchSignals = async () => {
    try {
      setIsLoadingSignals(true);
      const res = await fetch('/api/signals');
      const data = await res.json();
      if (data.success) {
        setSignals(data.signals || []);
        setCounts(data.counts || { total: 0, pending: 0, executed: 0, filled: 0, rejected: 0, failed: 0 });
      }
    } catch (err) {
      console.error('Failed to fetch signals:', err);
    } finally {
      setIsLoadingSignals(false);
    }
  };

  // Fetch execution logs from execution_logs SQLite table
  const fetchExecutionLogs = async () => {
    try {
      setIsLoadingAuditLogs(true);
      const res = await fetch('/api/signals/execution-logs?limit=50');
      const data = await res.json();
      if (data.success) {
        setExecutionLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch execution logs:', err);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  // Fetch logs
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/signals/logs');
      const data: PollerLogsResponse = await res.json();
      setLogs(data.logs || []);
      setIsPollerRunning(data.isRunning);
    } catch (err) {
      console.error('Failed to fetch poller logs:', err);
    }
  };

  // Fetch push notification audit logs from notifications SQLite table
  const fetchNotifications = async () => {
    try {
      setIsLoadingNotifications(true);
      const res = await fetch('/api/notifications?limit=50');
      const data = await res.json();
      if (data.success && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  // Fetch Cloud Deployment & GitHub Actions metadata
  const fetchDeploymentInfo = async () => {
    try {
      const res = await fetch('/api/cloud/deployment-info');
      const data = await res.json();
      if (data.success) {
        setCloudDeploymentInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch cloud deployment info:', err);
    }
  };

  // Dispatch real/mock test push alert to Discord & Telegram
  const handleTestWebhook = async () => {
    setIsTestingWebhook(true);
    try {
      const res = await fetch('/api/notifications/test', { method: 'POST' });
      const data = await res.json();
      await fetchNotifications();
      await fetchLogs();
      setTriggerFeedback({
        text: data.success
          ? '🔔 Webhook push alert dispatched! Verified Discord & Telegram bridge.'
          : '⚠️ Webhook test finished with warnings.',
        type: data.success ? 'success' : 'warning',
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      console.error('Failed to dispatch test webhook:', err);
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const copyToClipboard = (text: string, secretName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(secretName);
    setTimeout(() => setCopiedSecret(null), 2500);
  };

  // Direct Tablet Push to GitHub (No CLI required!)
  const handlePushToGithub = async () => {
    if (!githubRepoUrl.trim()) {
      setGithubPushFeedback({ text: 'Please enter your GitHub repository URL (e.g. https://github.com/username/apextrade)', type: 'error' });
      return;
    }
    setIsPushingToGithub(true);
    setGithubPushFeedback(null);
    try {
      const res = await fetch('/api/github/push-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: githubRepoUrl, personalAccessToken: githubToken })
      });
      const data = await res.json();
      if (data.success) {
        setGithubPushFeedback({ text: '🎉 Successfully pushed ApexTrade to your GitHub repository on branch main!', type: 'success' });
      } else {
        setGithubPushFeedback({ text: `Push failed: ${data.error || 'Check repository URL or token permissions.'}`, type: 'error' });
      }
      await fetchLogs();
    } catch (err: any) {
      setGithubPushFeedback({ text: `Network error: ${err.message}`, type: 'error' });
    } finally {
      setIsPushingToGithub(false);
    }
  };

  // Natural Language MCP Tool Query Execution
  const handleExecuteMcpQuery = async (queryText?: string) => {
    const textToRun = queryText || mcpQueryInput;
    if (!textToRun.trim()) return;

    setIsSubmittingMcpQuery(true);
    try {
      const res = await fetch('/api/mcp/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: textToRun }),
      });
      const data = await res.json();
      if (data.success) {
        setMcpLastResult({
          tool: data.tool,
          data: data.data,
          naturalResponse: data.naturalResponse,
          timestamp: new Date().toLocaleTimeString(),
        });
        setTriggerFeedback({
          text: `Tradier MCP Server executed [${data.tool}] successfully for Account 6YC17358.`,
          type: 'success',
          timestamp: new Date().toLocaleTimeString(),
        });
      } else {
        setTriggerFeedback({
          text: `MCP Error: ${data.error || 'Failed to execute query'}`,
          type: 'warning',
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      await fetchSignals();
      await fetchLogs();
      await fetchExecutionLogs();
      if (onRefreshPortfolio) onRefreshPortfolio();
    } catch (err: any) {
      console.error('Failed to execute MCP query:', err);
      setTriggerFeedback({
        text: `Network failure connecting to Tradier MCP Server: ${err.message}`,
        type: 'warning',
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsSubmittingMcpQuery(false);
    }
  };

  // Direct MCP Tool Quick Execution
  const handleExecuteMcpDirectTool = async (toolName: string, args: Record<string, any> = {}) => {
    setIsSubmittingMcpQuery(true);
    try {
      const res = await fetch('/api/mcp/execute-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, arguments: args }),
      });
      const data = await res.json();
      if (data.success) {
        setMcpLastResult({
          tool: data.tool,
          data: data.data,
          naturalResponse: `Direct tool '${toolName}' executed with ${JSON.stringify(args)}`,
          timestamp: new Date().toLocaleTimeString(),
        });
        setTriggerFeedback({
          text: `Tradier MCP: Direct call to '${toolName}' succeeded.`,
          type: 'success',
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      await fetchSignals();
      await fetchLogs();
      await fetchExecutionLogs();
      if (onRefreshPortfolio) onRefreshPortfolio();
    } catch (err: any) {
      console.error('Direct MCP execution failed:', err);
    } finally {
      setIsSubmittingMcpQuery(false);
    }
  };

  // Route Pending Signal via Gemini MCP Tool Call
  const handleRoutePendingViaMcp = async (signalId?: number) => {
    setIsRoutingPendingViaMcp(true);
    try {
      const res = await fetch('/api/signals/route-gemini-mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signalId }),
      });
      const data = await res.json();
      if (data.success && data.signal) {
        setTriggerFeedback({
          text: `Routed Signal #${data.signal.id} (${data.signal.side} ${data.signal.quantity} ${data.signal.symbol}) via Gemini Tradier MCP tool [place_equity_order]! Reconciled: FILLED.`,
          type: 'success',
          timestamp: new Date().toLocaleTimeString(),
        });
      } else {
        setTriggerFeedback({
          text: data.message || data.error || 'No pending signals in queue.',
          type: 'info',
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      await fetchSignals();
      await fetchLogs();
      await fetchExecutionLogs();
      if (onRefreshPortfolio) onRefreshPortfolio();
    } catch (err) {
      console.error('Failed to route pending via MCP:', err);
    } finally {
      setIsRoutingPendingViaMcp(false);
    }
  };

  // Polling intervals for UI
  useEffect(() => {
    fetchSignals();
    fetchLogs();
    fetchExecutionLogs();
    fetchNotifications();
    fetchDeploymentInfo();

    const signalInterval = setInterval(() => {
      fetchSignals();
      fetchExecutionLogs();
      fetchNotifications();
    }, 2500);
    const logInterval = setInterval(fetchLogs, 1500);

    return () => {
      clearInterval(signalInterval);
      clearInterval(logInterval);
    };
  }, []);

  // Auto scroll logs container
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Seed bankroll switcher
  const handleSelectSeedCash = async (seed: number) => {
    try {
      setIsResettingBankroll(true);
      if (onResetPortfolio) {
        await onResetPortfolio(seed);
      } else {
        await fetch('/api/portfolio/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seedCash: seed }),
        });
        if (onRefreshPortfolio) onRefreshPortfolio();
      }
      setTriggerFeedback({
        text: `Bankroll re-initialized to $${seed.toLocaleString()} USD. Dynamic lot sizing recalculated for small account capital constraints.`,
        type: 'info',
        timestamp: new Date().toLocaleTimeString(),
      });
      await fetchSignals();
      await fetchLogs();
      await fetchExecutionLogs();
    } catch (err) {
      console.error('Failed to switch seed cash:', err);
    } finally {
      setIsResettingBankroll(false);
    }
  };

  // Simulate Dip on Target Stock
  const handleSimulateDip = async (symbol: string, dipPercent: number, spreadPercent?: number) => {
    try {
      setIsSimulatingDip(true);
      const res = await fetch('/api/signals/simulate-dip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, dipPercent, spreadPercent }),
      });
      const data = await res.json();

      if (data.data?.Reason || data.stdout) {
        const msg = data.data?.Reason || data.stdout;
        const isBlocked =
          !data.data?.Triggered ||
          msg.includes('Blocked') ||
          msg.includes('Abort') ||
          msg.includes('breaches') ||
          msg.includes('exceeds') ||
          msg.includes('insufficient');

        setTriggerFeedback({
          text: msg,
          type: isBlocked ? 'warning' : 'success',
          timestamp: new Date().toLocaleTimeString(),
        });
      }

      await fetchSignals();
      await fetchLogs();
      await fetchExecutionLogs();
      if (onRefreshPortfolio) onRefreshPortfolio();
    } catch (err) {
      console.error('Failed to simulate dip:', err);
    } finally {
      setIsSimulatingDip(false);
    }
  };

  // Test Slippage & Spread Guardrail in C#
  const handleTestSpreadGuardrail = async (symbol: string, dipPercent: number, spreadPercent: number) => {
    try {
      setIsSimulatingDip(true);
      const res = await fetch('/api/signals/simulate-spread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, dipPercent, spreadPercent }),
      });
      const data = await res.json();

      if (data.data?.Reason || data.stdout) {
        const msg = data.data?.Reason || data.stdout;
        const isPassed = data.data?.SpreadGuardrailPassed && data.data?.Triggered;
        setTriggerFeedback({
          text: msg,
          type: isPassed ? 'success' : 'warning',
          timestamp: new Date().toLocaleTimeString(),
        });
      }

      await fetchSignals();
      await fetchLogs();
      await fetchExecutionLogs();
      if (onRefreshPortfolio) onRefreshPortfolio();
    } catch (err) {
      console.error('Failed to test spread guardrail:', err);
    } finally {
      setIsSimulatingDip(false);
    }
  };

  // Scan all targets (INTC, AMD, F)
  const handleScanTargets = async () => {
    try {
      setIsSimulatingDip(true);
      const res = await fetch('/api/signals/evaluate-target-stocks', { method: 'POST' });
      const data = await res.json();
      if (data.data && Array.isArray(data.data)) {
        const triggers = data.data.filter((d: any) => d.Triggered).map((d: any) => d.Symbol);
        setTriggerFeedback({
          text: `Batch Target Feeds Scanned: ${triggers.length > 0 ? `Triggered ${triggers.join(', ')}` : 'No targets met dip criteria'}.`,
          type: 'info',
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      await fetchSignals();
      await fetchLogs();
      await fetchExecutionLogs();
      if (onRefreshPortfolio) onRefreshPortfolio();
    } catch (err) {
      console.error('Failed to scan targets:', err);
    } finally {
      setIsSimulatingDip(false);
    }
  };

  // Clear Signals
  const handleClearSignals = async () => {
    try {
      await fetch('/api/signals/clear', { method: 'POST' });
      await fetchSignals();
      await fetchLogs();
      setTriggerFeedback({
        text: 'SQLite signals queue table cleared.',
        type: 'info',
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      console.error('Failed to clear signals:', err);
    }
  };

  // Clear Execution Audit Logs
  const handleClearExecutionLogs = async () => {
    try {
      await fetch('/api/signals/clear-execution-logs', { method: 'POST' });
      await fetchExecutionLogs();
      await fetchLogs();
      setTriggerFeedback({
        text: "SQLite 'execution_logs' audit table cleared.",
        type: 'info',
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      console.error('Failed to clear execution logs:', err);
    }
  };

  const naturalLanguagePromptTemplates = [
    {
      label: 'Verify Balances',
      query: 'Check my Tradier sandbox cash balance and buying power for account 6YC17358',
      desc: 'Calls get_account_balances via MCP',
    },
    {
      label: 'Fetch Quotes & Spread',
      query: 'Fetch live bid/ask quotes and spread for INTC, AMD, and F',
      desc: 'Calls get_quotes (< 1.0% spread guardrail)',
    },
    {
      label: 'User Profile',
      query: 'Retrieve user profile and active accounts on Tradier MCP server',
      desc: 'Calls get_user_profile via MCP',
    },
    {
      label: 'Check Orders',
      query: 'Check order execution statuses for account 6YC17358',
      desc: 'Calls get_orders via MCP',
    },
    {
      label: 'Route Buy Order',
      query: 'Route a market buy order for 2 shares of INTC on account 6YC17358',
      desc: 'Calls place_equity_order (1-3 sh micro-lot)',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner: Architecture & MCP Integration Overview */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tradier Hosted Model Context Protocol (MCP) Server</span>
            </span>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
              Account: 6YC17358 (Paper)
            </span>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
              Headers: API_KEY · PAPER_TRADING=true
            </span>
          </div>
          <h2 className="text-base font-bold text-white tracking-tight mt-1 flex items-center gap-2">
            <span>Tradier MCP Server + Gemini AI Execution Architecture</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
            All Tradier account telemetry, live quotes, and order routing natively connect to Tradier's hosted MCP endpoint (<code className="text-emerald-400 font-mono">https://mcp.tradier.com/mcp</code>) registered in Gemini API client context. The local C# engine (<code className="text-purple-300 font-mono">TradingTriggerEngine.cs</code>) and SQLite database (<code className="text-sky-300 font-mono">apextrade.db</code>) evaluate mathematical dips for INTC, AMD, and F, enforce strict micro-lot sizing (1 to 3 shares max), check that (Ask - Bid) / Bid &lt; 0.01 (1.0% max spread), and preserve a $50.00 liquid buffer.
          </p>
        </div>

        {/* MCP Gateway Status & Quick Action */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xs font-mono font-medium text-slate-200">Tradier MCP: Connected</span>
              <span className="text-[10px] text-emerald-400 font-mono">https://mcp.tradier.com/mcp</span>
            </div>
          </div>

          <button
            onClick={() => handleExecuteMcpQuery()}
            disabled={isSubmittingMcpQuery}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 text-emerald-400 ${isSubmittingMcpQuery ? 'animate-spin' : ''}`} />
            <span>{isSubmittingMcpQuery ? 'Running...' : 'Execute MCP'}</span>
          </button>
        </div>
      </div>

      {/* Slippage & Spread Safety Guardrail + Capital Controller Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-purple-950/20 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">C# Local Risk Controls & Dynamic Lot Sizing</h3>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Spread &le; 1.0% · $50 Reserve
                </span>
              </div>
              <p className="text-xs text-slate-400">
                C# engine enforces micro-lot sizing (1 to 3 shares max) and preserves a $50.00 liquid buffer for a $100–$500 bankroll.
              </p>
            </div>
          </div>

          {/* Quick Bankroll Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 font-mono px-2 flex items-center gap-1">
              <Coins className="w-3 h-3 text-amber-400" />
              <span>Seed Bankroll:</span>
            </span>
            {[100, 250, 500, 100000].map((seed) => {
              const isSelected = Math.abs(cashBalance - seed) < 1.0;
              return (
                <button
                  key={seed}
                  onClick={() => handleSelectSeedCash(seed)}
                  disabled={isResettingBankroll}
                  className={`px-2.5 py-1 text-xs font-mono rounded font-semibold transition-all ${
                    isSelected
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  ${seed >= 1000 ? `${seed / 1000}k` : seed}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4 Telemetry Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Available Cash</span>
              <DollarSign className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="text-base font-bold text-white font-mono mt-1">
              ${cashBalance.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
              Spendable: ${spendableCash.toFixed(2)}
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.02]">
            <div className="flex items-center justify-between text-[11px] text-amber-300">
              <span>Safety Buffer Floor</span>
              <Lock className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-base font-bold text-amber-300 font-mono mt-1">
              ${liquidSafetyBuffer.toFixed(2)}
            </div>
            <div className="text-[10px] text-amber-400/80 mt-0.5 font-mono">
              Strictly Preserved
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.02]">
            <div className="flex items-center justify-between text-[11px] text-emerald-300">
              <span>Max Allowed Spread</span>
              <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-base font-bold text-emerald-400 font-mono mt-1">
              &le; 1.00% Spread
            </div>
            <div className="text-[10px] text-emerald-400/80 mt-0.5 font-mono">
              (Ask - Bid) / Bid &le; 0.01
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Dynamic Lot Rule</span>
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-base font-bold text-sky-400 font-mono mt-1">
              1 to 3 Shares Max
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
              15%–20% Allocation Cap
            </div>
          </div>
        </div>

        {/* C# Execution Feedback Banner */}
        {triggerFeedback && (
          <div
            className={`p-3 rounded-lg border text-xs font-mono flex items-start gap-2.5 transition-all ${
              triggerFeedback.type === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : triggerFeedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-purple-500/10 border-purple-500/30 text-purple-300'
            }`}
          >
            {triggerFeedback.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            ) : triggerFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Zap className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span>{triggerFeedback.text}</span>
              <span className="text-[10px] text-slate-500 shrink-0">{triggerFeedback.timestamp}</span>
            </div>
          </div>
        )}
      </div>

      {/* Target Stocks & 2% Dip Trigger Rule Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Target Stocks & 2% Dip Trigger Rule</h3>
            <span className="text-[11px] text-slate-500 font-mono">INTC · AMD · F</span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={handleScanTargets}
              disabled={isSimulatingDip}
              className="flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSimulatingDip ? 'animate-spin' : ''}`} />
              <span>Evaluate Target Feeds</span>
            </button>

            <button
              onClick={() => handleRoutePendingViaMcp()}
              disabled={isRoutingPendingViaMcp}
              className="flex items-center gap-1 px-3 py-1.5 font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg border border-emerald-500/30 transition-colors disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 text-emerald-400 ${isRoutingPendingViaMcp ? 'animate-spin' : ''}`} />
              <span>Route Pending via MCP</span>
            </button>
          </div>
        </div>

        {/* 3 Target Stock Cards with Dynamic Sizing & Spread Pre-flights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {targetStockData.map((item) => {
            const calculatedLot = item.calculateShares();
            const estCost = calculatedLot * item.testPrice;
            const canAfford = calculatedLot > 0;
            const remainingCash = cashBalance - estCost;

            return (
              <div
                key={item.symbol}
                className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-white font-mono">{item.symbol}</span>
                    <span className="text-[11px] text-slate-400 font-mono">Prev Close: ${item.prevClose.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{item.name}</p>

                  <div className="mt-2.5 p-2 rounded bg-slate-900 border border-slate-800/80 text-[11px] font-mono flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Dip Rule:</span>
                      <span className="text-amber-300 font-bold">&le; ${item.dipThreshold.toFixed(2)} (-2.0%)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Dynamic Lot:</span>
                      <span className={`font-bold ${canAfford ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {canAfford ? `${calculatedLot} share${calculatedLot > 1 ? 's' : ''} (~$${estCost.toFixed(2)})` : '0 shares (Safety Buffer)'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">Post-Trade Cash:</span>
                      <span className={remainingCash >= liquidSafetyBuffer ? 'text-slate-400' : 'text-rose-400'}>
                        {canAfford ? `$${remainingCash.toFixed(2)}` : 'Blocked (< $50 reserve)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => handleSimulateDip(item.symbol, item.testDipPercent, 0.15)}
                    disabled={isSimulatingDip}
                    className={`w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 border ${
                      canAfford
                        ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>
                      Normal Spread (0.15% &rarr; Pass): {item.symbol} Dip
                    </span>
                  </button>

                  <button
                    onClick={() => handleTestSpreadGuardrail(item.symbol, item.testDipPercent, 1.50)}
                    disabled={isSimulatingDip}
                    title="Tests Phase 5 slippage guardrail abort when spread > 1.0%"
                    className="w-full py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-[11px] font-mono flex items-center justify-center gap-1 transition-colors"
                  >
                    <ShieldAlert className="w-3 h-3 text-rose-400" />
                    <span>Test Wide Spread (1.50% &rarr; Guardrail Abort)</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom Dip & Spread Simulator */}
        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
          <span className="text-slate-400 font-medium">Custom Test:</span>
          <div className="flex items-center gap-1.5">
            <select
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white font-mono focus:outline-none"
            >
              <option value="INTC">INTC (Intel)</option>
              <option value="AMD">AMD (Advanced Micro)</option>
              <option value="F">F (Ford Motor)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Dip %:</span>
            <input
              type="number"
              step="0.1"
              value={customDip}
              onChange={(e) => setCustomDip(parseFloat(e.target.value) || 0)}
              className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono tabular-nums text-center focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Spread %:</span>
            <input
              type="number"
              step="0.05"
              value={customSpread}
              onChange={(e) => setCustomSpread(parseFloat(e.target.value) || 0)}
              className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono tabular-nums text-center focus:outline-none"
            />
          </div>

          <button
            onClick={() => handleTestSpreadGuardrail(customSymbol, customDip, customSpread)}
            disabled={isSimulatingDip}
            className="px-3 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 rounded font-medium transition-colors disabled:opacity-50"
          >
            Evaluate with Spread Guardrail
          </button>
        </div>
      </div>

      {/* NEW: TRADIER MODEL CONTEXT PROTOCOL (MCP) NATURAL LANGUAGE STUDIO */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/95 to-emerald-950/20 border border-emerald-500/30 rounded-xl p-5 flex flex-col gap-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">Tradier MCP Natural Language Tool Console</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Account: 6YC17358
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                  SSE Protocol Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Execute natural language commands routed directly to Tradier's Model Context Protocol server.
              </p>
            </div>
          </div>

          {/* Quick MCP Tools Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => handleExecuteMcpDirectTool('get_user_profile', {})}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-950 hover:bg-slate-800 text-purple-300 border border-purple-500/30 transition-colors"
              title="Direct native tool call: get_user_profile"
            >
              get_user_profile
            </button>
            <button
              onClick={() => handleExecuteMcpDirectTool('get_account_balances', { account_id: '6YC17358' })}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-950 hover:bg-slate-800 text-emerald-300 border border-emerald-500/30 transition-colors"
              title="Direct native tool call: get_account_balances"
            >
              get_account_balances
            </button>
            <button
              onClick={() => handleExecuteMcpDirectTool('get_quotes', { symbols: ['INTC', 'AMD', 'F'] })}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-950 hover:bg-slate-800 text-sky-300 border border-sky-500/30 transition-colors"
              title="Direct native tool call: get_quotes"
            >
              get_quotes
            </button>
            <button
              onClick={() => handleExecuteMcpDirectTool('place_equity_order', { account_id: '6YC17358', symbol: 'INTC', side: 'buy', quantity: 2, type: 'market' })}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/30 transition-colors"
              title="Direct native tool call: place_equity_order"
            >
              place_equity_order
            </button>
            <button
              onClick={() => handleExecuteMcpDirectTool('get_orders', { account_id: '6YC17358' })}
              className="px-2 py-1 text-[11px] font-mono rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
              title="Direct native tool call: get_orders"
            >
              get_orders
            </button>
          </div>
        </div>

        {/* Quick Natural Language Templates */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
            Natural Language Tool Commands:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {naturalLanguagePromptTemplates.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setMcpQueryInput(item.query);
                  handleExecuteMcpQuery(item.query);
                }}
                disabled={isSubmittingMcpQuery}
                className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800/80 border border-slate-800/80 text-left transition-all group flex flex-col justify-between gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-300 group-hover:text-emerald-200 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>{item.label}</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono group-hover:text-slate-300">&rarr;</span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans line-clamp-1">
                  "{item.query}"
                </p>
                <span className="text-[10px] text-slate-500 font-mono">
                  {item.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Query Input Bar */}
        <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
          <MessageSquare className="w-4 h-4 text-emerald-400 ml-2 shrink-0" />
          <input
            type="text"
            value={mcpQueryInput}
            onChange={(e) => setMcpQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleExecuteMcpQuery();
            }}
            placeholder="Type any natural language command for Tradier MCP (e.g., Check my sandbox balances for account 6YC17358)..."
            className="flex-1 bg-transparent border-0 text-xs text-white placeholder-slate-500 focus:outline-none font-sans"
          />
          <button
            onClick={() => handleExecuteMcpQuery()}
            disabled={isSubmittingMcpQuery || !mcpQueryInput.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50 shrink-0 shadow-sm"
          >
            <Send className={`w-3.5 h-3.5 ${isSubmittingMcpQuery ? 'animate-spin' : ''}`} />
            <span>{isSubmittingMcpQuery ? 'Processing...' : 'Send to MCP'}</span>
          </button>
        </div>

        {/* MCP Response Preview Card */}
        {mcpLastResult && (
          <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/20 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="font-mono text-emerald-400 font-bold">[{mcpLastResult.tool}]</span>
                <span className="text-slate-400 text-[11px]">Tradier MCP Telemetry</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500">{mcpLastResult.timestamp}</span>
            </div>

            <div className="text-xs text-slate-200 font-sans leading-relaxed">
              {mcpLastResult.naturalResponse}
            </div>

            {mcpLastResult.data && (
              <pre className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-40">
                {JSON.stringify(mcpLastResult.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Split Grid: Live Signals Queue & Audit Logs (Left) + Live MCP Console Stream (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Tabbed Signals Queue & Execution Audit Logs (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 flex-wrap gap-2">
            {/* View Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 flex-wrap">
              <button
                onClick={() => setActiveTableTab('signals')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  activeTableTab === 'signals'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Signals Queue</span>
                <span className="text-[10px] opacity-80 font-mono">({signals.length})</span>
              </button>

              <button
                onClick={() => setActiveTableTab('audit_logs')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  activeTableTab === 'audit_logs'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Execution Logs</span>
                <span className="text-[10px] opacity-80 font-mono">({executionLogs.length})</span>
              </button>

              <button
                onClick={() => setActiveTableTab('webhooks')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  activeTableTab === 'webhooks'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bell className="w-3.5 h-3.5 text-amber-400" />
                <span>Push Webhooks</span>
                <span className="text-[10px] opacity-80 font-mono">({notifications.length})</span>
              </button>

              <button
                onClick={() => setActiveTableTab('cloud_deploy')}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                  activeTableTab === 'cloud_deploy'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Cloud className="w-3.5 h-3.5 text-sky-400" />
                <span>24/7 Cloud Actions</span>
              </button>
            </div>

            {/* Action / Counts Badges */}
            {activeTableTab === 'signals' ? (
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono font-semibold">
                  Pending: {counts.pending}
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-mono font-semibold">
                  Executed: {counts.executed}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono font-semibold">
                  Filled: {counts.filled ?? 0}
                </span>
                {counts.rejected ? (
                  <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-mono font-semibold">
                    Rejected: {counts.rejected}
                  </span>
                ) : null}

                {counts.pending > 0 && (
                  <button
                    onClick={() => handleRoutePendingViaMcp()}
                    disabled={isRoutingPendingViaMcp}
                    className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 rounded transition-colors disabled:opacity-50 font-mono"
                    title="Route next pending signal through Gemini Tradier MCP tool place_equity_order"
                  >
                    <Zap className={`w-3 h-3 ${isRoutingPendingViaMcp ? 'animate-spin' : ''}`} />
                    <span>Route Pending via Gemini MCP</span>
                  </button>
                )}

                <button
                  onClick={handleClearSignals}
                  title="Clear Signals Queue"
                  className="p-1 text-slate-500 hover:text-rose-400 transition-colors ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : activeTableTab === 'audit_logs' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Total Logs: {executionLogs.length}
                </span>
                <button
                  onClick={handleClearExecutionLogs}
                  title="Clear execution audit logs"
                  className="flex items-center gap-1 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10 rounded border border-rose-500/30 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Logs</span>
                </button>
              </div>
            ) : activeTableTab === 'webhooks' ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestWebhook}
                  disabled={isTestingWebhook}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 rounded transition-colors disabled:opacity-50"
                >
                  <Send className={`w-3 h-3 ${isTestingWebhook ? 'animate-spin' : ''}`} />
                  <span>{isTestingWebhook ? 'Dispatching...' : 'Send Test Alert'}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Tradier Account: 6YC17358</span>
              </div>
            )}
          </div>

          {/* VIEW 1: SIGNALS QUEUE TABLE */}
          {activeTableTab === 'signals' && (
            <div>
              {signals.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No signal actions logged in SQLite table yet. Click any "Simulate Dip" button above to fire the C# rule!
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-500 text-[11px]">
                      <tr>
                        <th className="py-2 px-2">ID</th>
                        <th className="py-2 px-2">Status</th>
                        <th className="py-2 px-2">Symbol</th>
                        <th className="py-2 px-2">Side</th>
                        <th className="py-2 px-2 text-right">Qty</th>
                        <th className="py-2 px-2 text-right">Price</th>
                        <th className="py-2 px-2">Created</th>
                        <th className="py-2 px-2 text-center">MCP Routing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {signals.map((sig) => {
                        const isPending = sig.status === 'PENDING';
                        const isExecuted = sig.status === 'EXECUTED';
                        const isFilled = sig.status === 'FILLED';
                        const isRejected = sig.status === 'REJECTED';

                        return (
                          <tr key={sig.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2 px-2 text-purple-300 font-bold">#{sig.id}</td>
                            <td className="py-2 px-2">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isPending
                                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 animate-pulse'
                                    : isFilled
                                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                    : isExecuted
                                    ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30'
                                    : isRejected
                                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                                }`}
                              >
                                {isPending && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping inline-block" />}
                                {isFilled && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />}
                                {isExecuted && <Clock className="w-2.5 h-2.5 text-sky-400" />}
                                {isRejected && <XCircle className="w-2.5 h-2.5 text-rose-400" />}
                                <span>{sig.status}</span>
                              </span>
                            </td>
                            <td className="py-2 px-2 font-bold text-white">{sig.symbol}</td>
                            <td className="py-2 px-2">
                              <span className="text-emerald-400 font-semibold">{sig.side}</span>
                            </td>
                            <td className="py-2 px-2 text-right text-slate-300 font-bold">{sig.quantity}</td>
                            <td className="py-2 px-2 text-right text-white font-bold">${sig.price.toFixed(2)}</td>
                            <td className="py-2 px-2 text-[10px] text-slate-500 whitespace-nowrap">
                              {new Date(sig.created_at).toLocaleTimeString()}
                            </td>
                            <td className="py-2 px-2 text-center">
                              {isPending ? (
                                <button
                                  onClick={() => handleRoutePendingViaMcp(sig.id)}
                                  disabled={isRoutingPendingViaMcp}
                                  className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/40 font-sans font-semibold flex items-center gap-1 mx-auto disabled:opacity-50"
                                  title="Route pending trigger through Gemini Tradier MCP tool place_equity_order to update status to FILLED"
                                >
                                  <Zap className="w-2.5 h-2.5" />
                                  <span>Route Gemini MCP</span>
                                </button>
                              ) : sig.response ? (
                                <button
                                  onClick={() => setSelectedResponse({
                                    id: sig.id,
                                    symbol: sig.symbol,
                                    title: `Tradier MCP Payload · Signal #${sig.id} (${sig.status})`,
                                    response: sig.response!
                                  })}
                                  className="text-[10px] text-purple-400 hover:text-purple-300 underline font-sans"
                                >
                                  View API
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-600 font-sans">Awaiting</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: EXECUTION AUDIT LOGS TABLE */}
          {activeTableTab === 'audit_logs' && (
            <div>
              {executionLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No audit log entries in SQLite 'execution_logs' yet. Orders routed via Tradier MCP will log full HTTP response payloads here!
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-500 text-[11px]">
                      <tr>
                        <th className="py-2 px-2">Log ID</th>
                        <th className="py-2 px-2">Signal</th>
                        <th className="py-2 px-2">Order ID</th>
                        <th className="py-2 px-2">Symbol</th>
                        <th className="py-2 px-2">Action</th>
                        <th className="py-2 px-2 text-center">HTTP Status</th>
                        <th className="py-2 px-2">Timestamp</th>
                        <th className="py-2 px-2 text-center">Payload</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {executionLogs.map((logItem) => {
                        const is200 = logItem.status_code === 200 || logItem.status_code === 201;
                        const isReconcile = logItem.action === 'RECONCILE';

                        return (
                          <tr key={logItem.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2 px-2 text-slate-500">#{logItem.id}</td>
                            <td className="py-2 px-2 text-purple-300 font-bold">
                              {logItem.signal_id ? `#${logItem.signal_id}` : '-'}
                            </td>
                            <td className="py-2 px-2 text-slate-300 font-mono font-medium">
                              {logItem.order_id ? `#${logItem.order_id}` : 'Pending'}
                            </td>
                            <td className="py-2 px-2 font-bold text-white">{logItem.symbol}</td>
                            <td className="py-2 px-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isReconcile
                                    ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                                    : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {logItem.action}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  is200
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                }`}
                              >
                                HTTP {logItem.status_code}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-[10px] text-slate-500 whitespace-nowrap">
                              {logItem.created_at}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                onClick={() => setSelectedResponse({
                                  id: logItem.id,
                                  symbol: logItem.symbol,
                                  title: `Execution Log #${logItem.id} (Order #${logItem.order_id ?? 'N/A'})`,
                                  response: logItem.raw_response
                                })}
                                className="text-[10px] text-purple-400 hover:text-purple-300 underline font-sans"
                              >
                                Raw JSON
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: DISCORD & TELEGRAM PUSH NOTIFICATIONS TABLE */}
          {activeTableTab === 'webhooks' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">Channel Delivery:</span>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono text-[11px]">
                    <Globe className="w-3 h-3 text-indigo-400" />
                    <span>Discord: {cloudDeploymentInfo?.secretsChecklist.find(s => s.name === 'DISCORD_WEBHOOK_URL')?.configured ? 'Active' : 'Simulated / Ready'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 font-mono text-[11px]">
                    <Send className="w-3 h-3 text-sky-400" />
                    <span>Telegram: {cloudDeploymentInfo?.secretsChecklist.find(s => s.name === 'TELEGRAM_BOT_TOKEN')?.configured ? 'Active' : 'Simulated / Ready'}</span>
                  </div>
                </div>

                <button
                  onClick={fetchNotifications}
                  disabled={isLoadingNotifications}
                  className="p-1 text-slate-400 hover:text-white transition-colors"
                  title="Refresh Notifications"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingNotifications ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                  <Bell className="w-6 h-6 text-slate-700" />
                  <span>No notifications dispatched yet. Click "Send Test Alert" or trigger an order to see push events!</span>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-500 text-[11px]">
                      <tr>
                        <th className="py-2 px-2">ID</th>
                        <th className="py-2 px-2">Event</th>
                        <th className="py-2 px-2">Title & Alert Message</th>
                        <th className="py-2 px-2">Channels</th>
                        <th className="py-2 px-2 text-center">Status</th>
                        <th className="py-2 px-2">Timestamp</th>
                        <th className="py-2 px-2 text-center">Payload</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {notifications.map((notif) => {
                        const isSignal = notif.event_type === 'SIGNAL_DETECTED';
                        const isExecuted = notif.event_type === 'ORDER_EXECUTED';
                        const isReconciled = notif.event_type === 'ORDER_RECONCILED';
                        const isRejected = notif.event_type === 'ORDER_REJECTED';
                        const isError = notif.event_type === 'API_ERROR';

                        return (
                          <tr key={notif.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5 px-2 text-slate-400">#{notif.id}</td>
                            <td className="py-2.5 px-2 whitespace-nowrap">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isReconciled
                                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                    : isExecuted
                                    ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30'
                                    : isSignal
                                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                                    : isRejected || isError
                                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                                    : 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                                }`}
                              >
                                {notif.event_type}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 max-w-[200px]">
                              <div className="font-semibold text-slate-200 text-xs font-sans truncate">{notif.title}</div>
                              <div className="text-[11px] text-slate-400 font-sans truncate">{notif.message}</div>
                            </td>
                            <td className="py-2.5 px-2 text-[10px] text-slate-400 whitespace-nowrap">
                              {notif.channels}
                            </td>
                            <td className="py-2.5 px-2 text-center whitespace-nowrap">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  notif.status === 'DELIVERED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                }`}
                              >
                                {notif.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-[10px] text-slate-500 whitespace-nowrap">
                              {notif.created_at}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                onClick={() => setSelectedResponse({
                                  id: notif.id,
                                  symbol: notif.event_type,
                                  title: `Push Alert #${notif.id} (${notif.title})`,
                                  response: notif.details || notif.message
                                })}
                                className="text-[10px] text-purple-400 hover:text-purple-300 underline font-sans"
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VIEW 4: CLOUD 24/7 AUTOMATION & GITHUB ACTIONS */}
          {activeTableTab === 'cloud_deploy' && (
            <div className="flex flex-col gap-4">
              <div className="bg-gradient-to-r from-sky-950/40 to-slate-950 p-4 rounded-xl border border-sky-800/30 flex flex-col gap-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                      <Cloud className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-sans">GitHub Actions Cron Scheduler (MCP Mode)</h4>
                      <p className="text-[11px] text-slate-400 font-sans">
                        Runs automatically every 5 minutes during regular US market trading hours to evaluate dip triggers.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30 font-mono text-xs font-bold">
                    cron: */5 13-20 * * 1-5
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-sans">Market Days</span>
                    <span className="text-slate-200 font-semibold font-mono">Mon – Fri</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-sans">Market Hours</span>
                    <span className="text-slate-200 font-semibold font-mono">9:30A – 4:00P EST</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-sans">Account ID</span>
                    <span className="text-emerald-400 font-semibold font-mono">6YC17358</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-sans">Target Stocks</span>
                    <span className="text-purple-300 font-semibold font-mono">INTC, AMD, F</span>
                  </div>
                </div>
              </div>

              {/* GitHub Secrets Configuration Checklist */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white font-sans flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>GitHub Repository Secrets Checklist</span>
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">Settings &gt; Secrets &gt; Actions</span>
                </div>
                <p className="text-[11px] text-slate-400 font-sans">
                  Configure these secrets in your GitHub repository for automated cloud trading & alerts:
                </p>

                <div className="space-y-1.5">
                  {[
                    { name: 'TRADIER_TOKEN', req: true, desc: 'Personal Tradier Sandbox Bearer Token (PvInCzfQGjisybA5t8Xd77lUapR1)' },
                    { name: 'TRADIER_ACCOUNT_ID', req: true, desc: 'Sandbox Account ID (6YC17358)' },
                    { name: 'TRADIER_MCP_ENDPOINT', req: false, desc: 'Hosted MCP server (https://mcp.tradier.com/mcp)' },
                    { name: 'DISCORD_WEBHOOK_URL', req: false, desc: 'Discord Incoming Webhook URL for trade push notifications' },
                    { name: 'TELEGRAM_BOT_TOKEN', req: false, desc: 'Telegram Bot Token from @BotFather' },
                    { name: 'TELEGRAM_CHAT_ID', req: false, desc: 'Telegram Chat or Group Channel ID' },
                  ].map((sec) => (
                    <div
                      key={sec.name}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800/80 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-purple-300">{sec.name}</span>
                        {sec.req ? (
                          <span className="text-[9px] px-1 py-0.2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded font-mono">REQUIRED</span>
                        ) : (
                          <span className="text-[9px] px-1 py-0.2 bg-slate-800 text-slate-400 rounded font-mono">OPTIONAL</span>
                        )}
                        <span className="text-slate-400 text-[11px] hidden sm:inline font-sans">{sec.desc}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(sec.name, sec.name)}
                        className="p-1 text-slate-400 hover:text-white transition-colors"
                        title="Copy Secret Name"
                      >
                        {copiedSecret === sec.name ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tablet 1-Click Push to GitHub (No CLI Required) */}
              <div className="bg-slate-900/90 p-4 rounded-xl border border-purple-500/30 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                      <Cloud className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white font-sans">Tablet 1-Click Push to GitHub (No CLI Required)</h4>
                      <p className="text-[11px] text-slate-400 font-sans">
                        Push the complete committed codebase directly from your tablet browser to your GitHub repository.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Local Git Ready (main branch)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">
                      GitHub Repository URL:
                    </label>
                    <input
                      type="url"
                      placeholder="https://github.com/your-username/apextrade"
                      value={githubRepoUrl}
                      onChange={(e) => setGithubRepoUrl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-purple-500/60"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 font-medium block mb-1">
                      Personal Access Token (with 'repo' scope):
                    </label>
                    <input
                      type="password"
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-purple-500/60"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                  <p className="text-[10px] text-slate-500 font-sans">
                    Generate token at <code className="text-purple-300">github.com/settings/tokens</code> &rarr; Tokens (classic) &rarr; check <span className="text-slate-300">repo</span>.
                  </p>
                  <button
                    onClick={handlePushToGithub}
                    disabled={isPushingToGithub || !githubRepoUrl.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50 shadow-sm"
                  >
                    <Cloud className={`w-3.5 h-3.5 ${isPushingToGithub ? 'animate-spin' : ''}`} />
                    <span>{isPushingToGithub ? 'Pushing to GitHub...' : 'Push Codebase to GitHub'}</span>
                  </button>
                </div>

                {githubPushFeedback && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-sans ${
                      githubPushFeedback.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {githubPushFeedback.text}
                  </div>
                )}
              </div>

              {/* Quick Downloads for Cloud Deployment & Tablet Archive */}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 font-sans">Ready-to-Deploy Cloud Artifacts:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href="/api/download/project-zip"
                    download="apextrade-project.zip"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition-colors"
                    title="Download complete clean project as a ZIP file to upload directly on github.com"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download Project ZIP</span>
                  </a>
                  <a
                    href="/api/download/tradier_mcp_config.json"
                    download="tradier_mcp_config.json"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>tradier_mcp_config.json</span>
                  </a>
                  <a
                    href="/api/download/trading_bot.yml"
                    download="trading_bot.yml"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-sky-500/10 text-sky-300 border border-sky-500/30 hover:bg-sky-500/20 transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    <span>trading_bot.yml</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Streaming Tradier MCP & Signal Logs (5 cols) */}
        <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[520px] shadow-2xl">
          {/* Console Header */}
          <div className="bg-slate-900/90 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
              </div>
              <span className="text-xs font-mono text-emerald-400 ml-1 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" />
                <span>tradier-mcp [6YC17358]</span>
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-purple-600 focus:ring-0 text-xs"
                />
                <span>Auto-scroll</span>
              </label>
            </div>
          </div>

          {/* Console Stream Output */}
          <div className="p-3.5 flex-1 overflow-auto font-mono text-[11px] text-slate-300 leading-relaxed bg-[#030712] select-text">
            {logs.length === 0 ? (
              <div className="text-slate-600 flex flex-col items-center justify-center h-full gap-2 text-center p-4">
                <Terminal className="w-6 h-6 text-slate-700" />
                <span>Waiting for Tradier MCP telemetry stream...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {logs.map((line, idx) => {
                  const isMcp = line.includes('[MCP');
                  const isTradier = line.includes('[TRADIER');
                  const isStatus = line.includes('[STATUS]');
                  const isReconcile = line.includes('[RECONCILE]');
                  const isAudit = line.includes('[AUDIT]');
                  const isDispatch = line.includes('[DISPATCH]');
                  const isPoll = line.includes('[POLL]');
                  const isHeartbeat = line.includes('[HEARTBEAT]');
                  const isTrigger = line.includes('[C# TRIGGER]') || line.includes('[C# GUARDRAIL]');

                  return (
                    <div
                      key={idx}
                      className={`break-all ${
                        isMcp
                          ? 'text-emerald-400 font-semibold'
                          : isReconcile
                          ? 'text-purple-300 font-semibold'
                          : isStatus
                          ? 'text-emerald-300 font-semibold'
                          : isAudit
                          ? 'text-cyan-300'
                          : isTradier
                          ? 'text-sky-300'
                          : isDispatch
                          ? 'text-amber-300'
                          : isTrigger
                          ? 'text-indigo-300 font-semibold'
                          : isHeartbeat
                          ? 'text-slate-500'
                          : isPoll
                          ? 'text-slate-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>

          {/* Console Footer */}
          <div className="bg-slate-900/90 px-3 py-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono flex-wrap gap-2">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Tradier MCP Gateway · Account 6YC17358 · Webhooks Active</span>
            </span>
            <div className="flex items-center gap-2">
              <a
                href="/api/download/tradier_mcp_config.json"
                download="tradier_mcp_config.json"
                className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                title="Download Tradier MCP Configuration"
              >
                <Download className="w-3 h-3" />
                <span>mcp_config.json</span>
              </a>
              <span className="text-slate-700">·</span>
              <a
                href="/api/download/trading_bot.yml"
                download="trading_bot.yml"
                className="text-sky-400 hover:text-sky-300 flex items-center gap-1"
                title="Download GitHub Actions Workflow"
              >
                <Download className="w-3 h-3" />
                <span>workflow.yml</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Response Payload Modal Drawer */}
      {selectedResponse && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 flex flex-col gap-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-white">
                {selectedResponse.title}
              </h4>
              <button
                onClick={() => setSelectedResponse(null)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>
            <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto max-h-72">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(selectedResponse.response), null, 2);
                } catch {
                  return selectedResponse.response;
                }
              })()}
            </pre>
            <button
              onClick={() => setSelectedResponse(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export interface StockQuote {
  symbol: string;
  success: boolean;
  price?: number;
  previous_close?: number;
  change?: number;
  change_percent?: number;
  day_high?: number | null;
  day_low?: number | null;
  fifty_two_week_high?: number | null;
  fifty_two_week_low?: number | null;
  volume?: number;
  currency?: string;
  exchange?: string;
  instrument_type?: string;
  timestamp?: string;
  market_state?: string;
  error?: string;
}

export interface CandleData {
  timestamp: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoryResponse {
  success: boolean;
  symbol: string;
  currency: string;
  exchange: string;
  interval: string;
  range: string;
  regularMarketPrice?: number;
  previousClose?: number;
  candles: CandleData[];
  error?: string;
}

export interface PythonRunResponse {
  success: boolean;
  exitCode: number;
  durationMs: number;
  command: string;
  stdout: string;
  stderr: string;
  parsedData?: any;
  error?: string;
}

export interface PortfolioPosition {
  symbol: string;
  shares: number;
  averageCostBasis: number;
  currentPrice: number;
  marketValue: number;
  totalCost: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  lastUpdated: string;
}

export interface TradeRecord {
  tradeId: string;
  timestamp: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  shares: number;
  executionPrice: number;
  totalAmount: number;
  realizedPnL: number;
  remainingCashBalance: number;
  runningOrderCount: number;
  runningAverageProfitPerTrade: number;
  runningWinLossRatio: number;
  runningWinRatePercent: number;
  runningPortfolioValue?: number;
  runningRealizedPnL?: number;
  runningInvestedValue?: number;
  runningDrawdownPercent?: number;
}

export interface TradeStatistics {
  totalExecutedOrders: number;
  buyOrdersCount: number;
  sellOrdersCount: number;
  winningTradesCount: number;
  losingTradesCount: number;
  breakEvenTradesCount: number;
  winLossRatio: number;
  winRatePercent: number;
  averageProfitPerTrade: number;
  averageWinningTrade: number;
  averageLosingTrade: number;
  totalGrossProfit: number;
  totalGrossLoss: number;
  profitFactor: number;
  largestWinningTrade: number;
  largestLosingTrade: number;
  totalSharesTraded: number;
  totalDollarTurnover: number;
}

export interface PortfolioState {
  initialBalance: number;
  cashBalance: number;
  investedValue: number;
  totalPortfolioValue: number;
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  totalNetPnL: number;
  totalReturnPercent: number;
  positions: Record<string, PortfolioPosition>;
  tradeHistory: TradeRecord[];
  statistics: TradeStatistics;
}

export interface CSharpRunResponse {
  success: boolean;
  exitCode: number;
  durationMs: number;
  command: string;
  stdout: string;
  stderr: string;
  parsedData?: any;
  error?: string;
}

export interface VaultDbStatus {
  databasePath: string;
  databaseFileName: string;
  exists: boolean;
  fileSizeBytes: number;
  portfolioStateRows: number;
  tradeHistoryRows: number;
  signalsRows?: number;
  pendingSignalsCount?: number;
  executionLogsRows?: number;
  lastUpdated: string;
  isHealthy: boolean;
}

export interface TradingSignal {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  type: string;
  price: number;
  status: 'PENDING' | 'EXECUTED' | 'FILLED' | 'REJECTED' | 'FAILED' | 'CANCELED' | string;
  created_at: string;
  response?: string | null;
}

export interface SignalCounts {
  total: number;
  pending: number;
  executed: number;
  filled?: number;
  rejected?: number;
  failed: number;
}

export interface ExecutionLogRecord {
  id: number;
  signal_id: number | null;
  order_id: string | null;
  symbol: string;
  action: string;
  status_code: number;
  raw_response: string;
  created_at: string;
}

export interface TriggerEvaluationResult {
  Symbol: string;
  PreviousClose: number;
  CurrentPrice: number;
  ChangeAmount: number;
  ChangePercent: number;
  Triggered: boolean;
  Rule: string;
  Reason: string;
  InsertedSignalId?: number | null;
  OrderQuantity: number;
  OrderSide: string;
  AvailableCash?: number;
  LiquidSafetyBuffer?: number;
  EstimatedOrderCost?: number;
  RemainingCashAfterTrade?: number;
  BidPrice?: number;
  AskPrice?: number;
  SpreadPercent?: number;
  SpreadGuardrailPassed?: boolean;
  Timestamp: string;
}

export interface PollerLogsResponse {
  isRunning: boolean;
  logs: string[];
  count: number;
  timestamp: string;
}

export interface NotificationRecord {
  id: number;
  event_type: 'SIGNAL_DETECTED' | 'ORDER_EXECUTED' | 'ORDER_RECONCILED' | 'ORDER_REJECTED' | 'API_ERROR' | 'TEST_ALERT' | string;
  title: string;
  message: string;
  details: string | null;
  channels: string;
  status: string;
  created_at: string;
}

export interface CloudSecretItem {
  name: string;
  required: boolean;
  description: string;
  configured: boolean;
}

export interface CloudDeploymentInfo {
  success: boolean;
  workflow: {
    file: string;
    name: string;
    cron: string;
    description: string;
    scheduleDescription: string;
  };
  secretsChecklist: CloudSecretItem[];
  targets: string[];
  rules: {
    dipThreshold: string;
    spreadSafetyGuardrail: string;
    smallAccountBudget: string;
  };
}




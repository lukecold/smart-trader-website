export interface Strategy {
  strategyId: string;
  strategyName: string | null;
  strategyType: string | null;
  status: string;
  stopReason: string | null;
  tradingMode: string | null;
  totalPnl: number | null;
  totalPnlPct: number | null;
  createdAt: string;
  exchangeId: string | null;
  modelId: string | null;
  userId: string | null;
  pushStatus: string | null;
}

export interface StrategyList {
  strategies: Strategy[];
  total: number;
  runningCount: number;
}

export interface Holding {
  symbol: string;
  type: string;
  leverage: number | null;
  entryPrice: number | null;
  quantity: number;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
}

export interface PortfolioSummary {
  strategyId: string;
  ts: number;
  cash: number | null;
  totalValue: number | null;
  totalPnl: number | null;
  totalPnlPct: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  realizedPnl: number | null;
  grossExposure: number | null;
  netExposure: number | null;
}

export interface StrategyPerformance {
  strategyId: string;
  initialCapital: number | null;
  returnRatePct: number | null;
  llmProvider: string | null;
  llmModelId: string | null;
  exchangeId: string | null;
  strategyType: string | null;
  tradingMode: string | null;
  maxLeverage: number | null;
  symbols: string[] | null;
  promptName: string | null;
  prompt: string | null;
}

export interface TradeAction {
  instructionId: string;
  symbol: string;
  action: string;
  actionDisplay?: string;
  side: string | null;
  quantity: number | null;
  leverage: number | null;
  avgExecPrice: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  notionalEntry: number | null;
  feeCost: number | null;
  realizedPnl: number | null;
  realizedPnlPct: number | null;
  holdingTimeMs: number | null;
  entryAt: string | null;
  exitAt: string | null;
  // Attribution: "engine" for code-initiated actions (#4 stop-trigger, #2
  // trend-reversal), "llm" otherwise. `note` carries the engine reason
  // (e.g. "engine_stop_trigger: stop_loss").
  origin?: string;
  note?: string | null;
}

export interface ComposeCycle {
  composeId: string;
  cycleIndex: number;
  createdAt: string;
  rationale: string | null;
  actions: TradeAction[];
}

export interface Prompt {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersion {
  version: number;
  prompt: string;
  note: string;
  createdAt: string;
}

export interface BacktestPoint {
  ts: number;
  totalValue: number;
  cash: number;
  pnl: number;
}

export interface BacktestTrade {
  ts: number;
  symbol: string;
  action: string;
  side: string;
  quantity: number;
  price: number;
  pnl: number;
}

export interface BacktestSummary {
  totalReturn: number;
  totalReturnPct: number;
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
}

export interface CandleConfig {
  interval: string;
  limit: number;
}

// ----- Social: follow / copy-trade / leaderboard / redacted view -----

export type StrategyRelation =
  | "own"
  | "follow"
  | "copytrade"
  | "follow+copytrade";

export interface DashboardItem {
  strategyId: string;
  strategyName: string | null;
  status: string;
  exchangeId: string | null;
  modelId: string | null;
  createdAt: string;
  public: boolean;
  isOwner: boolean;
  relation: StrategyRelation;
  totalPnlPct: number | null;
  // Present only when isOwner
  totalPnl?: number | null;
  // Present when you copy-trade it
  copyTradeAllocation?: number | null;
}

export interface DashboardResponse {
  strategies: DashboardItem[];
  total: number;
}

// Range domain lives in @/lib/ranges (single source of truth). Imported for local
// use below and re-exported so existing `@/types/strategy` importers keep working
// without hardcoding the set.
import type { LeaderboardRange } from "@/lib/ranges";
export type { LeaderboardRange };

export interface LeaderboardItem {
  strategyId: string;
  strategyName: string | null;
  status: string;
  exchangeId: string | null;
  modelId: string | null;
  createdAt: string;
  public: boolean;
  isOwner: boolean;
  relation: StrategyRelation;
  totalPnlPct: number | null;
  rangeReturnPct: number | null;
  sparkline: number[] | null; // downsampled %-return series over the selected window
  isFollowing: boolean;
  isCopyTrading: boolean;
}

export interface LeaderboardResponse {
  strategies: LeaderboardItem[];
  range: LeaderboardRange;
  total: number;
}

export interface PerfPoint {
  ts: number;
  pct: number;
}

export interface RedactedPosition {
  symbol: string;
  direction: "LONG" | "SHORT";
  pnlPct: number;
}

export interface RedactedView {
  strategyId: string;
  strategyName: string | null;
  status: string;
  exchangeId: string | null;
  modelId: string | null;
  public: boolean;
  isOwner: boolean;
  isFollowing: boolean;
  isCopyTrading: boolean;
  totalPnlPct: number | null;
  performance: PerfPoint[];
  positions: RedactedPosition[];
}

export interface CreateStrategyInput {
  llm_model_config: {
    provider: string;
    model_id: string;
    api_key?: string;
  };
  exchange_config: {
    exchange_id?: string;
    api_key?: string;
    secret_key?: string;
    passphrase?: string;
    trading_mode?: string;
    market_type?: string;
    margin_mode?: string;
    // IBKR routing (no API key/secret — the account/gateway session is the credential).
    account_id?: string;
    gateway_url?: string;
    base_currency?: string;
  };
  trading_config: {
    strategy_name: string;
    strategy_type: string;
    initial_capital: number;
    max_leverage?: number;
    max_positions?: number;
    decide_interval?: number;
    symbols: string[];
    candle_configs?: CandleConfig[];
    template_id?: string;
    prompt_text?: string;
    cap_factor?: number;
  };
}

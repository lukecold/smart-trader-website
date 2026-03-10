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
  feeCost: number | null;
  realizedPnl: number | null;
  realizedPnlPct: number | null;
  holdingTimeMs: number | null;
  entryAt: string | null;
  exitAt: string | null;
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
  };
  trading_config: {
    strategy_name: string;
    strategy_type: string;
    initial_capital: number;
    max_leverage?: number;
    max_positions?: number;
    decide_interval?: number;
    symbols: string[];
    template_id?: string;
    prompt_text?: string;
    cap_factor?: number;
  };
}

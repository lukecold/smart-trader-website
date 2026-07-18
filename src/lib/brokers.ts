// Shared broker registry used by the create form and the replicate modal.
// Mirrors the backend's exchange routing (internal/exchange/factory.go) and its
// broker→asset-class mapping (assetClassForExchange): Binance trades crypto
// pairs; the brokerages trade cash equities. Credentials/routing for equity
// brokers come from the server env, not the forms.

export type AssetClass = "crypto" | "equity";

export interface BrokerMeta {
  id: string;
  label: string;
  asset: AssetClass;
  group: string;
}

// Brokers the create form offers. Crypto runs the virtual/live toggle; equity
// brokers run *live against a paper account by default* (there is no equity
// paper-simulation path — virtual mode uses Binance crypto data).
export const BROKERS: BrokerMeta[] = [
  { id: "binance", label: "Binance", asset: "crypto", group: "Crypto" },
  { id: "ibkr", label: "Interactive Brokers", asset: "equity", group: "Equities (US)" },
  { id: "alpaca", label: "Alpaca", asset: "equity", group: "Equities (US)" },
];

// Equity brokers the create form does not offer but existing strategies may run
// on (mirrors the backend's assetClassForExchange).
const EQUITY_ONLY_BROKERS = new Set(["ibkr", "alpaca", "tradestation", "schwab"]);

export const assetClassOf = (id: string): AssetClass =>
  BROKERS.find((b) => b.id === id)?.asset ??
  (EQUITY_ONLY_BROKERS.has(id) ? "equity" : "crypto");

export const brokerLabel = (id: string): string =>
  BROKERS.find((b) => b.id === id)?.label ?? id;

export const POPULAR_SYMBOLS_CRYPTO = [
  "BTC-USDT", "ETH-USDT", "SOL-USDT", "BNB-USDT",
  "XRP-USDT", "DOGE-USDT", "ADA-USDT", "AVAX-USDT",
];
export const POPULAR_SYMBOLS_EQUITY = [
  "AAPL", "MSFT", "NVDA", "AMZN",
  "GOOGL", "META", "TSLA", "SPY",
];

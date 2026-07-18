import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateStrategy, usePrompts, useFetchBalance, useProviderModels } from "@/api/strategies";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import type { CandleConfig, CreateStrategyInput } from "@/types/strategy";
import { LLM_PROVIDERS, MODEL_PRESETS } from "@/lib/models";
import { BROKERS, assetClassOf, POPULAR_SYMBOLS_CRYPTO, POPULAR_SYMBOLS_EQUITY, POPULAR_SYMBOLS_HYPERLIQUID } from "@/lib/brokers";
import type { AssetClass } from "@/lib/brokers";
import { StandaloneBacktestPanel } from "@/components/strategy/StandaloneBacktestPanel";
import { BinanceOnboardingWizard } from "@/components/strategy/BinanceOnboardingWizard";
import { SymbolTagInput } from "@/components/strategy/SymbolTagInput";

const DEFAULT_CANDLE_CONFIGS: CandleConfig[] = [
  { interval: "1h", limit: 168 },
  { interval: "4h", limit: 120 },
  { interval: "1d", limit: 60 },
];

const INTERVAL_OPTIONS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w"];

// Broker registry + asset-class mapping moved to @/lib/brokers (shared with the
// replicate modal).

// MODEL_PRESETS moved to @/lib/models (shared with the replicate modal).

// Decision-interval unit → seconds. decide_interval is sent to the backend in seconds.
const INTERVAL_UNITS: Record<string, { label: string; seconds: number }> = {
  sec: { label: "Seconds", seconds: 1 },
  min: { label: "Minutes", seconds: 60 },
  hour: { label: "Hours", seconds: 3600 },
  day: { label: "Days", seconds: 86400 },
};

export function CreateStrategy() {
  const navigate = useNavigate();
  const createMutation = useCreateStrategy();
  const fetchBalanceMutation = useFetchBalance();
  const { data: prompts } = usePrompts();
  const { withAuth } = useAuthGuard();

  const [form, setForm] = useState({
    strategyName: "",
    strategyType: "PromptBasedStrategy",
    provider: "deepseek",
    modelId: "deepseek-v4-pro",
    apiKey: "",
    exchangeId: "binance",
    exchangeApiKey: "",
    exchangeSecretKey: "",
    accountId: "",
    gatewayUrl: "",
    tradingMode: "virtual",
    marketType: "swap",
    marginMode: "cross",
    initialCapital: 10000,
    maxLeverage: 5,
    maxPositions: 2,
    decideInterval: 1,
    decideIntervalUnit: "min",
    promptText: "",
    templateId: "",
  });

  // Symbol list (the tag input editor is the shared SymbolTagInput component).
  const [symbols, setSymbols] = useState<string[]>(["BTC-USDT"]);

  // Candle config state
  const [candleConfigs, setCandleConfigs] = useState<CandleConfig[]>(DEFAULT_CANDLE_CONFIGS);

  // Balance fetch state (live mode)
  const [balanceFetched, setBalanceFetched] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  // Backtest panel
  const [showBacktest, setShowBacktest] = useState(false);

  // Binance API-key onboarding wizard (guided create + verify)
  const [showBinanceWizard, setShowBinanceWizard] = useState(false);

  // Model discovery: pull the provider's available models (server caches 24h, re-pulls
  // on select after that). Falls back to the hardcoded presets while loading / on error.
  const { data: fetchedModels } = useProviderModels(form.provider);
  const modelOptions =
    fetchedModels && fetchedModels.length > 0
      ? fetchedModels
      : MODEL_PRESETS[form.provider] ?? [];
  // Tracks whether the user has picked a model since the last provider change, so the
  // fetched list can set a sensible default without clobbering a deliberate choice.
  const modelEditedRef = useRef(false);

  // When the fetched model list for the current provider arrives, default to its first
  // model — unless the user already chose one, or the current value is already valid.
  useEffect(() => {
    if (
      !modelEditedRef.current &&
      fetchedModels &&
      fetchedModels.length > 0 &&
      !fetchedModels.includes(form.modelId)
    ) {
      setForm((prev) => ({ ...prev, modelId: fetchedModels[0] }));
    }
  }, [fetchedModels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the balance-fetch UI state when leaving live mode. Capital resets are owned
  // by handleExchangeChange (broker switch) and the Trading Mode toggle below — not here
  // — so a value the user typed for an equity strategy survives a broker switch.
  useEffect(() => {
    if (form.tradingMode !== "live") {
      setBalanceFetched(false);
      setBalanceError("");
    }
  }, [form.tradingMode]);

  // Candle helpers
  const updateCandle = (index: number, field: keyof CandleConfig, value: string | number) =>
    setCandleConfigs((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));

  const addCandle = () =>
    setCandleConfigs((prev) => [...prev, { interval: "1h", limit: 100 }]);

  const removeCandle = (index: number) =>
    setCandleConfigs((prev) => prev.filter((_, i) => i !== index));

  // Balance fetch
  const handleFetchBalance = async () => {
    setBalanceError("");
    try {
      const result = await fetchBalanceMutation.mutateAsync({
        exchange_id: form.exchangeId,
        api_key: form.exchangeApiKey,
        secret_key: form.exchangeSecretKey,
        market_type: form.marketType,
      });
      const capital = result?.totalBalance ?? result?.freeBalance ?? 0;
      setForm((prev) => ({ ...prev, initialCapital: capital }));
      setBalanceFetched(true);
    } catch (err) {
      setBalanceError("Failed to fetch balance: " + (err as Error).message);
      setBalanceFetched(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (symbols.length === 0) {
      alert("Please add at least one symbol.");
      return;
    }
    if (isAlpaca && (!form.exchangeApiKey || !form.exchangeSecretKey)) {
      alert("Please enter your Alpaca API key and secret.");
      return;
    }
    if (isIBKR && !form.accountId) {
      alert("Please enter your IBKR account ID.");
      return;
    }

    withAuth(() => doCreate());
  };

  const handleBacktestFirst = (e: React.MouseEvent) => {
    e.preventDefault();
    if (symbols.length === 0) {
      alert("Please add at least one symbol.");
      return;
    }
    setShowBacktest(true);
  };

  const doCreate = async (opts?: { tradingMode?: string; promptText?: string }) => {
    const input: CreateStrategyInput = {
      llm_model_config: {
        provider: form.provider,
        model_id: form.modelId,
        api_key: form.apiKey || undefined,
      },
      exchange_config: {
        exchange_id: form.exchangeId || undefined,
        // The user supplies each broker's own credentials: live crypto + Alpaca use an
        // API key + secret; IBKR uses an account id (+ optional gateway url).
        api_key: needsKeySecret ? form.exchangeApiKey || undefined : undefined,
        secret_key: needsKeySecret ? form.exchangeSecretKey || undefined : undefined,
        account_id: isIBKR ? form.accountId || undefined : undefined,
        gateway_url: isIBKR ? form.gatewayUrl || undefined : undefined,
        base_currency: isEquity ? "USD" : undefined,
        // Equities are always live (real broker API to a paper account by default);
        // Hyperliquid likewise (its testnet is the paper path, so a "virtual"
        // Binance-data strategy makes no sense for perp names).
        trading_mode: isEquity || isHyperliquid ? "live" : opts?.tradingMode ?? form.tradingMode,
        // Crypto-perp-only knobs — omitted for equities.
        market_type: isCrypto ? form.marketType : undefined,
        margin_mode: isCrypto ? form.marginMode : undefined,
      },
      trading_config: {
        strategy_name: form.strategyName,
        strategy_type: form.strategyType,
        initial_capital: form.initialCapital,
        max_leverage: isEquity ? 1 : form.maxLeverage,
        max_positions: form.maxPositions,
        decide_interval: decideSeconds,
        symbols: symbols,
        candle_configs: candleConfigs,
        prompt_text: (opts?.promptText ?? form.promptText) || undefined,
        template_id: form.templateId || undefined,
        // Explicit asset class chosen for this strategy. The backend materializes the
        // typed instrument universe from it at creation (persisting structured
        // instruments) instead of inferring it from the exchange at runtime.
        asset_class: assetClass,
      },
    };

    try {
      const result = await createMutation.mutateAsync(input);
      navigate(`/strategy/${result.strategyId}`);
    } catch (err) {
      alert("Failed to create strategy: " + (err as Error).message);
    }
  };

  // (handleSubmit is defined above)

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Broker → asset class. Crypto keeps the virtual/live toggle; equity brokers always
  // run "live" (real broker API to a paper account by default) and have no crypto
  // market/margin fields. Each broker's credentials are entered by the user here:
  // Alpaca uses an API key + secret; IBKR uses an account id (+ gateway url).
  const assetClass = assetClassOf(form.exchangeId);
  const isEquity = assetClass === "equity";
  const isCrypto = !isEquity;
  const isAlpaca = form.exchangeId === "alpaca";
  const isIBKR = form.exchangeId === "ibkr";
  const isHyperliquid = form.exchangeId === "hyperliquid";
  const isLive = form.tradingMode === "live";
  const isCryptoLive = isCrypto && isLive; // live crypto needs key/secret + balance fetch
  // Brokers that take an API key + secret in this form. Hyperliquid is excluded:
  // its credential (a private key) comes from the server environment.
  const needsKeySecret = (isCryptoLive && !isHyperliquid) || isAlpaca;
  const popularSymbols = isEquity
    ? POPULAR_SYMBOLS_EQUITY
    : isHyperliquid
    ? POPULAR_SYMBOLS_HYPERLIQUID
    : POPULAR_SYMBOLS_CRYPTO;
  const decideSeconds =
    form.decideInterval * (INTERVAL_UNITS[form.decideIntervalUnit]?.seconds ?? 1);

  const handleExchangeChange = (id: string) => {
    const nextAsset = assetClassOf(id);
    const prevAsset = assetClassOf(form.exchangeId);
    setForm((prev) => ({
      ...prev,
      exchangeId: id,
      // Equity brokers are live-only (paper account by default); Hyperliquid is
      // live-only too (its testnet is the paper path); other crypto defaults to virtual.
      tradingMode: nextAsset === "equity" || id === "hyperliquid" ? "live" : "virtual",
      // Different broker = different credentials — never carry one broker's keys to another.
      exchangeApiKey: "",
      exchangeSecretKey: "",
      accountId: "",
      gatewayUrl: "",
      // Don't carry a Binance-fetched balance into a manual-capital equity form.
      initialCapital: nextAsset === "equity" ? 10000 : prev.initialCapital,
    }));
    setBalanceFetched(false);
    setBalanceError("");
    // The backtest panel runs on Binance crypto paper data — close it if it was open
    // when moving to an equity broker (its symbols/config no longer apply).
    if (nextAsset === "equity") setShowBacktest(false);
    // BTC-USDT and AAPL aren't interchangeable — reset presets when the asset class flips.
    if (nextAsset !== prevAsset) {
      setSymbols(nextAsset === "equity" ? ["AAPL"] : ["BTC-USDT"]);
    }
  };

  // Asset class is the explicit, primary choice. Each class maps to a sensible default
  // broker (crypto→Binance, equity→Alpaca — the working brokers, not the dormant IBKR
  // skeleton); picking a class switches the exchange to that default so the
  // exchange/asset pairing can never become inconsistent. When brokers grow to span
  // multiple classes this can filter the broker list instead.
  const handleAssetClassChange = (next: AssetClass) => {
    if (next === assetClassOf(form.exchangeId)) return;
    const preferred: Record<AssetClass, string> = {
      crypto: "binance",
      equity: "alpaca",
    };
    const target =
      BROKERS.find((b) => b.id === preferred[next]) ??
      BROKERS.find((b) => b.asset === next);
    if (target) handleExchangeChange(target.id);
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-6">Create Strategy</h2>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Strategy Config */}
        <Section title="Strategy">
          <Field label="Name">
            <input
              value={form.strategyName}
              onChange={(e) => update("strategyName", e.target.value)}
              required
              placeholder="My Strategy"
            />
          </Field>
          <Field label="Type">
            <select
              value={form.strategyType}
              onChange={(e) => update("strategyType", e.target.value)}
            >
              <option value="PromptBasedStrategy">Prompt-Based</option>
              <option value="GridStrategy">Grid</option>
            </select>
          </Field>

          {/* Symbol tag input (shared editor — also used by the replicate modal) */}
          <div>
            <span className="text-sm text-gray-400 mb-2 block">Symbols</span>
            <SymbolTagInput
              symbols={symbols}
              onChange={setSymbols}
              exchangeId={form.exchangeId}
              assetClass={assetClass}
              marketType={form.marketType}
              popularSymbols={popularSymbols}
            />
          </div>
        </Section>

        {/* LLM Config */}
        <Section title="LLM Model">
          <Field label="Provider">
            <select
              value={form.provider}
              onChange={(e) => {
                const prov = e.target.value;
                // New provider → the fetched-model default can take over again.
                modelEditedRef.current = false;
                update("provider", prov);
                const defaults = MODEL_PRESETS[prov];
                if (defaults?.[0]) update("modelId", defaults[0]);
              }}
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <input
              list="model-presets"
              value={form.modelId}
              onChange={(e) => {
                modelEditedRef.current = true;
                update("modelId", e.target.value);
              }}
              required
              placeholder="deepseek-v4-pro"
            />
            <datalist id="model-presets">
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="API Key">
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="sk-..."
            />
          </Field>
        </Section>

        {/* Exchange / Broker Config */}
        <Section title="Broker / Exchange">
          <Field label="Asset Class">
            <select
              value={assetClass}
              onChange={(e) =>
                handleAssetClassChange(e.target.value as AssetClass)
              }
            >
              <option value="crypto">Crypto</option>
              <option value="equity">Equity (US)</option>
            </select>
          </Field>

          <Field label="Broker">
            <select
              value={form.exchangeId}
              onChange={(e) => handleExchangeChange(e.target.value)}
            >
              {Array.from(new Set(BROKERS.map((b) => b.group))).map((group) => (
                <optgroup key={group} label={group}>
                  {BROKERS.filter((b) => b.group === group).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          {form.exchangeId === "binance" && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => withAuth(() => setShowBinanceWizard(true))}
                className="text-sm px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-blue-400 hover:bg-gray-700 hover:text-blue-300 transition-colors"
              >
                ⚡ Set up Binance API key — guided
              </button>
              <p className="text-xs text-gray-500">
                New to Binance or API keys? The wizard walks you through account creation, key
                setup with IP whitelisting, and verifies the key before you use it.
              </p>
            </div>
          )}

          {isCrypto && !isHyperliquid && (
            <Field label="Trading Mode">
              <select
                value={form.tradingMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  update("tradingMode", mode);
                  // Leaving live clears the exchange-fetched balance back to the manual default.
                  if (mode !== "live") update("initialCapital", 10000);
                }}
              >
                <option value="virtual">Virtual (Paper)</option>
                <option value="live">Live</option>
              </select>
            </Field>
          )}

          {isHyperliquid && (
            <div className="text-xs text-gray-400 bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-1.5">
              <p>
                Runs{" "}
                <span className="text-gray-200 font-medium">live against the Hyperliquid testnet</span>{" "}
                by default (the paper path) — mainnet only when the server disables paper-only mode.
              </p>
              <p>
                Perps only, margined in USDC. Tickers are the native perp names (BTC, ETH, SOL) —
                use the search, no "-USDT" suffix. Credentials come from the server environment,
                not this form.
              </p>
            </div>
          )}

          {isEquity && (
            <>
              <div className="text-xs text-gray-400 bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-1.5">
                <p>
                  Runs{" "}
                  <span className="text-gray-200 font-medium">
                    live against your broker's paper account
                  </span>{" "}
                  by default — real market data, simulated fills. Equities have no separate
                  "virtual" mode.
                </p>
                <p>Enter your own broker credentials below — they are used only for this strategy.</p>
                <p className="text-gray-500">
                  {isIBKR
                    ? "US tickers plain (AAPL, MSFT); non-US with an exchange suffix: 1211.HK (Hong Kong), 8058.TSEJ (Tokyo), 005930.KR (Seoul), HSBA.L (London), BMW.DE (Xetra), RY.TO (Toronto), BHP.AU (Sydney), D05.SG (Singapore). Local market hours apply."
                    : "Use plain tickers (e.g. AAPL, MSFT). US market hours apply."}
                </p>
              </div>

              {isAlpaca && (
                <>
                  <Field label="Alpaca API Key">
                    <input
                      type="password"
                      value={form.exchangeApiKey}
                      onChange={(e) => update("exchangeApiKey", e.target.value)}
                      placeholder="PK… (paper) or AK… (live)"
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Alpaca Secret Key">
                    <input
                      type="password"
                      value={form.exchangeSecretKey}
                      onChange={(e) => update("exchangeSecretKey", e.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                </>
              )}

              {isIBKR && (
                <>
                  <Field label="IBKR Account ID">
                    <input
                      value={form.accountId}
                      onChange={(e) => update("accountId", e.target.value)}
                      placeholder="DU1234567 (paper) or U1234567 (live)"
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="IBKR Gateway URL (optional)">
                    <input
                      value={form.gatewayUrl}
                      onChange={(e) => update("gatewayUrl", e.target.value)}
                      placeholder="tws://host:4002 — blank = managed gateway"
                      autoComplete="off"
                    />
                  </Field>
                  <p className="text-xs text-gray-500 -mt-2">
                    IBKR authenticates through a gateway session, not an API key. Leave the
                    gateway URL blank to route through the managed paper gateway.
                  </p>
                </>
              )}
            </>
          )}

          {isCryptoLive && (
            <>
              {!isHyperliquid && (
                <>
                  <Field label="API Key">
                    <input
                      type="password"
                      value={form.exchangeApiKey}
                      onChange={(e) => {
                        update("exchangeApiKey", e.target.value);
                        setBalanceFetched(false);
                      }}
                    />
                  </Field>
                  <Field label="Secret Key">
                    <input
                      type="password"
                      value={form.exchangeSecretKey}
                      onChange={(e) => {
                        update("exchangeSecretKey", e.target.value);
                        setBalanceFetched(false);
                      }}
                    />
                  </Field>
                  <Field label="Market Type">
                    <select
                      value={form.marketType}
                      onChange={(e) => update("marketType", e.target.value)}
                    >
                      <option value="swap">Futures (Perpetual)</option>
                      <option value="spot">Spot</option>
                    </select>
                  </Field>
                  <Field label="Margin Mode">
                    <select
                      value={form.marginMode}
                      onChange={(e) => update("marginMode", e.target.value)}
                    >
                      <option value="cross">Cross</option>
                      <option value="isolated">Isolated</option>
                    </select>
                  </Field>
                </>
              )}

              {/* Balance fetch */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={handleFetchBalance}
                  disabled={
                    (!isHyperliquid && (!form.exchangeApiKey || !form.exchangeSecretKey)) ||
                    fetchBalanceMutation.isPending
                  }
                  className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {fetchBalanceMutation.isPending
                    ? "Fetching…"
                    : balanceFetched
                    ? "✓ Balance fetched"
                    : "Fetch Balance"}
                </button>
                {balanceError && (
                  <p className="text-xs text-red-400">{balanceError}</p>
                )}
              </div>
            </>
          )}
        </Section>

        {/* Trading Parameters */}
        <Section title="Trading Parameters">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label={
                isCryptoLive
                  ? "Initial Capital (from exchange)"
                  : isEquity
                  ? "Initial Capital (USD)"
                  : "Initial Capital (USDT)"
              }
            >
              <input
                type="number"
                value={form.initialCapital}
                onChange={(e) => {
                  if (!isCryptoLive) update("initialCapital", Number(e.target.value));
                }}
                readOnly={isCryptoLive}
                required
                min={1}
                className={isCryptoLive ? "opacity-60 cursor-not-allowed" : ""}
              />
            </Field>
            {isCrypto && (
              <Field label="Max Leverage">
                <input
                  type="number"
                  value={form.maxLeverage}
                  onChange={(e) => update("maxLeverage", Number(e.target.value))}
                  min={1}
                  max={125}
                />
              </Field>
            )}
            <Field label="Max Positions">
              <input
                type="number"
                value={form.maxPositions}
                onChange={(e) => update("maxPositions", Number(e.target.value))}
                min={1}
              />
            </Field>
            <Field label="Decision Interval">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={form.decideInterval}
                  onChange={(e) => update("decideInterval", Number(e.target.value))}
                  min={form.decideIntervalUnit === "sec" ? 10 : 1}
                  className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
                />
                <select
                  value={form.decideIntervalUnit}
                  onChange={(e) => update("decideIntervalUnit", e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm outline-none focus:border-blue-500"
                >
                  {Object.entries(INTERVAL_UNITS).map(([k, u]) => (
                    <option key={k} value={k}>{u.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                = {decideSeconds.toLocaleString()}s per decision cycle
              </p>
            </Field>
          </div>
          {isCryptoLive && !balanceFetched && (
            <p className="text-xs text-yellow-500">
              ↑ Click "Fetch Balance" in the Broker section to sync your initial capital from the exchange.
            </p>
          )}
        </Section>

        {/* Market Data */}
        <Section title="Market Data">
          <p className="text-xs text-gray-500 -mt-2">
            Candles fetched each cycle and used to compute EMA, RSI, Bollinger Bands, and ATR for the LLM prompt.
          </p>
          <div className="space-y-2">
            {candleConfigs.map((cfg, i) => (
              <div key={i} className="flex items-center gap-3">
                <select
                  value={cfg.interval}
                  onChange={(e) => updateCandle(i, "interval", e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500 w-28"
                >
                  {INTERVAL_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={cfg.limit}
                  min={1}
                  max={1500}
                  onChange={(e) => updateCandle(i, "limit", Number(e.target.value))}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500 w-28"
                />
                <span className="text-gray-500 text-sm">candles</span>
                <button
                  type="button"
                  onClick={() => removeCandle(i)}
                  disabled={candleConfigs.length <= 1}
                  className="text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed ml-auto text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addCandle}
            disabled={candleConfigs.length >= 6}
            className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add timeframe
          </button>
        </Section>

        {/* Strategy Prompt */}
        <Section title="Strategy Prompt">
          {prompts && prompts.length > 0 && (
            <Field label="Template">
              <select
                value={form.templateId}
                onChange={(e) => {
                  update("templateId", e.target.value);
                  const p = prompts.find((p) => p.id === e.target.value);
                  if (p) update("promptText", p.content);
                }}
              >
                <option value="">Custom prompt...</option>
                {prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Prompt">
            <textarea
              value={form.promptText}
              onChange={(e) => update("promptText", e.target.value)}
              rows={6}
              placeholder="Describe your trading strategy..."
              className="!h-auto"
            />
          </Field>
        </Section>

        <div className="flex gap-3">
          {isCrypto && !isHyperliquid && (
            <button
              type="button"
              onClick={handleBacktestFirst}
              disabled={symbols.length === 0}
              className="flex-1 py-3 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              Backtest First
            </button>
          )}
          <button
            type="submit"
            disabled={createMutation.isPending || symbols.length === 0}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {createMutation.isPending ? "Creating..." : "Launch →"}
          </button>
        </div>
      </form>

      {/* Standalone backtest panel — shown after clicking "Backtest First" */}
      {showBacktest && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold text-white">Backtest</h3>
            <button
              onClick={() => setShowBacktest(false)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              ✕ Close
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-0">
            Testing: <span className="text-gray-400">{symbols.join(", ")}</span>
            {" · "}{form.provider}/{form.modelId}
            {" · "}{form.initialCapital.toLocaleString()} USDT capital
          </p>
          <StandaloneBacktestPanel
            config={{
              promptText: form.promptText,
              symbols,
              initialCapital: form.initialCapital,
              maxLeverage: form.maxLeverage,
              maxPositions: form.maxPositions,
              llmProvider: form.provider,
              llmModelId: form.modelId,
              llmApiKey: form.apiKey || undefined,
            }}
            onLaunchPaper={(promptText) =>
              withAuth(() => doCreate({ tradingMode: "virtual", promptText }))
            }
            onLaunchLive={(promptText) =>
              withAuth(() => doCreate({ tradingMode: "live", promptText }))
            }
          />
        </div>
      )}

      {showBinanceWizard && (
        <BinanceOnboardingWizard
          marketType={form.marketType}
          onCancel={() => setShowBinanceWizard(false)}
          onComplete={({ apiKey, secretKey }) => {
            // A verified key exists to trade live: fill the credential fields
            // and flip to live mode so they're visible and submitted.
            setForm((prev) => ({
              ...prev,
              tradingMode: "live",
              exchangeApiKey: apiKey,
              exchangeSecretKey: secretKey,
            }));
            setBalanceFetched(false);
            setBalanceError("");
            setShowBinanceWizard(false);
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400 mb-1 block">{label}</span>
      <div className="[&>input]:w-full [&>input]:bg-gray-800 [&>input]:border [&>input]:border-gray-700 [&>input]:rounded-lg [&>input]:px-3 [&>input]:py-2 [&>input]:text-white [&>input]:text-sm [&>input]:outline-none [&>input]:focus:border-blue-500 [&>select]:w-full [&>select]:bg-gray-800 [&>select]:border [&>select]:border-gray-700 [&>select]:rounded-lg [&>select]:px-3 [&>select]:py-2 [&>select]:text-white [&>select]:text-sm [&>select]:outline-none [&>select]:focus:border-blue-500 [&>textarea]:w-full [&>textarea]:bg-gray-800 [&>textarea]:border [&>textarea]:border-gray-700 [&>textarea]:rounded-lg [&>textarea]:px-3 [&>textarea]:py-2 [&>textarea]:text-white [&>textarea]:text-sm [&>textarea]:outline-none [&>textarea]:focus:border-blue-500 [&>textarea]:resize-vertical">
        {children}
      </div>
    </label>
  );
}

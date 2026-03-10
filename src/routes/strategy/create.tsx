import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateStrategy, usePrompts, useFetchBalance } from "@/api/strategies";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import type { CandleConfig, CreateStrategyInput } from "@/types/strategy";

const DEFAULT_CANDLE_CONFIGS: CandleConfig[] = [
  { interval: "1h", limit: 168 },
  { interval: "4h", limit: 120 },
  { interval: "1d", limit: 60 },
];

const INTERVAL_OPTIONS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w"];

const POPULAR_SYMBOLS = [
  "BTC-USDT", "ETH-USDT", "SOL-USDT", "BNB-USDT",
  "XRP-USDT", "DOGE-USDT", "ADA-USDT", "AVAX-USDT",
];

const MODEL_PRESETS: Record<string, string[]> = {
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1-mini"],
  openrouter: [
    "deepseek/deepseek-r1",
    "meta-llama/llama-3.3-70b-instruct",
    "anthropic/claude-3-5-sonnet",
    "google/gemini-2.0-flash-001",
  ],
  google: ["gemini-2.0-flash-001", "gemini-2.0-flash-thinking-exp", "gemini-1.5-pro"],
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
    modelId: "deepseek-chat",
    apiKey: "",
    exchangeId: "binance",
    exchangeApiKey: "",
    exchangeSecretKey: "",
    tradingMode: "virtual",
    marketType: "swap",
    marginMode: "cross",
    initialCapital: 10000,
    maxLeverage: 5,
    maxPositions: 2,
    decideInterval: 60,
    promptText: "",
    templateId: "",
  });

  // Symbol tag state
  const [symbols, setSymbols] = useState<string[]>(["BTC-USDT"]);
  const [symbolInput, setSymbolInput] = useState("");
  const symbolInputRef = useRef<HTMLInputElement>(null);

  // Candle config state
  const [candleConfigs, setCandleConfigs] = useState<CandleConfig[]>(DEFAULT_CANDLE_CONFIGS);

  // Balance fetch state (live mode)
  const [balanceFetched, setBalanceFetched] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  // Reset balance state when switching away from live mode
  useEffect(() => {
    if (form.tradingMode !== "live") {
      setBalanceFetched(false);
      setBalanceError("");
      setForm((prev) => ({ ...prev, initialCapital: 10000 }));
    }
  }, [form.tradingMode]);

  // Symbol helpers
  const addSymbol = (sym: string) => {
    const s = sym.trim().toUpperCase().replace(/\s/g, "");
    if (s && !symbols.includes(s)) {
      setSymbols((prev) => [...prev, s]);
    }
    setSymbolInput("");
  };

  const removeSymbol = (sym: string) =>
    setSymbols((prev) => prev.filter((s) => s !== sym));

  const togglePopularSymbol = (sym: string) => {
    if (symbols.includes(sym)) {
      removeSymbol(sym);
    } else {
      setSymbols((prev) => [...prev, sym]);
    }
  };

  const handleSymbolKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSymbol(symbolInput);
    } else if (e.key === "Backspace" && symbolInput === "" && symbols.length > 0) {
      setSymbols((prev) => prev.slice(0, -1));
    }
  };

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

    withAuth(() => doCreate());
  };

  const doCreate = async () => {
    const input: CreateStrategyInput = {
      llm_model_config: {
        provider: form.provider,
        model_id: form.modelId,
        api_key: form.apiKey || undefined,
      },
      exchange_config: {
        exchange_id: form.exchangeId || undefined,
        api_key: form.exchangeApiKey || undefined,
        secret_key: form.exchangeSecretKey || undefined,
        trading_mode: form.tradingMode,
        market_type: form.marketType,
        margin_mode: form.marginMode,
      },
      trading_config: {
        strategy_name: form.strategyName,
        strategy_type: form.strategyType,
        initial_capital: form.initialCapital,
        max_leverage: form.maxLeverage,
        max_positions: form.maxPositions,
        decide_interval: form.decideInterval,
        symbols: symbols,
        candle_configs: candleConfigs,
        prompt_text: form.promptText || undefined,
        template_id: form.templateId || undefined,
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

  const isLive = form.tradingMode === "live";

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

          {/* Symbol tag input */}
          <div>
            <span className="text-sm text-gray-400 mb-2 block">Symbols</span>
            {/* Popular presets */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              {POPULAR_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => togglePopularSymbol(sym)}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    symbols.includes(sym)
                      ? "border-blue-500 bg-blue-500/20 text-blue-300"
                      : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
            {/* Tag input */}
            <div
              className="min-h-[42px] bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 flex flex-wrap gap-1.5 items-center cursor-text focus-within:border-blue-500 transition-colors"
              onClick={() => symbolInputRef.current?.focus()}
            >
              {symbols.map((sym) => (
                <span
                  key={sym}
                  className="flex items-center gap-1 bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded-full"
                >
                  {sym}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeSymbol(sym); }}
                    className="hover:text-white leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                ref={symbolInputRef}
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyDown={handleSymbolKeyDown}
                onBlur={() => { if (symbolInput.trim()) addSymbol(symbolInput); }}
                placeholder={symbols.length === 0 ? "Type symbol + Enter…" : ""}
                className="bg-transparent outline-none text-white text-sm flex-1 min-w-[120px] placeholder-gray-600"
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">Click presets or type and press Enter / comma</p>
          </div>
        </Section>

        {/* LLM Config */}
        <Section title="LLM Model">
          <Field label="Provider">
            <select
              value={form.provider}
              onChange={(e) => {
                const prov = e.target.value;
                update("provider", prov);
                const defaults = MODEL_PRESETS[prov];
                if (defaults?.[0]) update("modelId", defaults[0]);
              }}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
            </select>
          </Field>
          <Field label="Model">
            <input
              list="model-presets"
              value={form.modelId}
              onChange={(e) => update("modelId", e.target.value)}
              required
              placeholder="deepseek-chat"
            />
            <datalist id="model-presets">
              {(MODEL_PRESETS[form.provider] ?? []).map((m) => (
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

        {/* Exchange Config */}
        <Section title="Exchange">
          <Field label="Trading Mode">
            <select
              value={form.tradingMode}
              onChange={(e) => update("tradingMode", e.target.value)}
            >
              <option value="virtual">Virtual (Paper)</option>
              <option value="live">Live</option>
            </select>
          </Field>
          {isLive && (
            <>
              <Field label="Exchange">
                <select
                  value={form.exchangeId}
                  onChange={(e) => update("exchangeId", e.target.value)}
                >
                  <option value="binance">Binance</option>
                </select>
              </Field>
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

              {/* Balance fetch */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={handleFetchBalance}
                  disabled={
                    !form.exchangeApiKey ||
                    !form.exchangeSecretKey ||
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
            <Field label={isLive ? "Initial Capital (from exchange)" : "Initial Capital (USDT)"}>
              <input
                type="number"
                value={form.initialCapital}
                onChange={(e) => {
                  if (!isLive) update("initialCapital", Number(e.target.value));
                }}
                readOnly={isLive}
                required
                min={1}
                className={isLive ? "opacity-60 cursor-not-allowed" : ""}
              />
            </Field>
            <Field label="Max Leverage">
              <input
                type="number"
                value={form.maxLeverage}
                onChange={(e) => update("maxLeverage", Number(e.target.value))}
                min={1}
                max={125}
              />
            </Field>
            <Field label="Max Positions">
              <input
                type="number"
                value={form.maxPositions}
                onChange={(e) => update("maxPositions", Number(e.target.value))}
                min={1}
              />
            </Field>
            <Field label="Decision Interval (sec)">
              <input
                type="number"
                value={form.decideInterval}
                onChange={(e) => update("decideInterval", Number(e.target.value))}
                min={10}
              />
            </Field>
          </div>
          {isLive && !balanceFetched && (
            <p className="text-xs text-yellow-500">
              ↑ Click "Fetch Balance" in the Exchange section to sync your initial capital from the exchange.
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

        <button
          type="submit"
          disabled={createMutation.isPending || symbols.length === 0}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {createMutation.isPending ? "Creating..." : "Create Strategy"}
        </button>
      </form>
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

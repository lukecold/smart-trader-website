import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  usePrompts,
  useProviderModels,
  useProviderServerKeyConfigured,
  useReplicateStrategy,
  useStrategyConfig,
} from "@/api/strategies";
import { LLM_PROVIDERS, MODEL_PRESETS } from "@/lib/models";
import {
  BROKERS,
  assetClassOf,
  brokerLabel,
  POPULAR_SYMBOLS_CRYPTO,
  POPULAR_SYMBOLS_EQUITY,
  POPULAR_SYMBOLS_HYPERLIQUID,
} from "@/lib/brokers";
import {
  SymbolTagInput,
  invalidSymbolReason,
} from "@/components/strategy/SymbolTagInput";
import type { CandleConfig } from "@/types/strategy";

// Fallback when the source config has no persisted candle configs (mirrors the
// create form's defaults).
const DEFAULT_CANDLE_CONFIGS: CandleConfig[] = [
  { interval: "1h", limit: 168 },
  { interval: "4h", limit: 120 },
  { interval: "1d", limit: 60 },
];
const INTERVAL_OPTIONS = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w"];

// Decision-interval unit → seconds (mirrors the create page / settings section).
const INTERVAL_UNITS: Record<string, { label: string; seconds: number }> = {
  sec: { label: "Seconds", seconds: 1 },
  min: { label: "Minutes", seconds: 60 },
  hour: { label: "Hours", seconds: 3600 },
  day: { label: "Days", seconds: 86400 },
};
const UNIT_ORDER = ["day", "hour", "min", "sec"];

// Largest whole unit that divides the interval evenly (600s → 10 min, 3600s → 1 hour).
function secondsToParts(sec: number): { value: number; unit: string } {
  for (const unit of UNIT_ORDER) {
    const s = INTERVAL_UNITS[unit].seconds;
    if (sec % s === 0) return { value: sec / s, unit };
  }
  return { value: sec, unit: "sec" };
}

const inputCls =
  "w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500";
const labelCls = "block text-xs text-gray-500 mb-1";

// ReplicateModal clones an owned strategy into a new one via POST
// /strategies/replicate. The backend carries over the full stored config (prompt,
// risk config, candle configs, symbols/instruments) and applies the overrides the
// dialog collects. Everything is prefilled from the source config (GET
// /strategies/config) and only fields the user actually changes are sent —
// empty/absent means "keep the source value". The default section covers the
// common knobs (broker, tickers, mode, capital, LLM); an Advanced expander holds
// candle configs, the numeric tuning knobs, the prompt override and the
// notification channel. The replica starts running immediately.
export function ReplicateModal({
  strategyId,
  strategyName,
  onClose,
}: {
  strategyId: string;
  strategyName: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: config, isLoading: configLoading } = useStrategyConfig(
    strategyId,
    true
  );
  const replicate = useReplicateStrategy();
  const { data: prompts } = usePrompts();

  const [name, setName] = useState(`${strategyName} (copy)`);
  const [provider, setProvider] = useState("deepseek");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [exchangeId, setExchangeId] = useState("binance");
  const [marketType, setMarketType] = useState("swap");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [symbolNote, setSymbolNote] = useState("");
  const [tradingMode, setTradingMode] = useState<"virtual" | "live">("virtual");
  const [initialCapital, setInitialCapital] = useState("10000");
  const [error, setError] = useState("");

  // Advanced options (collapsed by default).
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [candleConfigs, setCandleConfigs] = useState<CandleConfig[]>(DEFAULT_CANDLE_CONFIGS);
  const [candlesTouched, setCandlesTouched] = useState(false);
  const [maxLeverage, setMaxLeverage] = useState("5");
  const [maxPositions, setMaxPositions] = useState("2");
  const [capFactor, setCapFactor] = useState("0.95");
  const [decideNum, setDecideNum] = useState("5");
  const [decideUnit, setDecideUnit] = useState("min");
  const [templateId, setTemplateId] = useState("");
  const [promptText, setPromptText] = useState("");
  const [notifChannel, setNotifChannel] = useState("");
  const [notifWebhook, setNotifWebhook] = useState("");
  const [notifToken, setNotifToken] = useState("");
  const [notifTarget, setNotifTarget] = useState("");

  // Seed the form from the source strategy's config once it loads. Every default
  // is "identical twin" — switching things is the point of the dialog.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!config || seededRef.current) return;
    seededRef.current = true;
    if (config.modelProvider) setProvider(config.modelProvider);
    if (config.modelId) setModelId(config.modelId);
    if (config.exchangeId) setExchangeId(config.exchangeId);
    if (config.marketType) setMarketType(config.marketType);
    if (config.symbols) setSymbols(config.symbols);
    if (config.tradingMode === "live" || config.tradingMode === "virtual") {
      setTradingMode(config.tradingMode);
    }
    if (config.initialCapital != null && config.initialCapital > 0) {
      setInitialCapital(String(config.initialCapital));
    }
    if (config.candleConfigs && config.candleConfigs.length > 0) {
      setCandleConfigs(config.candleConfigs);
    }
    if (config.maxLeverage != null && config.maxLeverage > 0) {
      setMaxLeverage(String(config.maxLeverage));
    }
    if (config.maxPositions != null && config.maxPositions > 0) {
      setMaxPositions(String(config.maxPositions));
    }
    if (config.capFactor != null && config.capFactor > 0) {
      setCapFactor(String(config.capFactor));
    }
    const decideSec =
      config.decideIntervalSeconds != null && config.decideIntervalSeconds >= 60
        ? config.decideIntervalSeconds
        : 300;
    const parts = secondsToParts(decideSec);
    setDecideNum(String(parts.value));
    setDecideUnit(parts.unit);
    const notif = config.notification;
    setNotifChannel(notif?.channel ?? "");
    setNotifWebhook(notif?.webhookUrl ?? "");
    setNotifTarget(notif?.target ?? "");
  }, [config]);

  const { data: fetchedModels } = useProviderModels(provider);
  const { data: serverKeyConfigured } = useProviderServerKeyConfigured(provider);
  const modelOptions = useMemo(
    () =>
      fetchedModels && fetchedModels.length > 0
        ? fetchedModels
        : (MODEL_PRESETS[provider] ?? []),
    [fetchedModels, provider]
  );

  // Track manual model edits so a provider switch can auto-default the model
  // without clobbering a typed value (same pattern as the create form).
  const modelEditedRef = useRef(false);
  useEffect(() => {
    if (!modelEditedRef.current && modelOptions.length > 0 && !modelId) {
      setModelId(modelOptions[0]);
    }
  }, [modelOptions, modelId]);

  const assetClass = assetClassOf(exchangeId);
  const isCrypto = assetClass === "crypto";
  // Hyperliquid is live-only: its testnet is the paper path, and virtual mode
  // (Binance market data) cannot price native perp names.
  const isHyperliquid = exchangeId === "hyperliquid";
  const popularSymbols = isCrypto
    ? isHyperliquid
      ? POPULAR_SYMBOLS_HYPERLIQUID
      : POPULAR_SYMBOLS_CRYPTO
    : POPULAR_SYMBOLS_EQUITY;
  const exchangeChanged =
    config?.exchangeId != null && exchangeId !== config.exchangeId;

  // A broker switch re-validates the ticker set with the tag input's guards:
  // symbols the new broker cannot trade are removed and the removal is noted.
  function handleExchangeChange(id: string) {
    const nextAsset = assetClassOf(id);
    const prevAsset = assetClassOf(exchangeId);
    setExchangeId(id);
    // Mirror the create form: equity brokers and Hyperliquid are live-only; back
    // to (other) crypto defaults to virtual paper.
    if (nextAsset === "equity" || id === "hyperliquid") setTradingMode("live");
    else if (prevAsset === "equity" || exchangeId === "hyperliquid") setTradingMode("virtual");
    const kept = symbols.filter((s) => !invalidSymbolReason(s, nextAsset, id));
    const removed = symbols.length - kept.length;
    setSymbols(kept);
    setSymbolNote(
      removed > 0
        ? `Removed ${removed} ticker${removed > 1 ? "s" : ""} not tradable on ${brokerLabel(id)}.`
        : ""
    );
  }

  const providerChanged =
    config?.modelProvider != null && provider !== config.modelProvider;
  // A blank key only works when the server has one for the new provider —
  // otherwise the backend rejects the replicate call (no key to fall back to).
  const keyRequired = providerChanged && serverKeyConfigured === false;

  // --- Advanced-change detection (source snapshot = the loaded config) ---
  const sourceDecideSeconds =
    config?.decideIntervalSeconds != null && config.decideIntervalSeconds >= 60
      ? config.decideIntervalSeconds
      : 300;
  const decideSeconds =
    Number(decideNum) * (INTERVAL_UNITS[decideUnit]?.seconds ?? 60);
  const levNum = Number(maxLeverage);
  const posNum = Number(maxPositions);
  const capNum = Number(capFactor);
  const capitalNum = Number(initialCapital);

  const sourceSymbols = config?.symbols ?? null;
  const symbolsChanged =
    sourceSymbols != null &&
    JSON.stringify([...symbols].sort()) !== JSON.stringify([...sourceSymbols].sort());

  const notif = config?.notification ?? null;
  const notifChannelChanged = notifChannel !== (notif?.channel ?? "");
  const notifWebhookChanged =
    notifChannel === "discord" && notifWebhook.trim() !== (notif?.webhookUrl ?? "");
  const notifSlackChanged =
    notifChannel === "slack" &&
    (notifToken.trim() !== "" || notifTarget.trim() !== (notif?.target ?? ""));
  const notifChanged = notifChannelChanged || notifWebhookChanged || notifSlackChanged;

  // The replicate endpoint validates a Slack override as-is — unlike
  // update-config it does NOT backfill the stored bot token, so changing Slack
  // settings requires re-typing the token.
  let notifError = "";
  if (notifChanged) {
    if (notifChannel === "discord" && !notifWebhook.trim()) {
      notifError = "Discord webhook URL is required.";
    } else if (notifChannel === "slack") {
      if (!notifToken.trim()) {
        notifError = "Type the Slack bot token — it is not carried into the replica.";
      } else if (!notifTarget.trim()) {
        notifError = "Slack channel (target) is required.";
      }
    }
  }

  const candlesValid =
    candleConfigs.length >= 1 &&
    candleConfigs.every((c) => c.interval.trim() !== "" && c.limit >= 1);
  const advancedValid =
    (!isCrypto || (Number.isFinite(levNum) && levNum >= 1 && levNum <= 125)) &&
    Number.isFinite(posNum) &&
    posNum >= 1 &&
    Number.isFinite(capNum) &&
    capNum > 0 &&
    decideSeconds >= 60 &&
    decideSeconds <= 86400 &&
    candlesValid;

  // Labels of modified advanced groups, surfaced on the collapsed expander.
  const advancedChanges: string[] = [];
  if (candlesTouched) advancedChanges.push("candles");
  if (isCrypto && Number.isFinite(levNum) && levNum !== config?.maxLeverage)
    advancedChanges.push("leverage");
  if (Number.isFinite(posNum) && posNum !== config?.maxPositions)
    advancedChanges.push("positions");
  if (decideSeconds !== sourceDecideSeconds) advancedChanges.push("interval");
  if (Number.isFinite(capNum) && capNum !== config?.capFactor)
    advancedChanges.push("cap factor");
  if (promptText.trim() || templateId) advancedChanges.push("prompt");
  if (notifChanged) advancedChanges.push("notifications");

  const valid =
    name.trim() !== "" &&
    modelId.trim() !== "" &&
    (!keyRequired || apiKey.trim() !== "") &&
    symbols.length > 0 &&
    advancedValid &&
    notifError === "" &&
    (tradingMode === "live" ||
      !isCrypto ||
      (initialCapital.trim() !== "" && Number.isFinite(capitalNum) && capitalNum > 0));

  async function submit() {
    if (!valid || replicate.isPending) return;
    setError("");
    try {
      const result = await replicate.mutateAsync({
        id: strategyId,
        strategy_name: name.trim(),
        provider,
        model_id: modelId.trim(),
        api_key: apiKey.trim() || undefined,
        trading_mode: isCrypto && !isHyperliquid ? tradingMode : "live",
        initial_capital:
          isCrypto &&
          tradingMode === "virtual" &&
          Number.isFinite(capitalNum) &&
          capitalNum > 0
            ? capitalNum
            : undefined,
        // Changed-only overrides; absent = keep the source value.
        ...(exchangeChanged ? { exchange_id: exchangeId } : {}),
        ...(exchangeId === "binance" &&
        (marketType !== (config?.marketType ?? "swap") || exchangeChanged)
          ? { market_type: marketType }
          : {}),
        ...(symbolsChanged && symbols.length > 0 ? { symbols } : {}),
        ...(candlesTouched ? { candle_configs: candleConfigs } : {}),
        // Equity brokers run unleveraged (the create form sends max_leverage 1).
        ...(!isCrypto && exchangeChanged
          ? { max_leverage: 1 }
          : isCrypto && Number.isFinite(levNum) && levNum !== config?.maxLeverage
          ? { max_leverage: levNum }
          : {}),
        ...(Number.isFinite(posNum) && posNum !== config?.maxPositions
          ? { max_positions: posNum }
          : {}),
        ...(decideSeconds !== sourceDecideSeconds
          ? { decide_interval: decideSeconds }
          : {}),
        ...(Number.isFinite(capNum) && capNum !== config?.capFactor
          ? { cap_factor: capNum }
          : {}),
        ...(promptText.trim() ? { prompt_text: promptText.trim() } : {}),
        ...(templateId ? { template_id: templateId } : {}),
        ...(notifChanged
          ? {
              notification: {
                channel: notifChannel,
                webhook_url:
                  notifChannel === "discord" ? notifWebhook.trim() : undefined,
                api_key:
                  notifChannel === "slack" && notifToken.trim()
                    ? notifToken.trim()
                    : undefined,
                target: notifChannel === "slack" ? notifTarget.trim() : undefined,
              },
            }
          : {}),
      });
      if (result?.strategyId) {
        navigate(`/strategy/${result.strategyId}`);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Candle helpers (mirror the create form's editor).
  const updateCandle = (index: number, field: keyof CandleConfig, value: string | number) => {
    setCandlesTouched(true);
    setCandleConfigs((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };
  const addCandle = () => {
    setCandlesTouched(true);
    setCandleConfigs((prev) => [...prev, { interval: "1h", limit: 100 }]);
  };
  const removeCandle = (index: number) => {
    setCandlesTouched(true);
    setCandleConfigs((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-1">
          Replicate strategy
        </h3>
        <p className="text-sm text-gray-400 mb-4 truncate">
          {strategyName} — the replica keeps whatever you don&apos;t change and
          starts running immediately.
        </p>

        {configLoading ? (
          <div className="animate-pulse space-y-3 py-2">
            <div className="h-8 bg-gray-800 rounded" />
            <div className="h-8 bg-gray-800 rounded" />
            <div className="h-8 bg-gray-800 rounded" />
          </div>
        ) : (
          <>
            {/* Name */}
            <label className={labelCls}>New name</label>
            <input
              type="text"
              autoFocus
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
            />

            {/* Broker / exchange */}
            <div className="mt-4">
              <label className={labelCls}>Broker / exchange</label>
              <select
                value={exchangeId}
                onChange={(e) => handleExchangeChange(e.target.value)}
                className={inputCls}
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
                {/* A source broker the create form doesn't offer stays selectable
                    so the dialog can always show the source value. */}
                {config?.exchangeId &&
                  !BROKERS.some((b) => b.id === config.exchangeId) && (
                    <option value={config.exchangeId}>{config.exchangeId}</option>
                  )}
              </select>
              {exchangeChanged && (
                <p className="mt-1.5 text-xs text-gray-400 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2">
                  Credentials and routing for {brokerLabel(exchangeId)} are taken
                  from the server environment — the source broker&apos;s
                  credentials are not carried over.
                </p>
              )}
            </div>

            {/* Binance market type */}
            {exchangeId === "binance" && (
              <div className="mt-3">
                <label className={labelCls}>Market type</label>
                <select
                  value={marketType}
                  onChange={(e) => setMarketType(e.target.value)}
                  className={inputCls}
                >
                  <option value="swap">Futures (Perpetual)</option>
                  <option value="spot">Spot</option>
                </select>
              </div>
            )}

            {/* Tickers */}
            <div className="mt-4">
              <label className={labelCls}>Symbols</label>
              <SymbolTagInput
                symbols={symbols}
                onChange={(next) => {
                  setSymbols(next);
                  setSymbolNote("");
                }}
                exchangeId={exchangeId}
                assetClass={assetClass}
                marketType={marketType}
                popularSymbols={popularSymbols}
                tagBoxClassName="min-h-[42px] bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 flex flex-wrap gap-1.5 items-center cursor-text focus-within:border-blue-500 transition-colors"
              />
              {symbolNote && (
                <p className="mt-1 text-xs text-amber-400/90">{symbolNote}</p>
              )}
              {symbols.length === 0 && (
                <p className="mt-1 text-xs text-red-400">
                  Add at least one symbol — the source set can&apos;t be cleared.
                </p>
              )}
            </div>

            {/* Trading mode (crypto only — brokers run against their account;
                Hyperliquid is live-only: its testnet is the paper path) */}
            {isCrypto && !isHyperliquid && (
              <div className="mt-4">
                <label className={labelCls}>Trading mode</label>
                <div className="flex rounded-lg bg-gray-800/80 p-0.5 gap-0.5">
                  {(["virtual", "live"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTradingMode(m)}
                      className={
                        "flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors " +
                        (tradingMode === m
                          ? "bg-gray-600 text-white"
                          : "text-gray-400 hover:text-gray-200")
                      }
                    >
                      {m === "virtual" ? "Virtual (paper)" : "Live (real orders)"}
                    </button>
                  ))}
                </div>
                {tradingMode === "live" &&
                  config?.tradingMode !== "live" && (
                    <p className="mt-1.5 text-xs text-amber-400/90">
                      ⚠ A live replica places real orders and needs the
                      exchange&apos;s credentials configured server-side.
                    </p>
                  )}
              </div>
            )}

            {/* Initial capital (virtual only — live syncs from the exchange) */}
            {isCrypto && tradingMode === "virtual" && (
              <div className="mt-4">
                <label className={labelCls}>Initial capital (USD)</label>
                <input
                  type="number"
                  min={0}
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}

            {/* LLM provider / model */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>LLM provider</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    const prov = e.target.value;
                    modelEditedRef.current = false;
                    setProvider(prov);
                    setModelId("");
                    const defaults = MODEL_PRESETS[prov];
                    if (defaults?.[0]) setModelId(defaults[0]);
                  }}
                  className={inputCls}
                >
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Model</label>
                <input
                  list="replicate-model-presets"
                  value={modelId}
                  onChange={(e) => {
                    modelEditedRef.current = true;
                    setModelId(e.target.value);
                  }}
                  placeholder="model id"
                  className={inputCls}
                />
                <datalist id="replicate-model-presets">
                  {modelOptions.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* LLM API key — only meaningful when the provider changed; required
                unless the server has a key configured for the new provider */}
            {providerChanged && (
              <div className="mt-3">
                <label className={labelCls}>
                  {LLM_PROVIDERS.find((p) => p.value === provider)?.label} API key
                  {serverKeyConfigured ? " (optional)" : ""}
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    serverKeyConfigured === false
                      ? "Required — no server-configured key for this provider"
                      : "Leave blank to use the server-configured key"
                  }
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-600">
                  The source strategy&apos;s key belongs to the old provider and
                  is not carried over.
                </p>
                {serverKeyConfigured === false && (
                  <p className="mt-1 text-xs text-amber-400/90">
                    The server has no{" "}
                    {LLM_PROVIDERS.find((p) => p.value === provider)?.label} key
                    configured, so a key is required here.
                  </p>
                )}
              </div>
            )}

            {/* Advanced options */}
            <div className="mt-5 border-t border-gray-800 pt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
              >
                <span>
                  {showAdvanced ? "▾" : "▸"} Advanced options
                  {!showAdvanced && advancedChanges.length > 0 && (
                    <span className="ml-2 text-blue-400">
                      {advancedChanges.length} modified
                    </span>
                  )}
                  {!showAdvanced && !advancedValid && (
                    <span className="ml-2 text-red-400">invalid — expand to fix</span>
                  )}
                </span>
                {!showAdvanced && advancedChanges.length > 0 && (
                  <span className="text-[10px] text-gray-600 truncate ml-2">
                    {advancedChanges.join(", ")}
                  </span>
                )}
              </button>

              {showAdvanced && (
                <div className="mt-3">
                  {/* Candle configs */}
                  <label className={labelCls}>Candle configs</label>
                  <div className="space-y-2">
                    {candleConfigs.map((cfg, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <select
                          value={cfg.interval}
                          onChange={(e) => updateCandle(i, "interval", e.target.value)}
                          className={`${inputCls} !w-24`}
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
                          className={`${inputCls} !w-24`}
                        />
                        <span className="text-gray-500 text-xs">candles</span>
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
                    className="mt-1.5 text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Add timeframe
                  </button>

                  {/* Numeric tuning knobs */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {isCrypto && (
                      <div>
                        <label className={labelCls}>Max leverage</label>
                        <input
                          type="number"
                          min={1}
                          max={125}
                          value={maxLeverage}
                          onChange={(e) => setMaxLeverage(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Max positions</label>
                      <input
                        type="number"
                        min={1}
                        value={maxPositions}
                        onChange={(e) => setMaxPositions(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Decision interval</label>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          min={decideUnit === "sec" ? 10 : 1}
                          value={decideNum}
                          onChange={(e) => setDecideNum(e.target.value)}
                          className={`${inputCls} flex-1 min-w-0`}
                        />
                        <select
                          value={decideUnit}
                          onChange={(e) => setDecideUnit(e.target.value)}
                          className={`${inputCls} !w-24`}
                        >
                          {Object.entries(INTERVAL_UNITS).map(([k, u]) => (
                            <option key={k} value={k}>{u.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Cap factor</label>
                      <input
                        type="number"
                        min={0}
                        step={0.05}
                        value={capFactor}
                        onChange={(e) => setCapFactor(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  {!advancedValid && (
                    <p className="mt-1.5 text-xs text-red-400">
                      Check the advanced numbers: leverage 1–125 (crypto), positions
                      ≥ 1, cap factor &gt; 0, interval 60s–1d, at least one candle
                      row with limit ≥ 1.
                    </p>
                  )}

                  {/* Prompt override */}
                  <div className="mt-4">
                    <label className={labelCls}>Strategy prompt</label>
                    {prompts && prompts.length > 0 && (
                      <select
                        value={templateId}
                        onChange={(e) => {
                          setTemplateId(e.target.value);
                          const p = prompts.find((p) => p.id === e.target.value);
                          if (p) setPromptText(p.content);
                        }}
                        className={`${inputCls} mb-2`}
                      >
                        <option value="">Custom prompt…</option>
                        {prompts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      rows={5}
                      placeholder="Leave blank to keep the source strategy's prompt"
                      className={`${inputCls} resize-vertical`}
                    />
                    <p className="mt-1 text-xs text-gray-600">
                      Blank keeps the source prompt; typing here replaces it.
                    </p>
                  </div>

                  {/* Notifications */}
                  <div className="mt-4">
                    <label className={labelCls}>Trade notifications</label>
                    <div className="flex flex-wrap items-start gap-2">
                      <select
                        value={notifChannel}
                        onChange={(e) => setNotifChannel(e.target.value)}
                        className={`${inputCls} !w-28`}
                      >
                        <option value="">Off</option>
                        <option value="discord">Discord</option>
                        <option value="slack">Slack</option>
                      </select>
                      {notifChannel === "discord" && (
                        <input
                          type="text"
                          autoComplete="off"
                          value={notifWebhook}
                          onChange={(e) => setNotifWebhook(e.target.value)}
                          placeholder="https://discord.com/api/webhooks/…"
                          className={`${inputCls} flex-1 min-w-48`}
                        />
                      )}
                      {notifChannel === "slack" && (
                        <>
                          <input
                            type="password"
                            autoComplete="off"
                            value={notifToken}
                            onChange={(e) => setNotifToken(e.target.value)}
                            placeholder={
                              notif?.apiKeyMasked
                                ? `${notif.apiKeyMasked} — type to replace`
                                : "Bot token (xoxb-…)"
                            }
                            className={`${inputCls} flex-1 min-w-36`}
                          />
                          <input
                            type="text"
                            autoComplete="off"
                            value={notifTarget}
                            onChange={(e) => setNotifTarget(e.target.value)}
                            placeholder="#channel"
                            className={`${inputCls} !w-28`}
                          />
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {notifChannel === "discord" &&
                        "Posts trade executions to this Discord channel webhook."}
                      {notifChannel === "slack" &&
                        "Posts trade executions via a Slack bot token (chat:write scope). The token is not carried into the replica — re-type it to change Slack settings."}
                      {notifChannel === "" &&
                        (notif?.channel
                          ? "Off clears the source strategy's notification channel in the replica."
                          : "The replica sends no trade notifications.")}
                    </p>
                    {notifError && (
                      <p className="mt-1 text-xs text-red-400">{notifError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={onClose}
                className="text-xs px-4 py-2 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!valid || replicate.isPending}
                className="text-xs px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {replicate.isPending ? "Creating…" : "Create replica"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

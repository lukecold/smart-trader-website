import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useProviderModels,
  useReplicateStrategy,
  useStrategyConfig,
} from "@/api/strategies";
import { LLM_PROVIDERS, MODEL_PRESETS } from "@/lib/models";

// Brokers whose "account" is the trading mode — they have no virtual toggle.
const BROKER_EXCHANGES = new Set(["ibkr", "alpaca", "tradestation", "schwab"]);

// ReplicateModal clones an owned strategy into a new one via POST
// /strategies/replicate. The backend carries over the full stored config (prompt,
// risk config, candle configs, symbols); this dialog collects the overrides —
// most importantly the LLM provider/model and the paper/live trading mode, so a
// live strategy can be re-run as a paper test on a different model (e.g. Kimi).
// The replica starts running immediately.
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

  const [name, setName] = useState(`${strategyName} (copy)`);
  const [provider, setProvider] = useState("deepseek");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [tradingMode, setTradingMode] = useState<"virtual" | "live">("virtual");
  const [initialCapital, setInitialCapital] = useState("10000");
  const [error, setError] = useState("");

  // Seed the form from the source strategy's config once it loads. The provider
  // select defaults to the source provider — switching to another provider is
  // the point of the dialog, but the default should be "identical twin".
  const seededRef = useRef(false);
  useEffect(() => {
    if (!config || seededRef.current) return;
    seededRef.current = true;
    if (config.modelProvider) setProvider(config.modelProvider);
    if (config.modelId) setModelId(config.modelId);
    if (config.tradingMode === "live" || config.tradingMode === "virtual") {
      setTradingMode(config.tradingMode);
    }
    if (config.initialCapital != null && config.initialCapital > 0) {
      setInitialCapital(String(config.initialCapital));
    }
  }, [config]);

  const { data: fetchedModels } = useProviderModels(provider);
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

  const providerChanged =
    config?.modelProvider != null && provider !== config.modelProvider;
  const isCrypto =
    !config?.exchangeId || !BROKER_EXCHANGES.has(config.exchangeId);

  const capitalNum = Number(initialCapital);
  const valid =
    name.trim() !== "" &&
    modelId.trim() !== "" &&
    (tradingMode === "live" ||
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
        trading_mode: tradingMode,
        initial_capital:
          tradingMode === "virtual" && Number.isFinite(capitalNum) && capitalNum > 0
            ? capitalNum
            : undefined,
      });
      if (result?.strategyId) {
        navigate(`/strategy/${result.strategyId}`);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

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
          {strategyName} — the replica keeps the same prompt, symbols, risk config
          and cadence, and starts running immediately.
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
            <label className="block text-xs text-gray-500 mb-1">New name</label>
            <input
              type="text"
              autoFocus
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
            />

            {/* LLM provider / model */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  LLM provider
                </label>
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
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
                >
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Model</label>
                <input
                  list="replicate-model-presets"
                  value={modelId}
                  onChange={(e) => {
                    modelEditedRef.current = true;
                    setModelId(e.target.value);
                  }}
                  placeholder="model id"
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
                />
                <datalist id="replicate-model-presets">
                  {modelOptions.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* LLM API key — only meaningful when the provider changed */}
            {providerChanged && (
              <div className="mt-3">
                <label className="block text-xs text-gray-500 mb-1">
                  {LLM_PROVIDERS.find((p) => p.value === provider)?.label} API key
                  (optional)
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Leave blank to use the server-configured key"
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-600">
                  The source strategy&apos;s key belongs to the old provider and
                  is not carried over.
                </p>
              </div>
            )}

            {/* Trading mode (crypto only — brokers run against their account) */}
            {isCrypto && (
              <div className="mt-4">
                <label className="block text-xs text-gray-500 mb-1">
                  Trading mode
                </label>
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
            {tradingMode === "virtual" && (
              <div className="mt-4">
                <label className="block text-xs text-gray-500 mb-1">
                  Initial capital (USD)
                </label>
                <input
                  type="number"
                  min={0}
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>
            )}

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

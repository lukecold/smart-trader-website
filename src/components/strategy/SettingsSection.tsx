import { useEffect, useState } from "react";
import {
  useDashboard,
  useProviderModels,
  useStrategyConfig,
  useUpdateStrategyConfig,
} from "@/api/strategies";

// Owner-only strategy settings: decision cadence, max leverage, LLM provider/model.
// Edits hot-apply to the live strategy (no restart): cadence within one old
// interval, model on the next LLM cycle, leverage immediately.

const INTERVALS: { label: string; seconds: number }[] = [
  { label: "5 minutes", seconds: 300 },
  { label: "15 minutes", seconds: 900 },
  { label: "30 minutes", seconds: 1800 },
  { label: "1 hour", seconds: 3600 },
  { label: "4 hours", seconds: 14400 },
  { label: "12 hours", seconds: 43200 },
  { label: "1 day", seconds: 86400 },
];

const MODEL_PRESETS: Record<string, string[]> = {
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1-mini"],
  openrouter: [
    "deepseek/deepseek-r1",
    "meta-llama/llama-3.3-70b-instruct",
    "anthropic/claude-3-5-sonnet",
    "google/gemini-2.0-flash-001",
  ],
  google: ["gemini-2.0-flash-001", "gemini-2.0-flash-thinking-exp", "gemini-1.5-pro"],
};

function intervalLabel(seconds: number): string {
  const preset = INTERVALS.find((i) => i.seconds === seconds);
  if (preset) return preset.label;
  if (seconds % 3600 === 0) return `${seconds / 3600} hours`;
  if (seconds % 60 === 0) return `${seconds / 60} minutes`;
  return `${seconds}s`;
}

export function SettingsSection({ id }: { id: string }) {
  const { data: dash } = useDashboard();
  const isOwner = dash?.strategies.some((s) => s.strategyId === id && s.isOwner) ?? false;
  const { data: cfg } = useStrategyConfig(id, isOwner);
  const update = useUpdateStrategyConfig();

  const [interval, setInterval] = useState<number | "">("");
  const [leverage, setLeverage] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [savedNote, setSavedNote] = useState(false);

  // Hooks must run unconditionally (before the ownership early-return below).
  const fetchedModels = useProviderModelsSafe(provider);

  // Seed the form whenever fresh config lands (also resets after save/refetch).
  useEffect(() => {
    if (!cfg) return;
    setInterval(cfg.decideIntervalSeconds ?? "");
    setLeverage(cfg.maxLeverage != null ? String(cfg.maxLeverage) : "");
    setProvider(cfg.modelProvider ?? "");
    setModel(cfg.modelId ?? "");
  }, [cfg]);

  if (!isOwner || !cfg) return null;

  const models = fetchedModels ?? MODEL_PRESETS[provider] ?? [];

  const dirty =
    (interval !== "" && interval !== (cfg.decideIntervalSeconds ?? "")) ||
    (leverage !== "" && Number(leverage) !== cfg.maxLeverage) ||
    (provider !== "" && provider !== (cfg.modelProvider ?? "")) ||
    (model !== "" && model !== (cfg.modelId ?? ""));

  const save = () => {
    const input: Parameters<typeof update.mutate>[0] = { id };
    if (interval !== "" && interval !== cfg.decideIntervalSeconds)
      input.decide_interval_seconds = Number(interval);
    if (leverage !== "" && Number(leverage) !== cfg.maxLeverage)
      input.max_leverage = Number(leverage);
    if (provider !== "" && provider !== cfg.modelProvider) input.model_provider = provider;
    if (model !== "" && model !== cfg.modelId) input.model_id = model;
    update.mutate(input, {
      onSuccess: () => {
        setSavedNote(true);
        window.setTimeout(() => setSavedNote(false), 4000);
      },
    });
  };

  const currentInterval =
    cfg.decideIntervalSeconds != null ? intervalLabel(cfg.decideIntervalSeconds) : "default (5 minutes)";

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">Settings</h3>
        <span className="text-[11px] text-gray-500">
          changes apply to the live strategy — no restart
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <label className="block">
          <span className="text-xs text-gray-500">Decision frequency</span>
          <select
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200"
          >
            {cfg.decideIntervalSeconds != null &&
              !INTERVALS.some((i) => i.seconds === cfg.decideIntervalSeconds) && (
                <option value={cfg.decideIntervalSeconds}>{currentInterval} (current)</option>
              )}
            {INTERVALS.map((i) => (
              <option key={i.seconds} value={i.seconds}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Max leverage (1–20)</span>
          <input
            type="number"
            min={1}
            max={20}
            step={0.5}
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">LLM provider</span>
          <select
            value={provider}
            onChange={(e) => {
              const prov = e.target.value;
              setProvider(prov);
              const defaults = MODEL_PRESETS[prov];
              if (defaults?.[0]) setModel(defaults[0]);
            }}
            className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200"
          >
            <option value="deepseek">DeepSeek</option>
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Model</span>
          <input
            list="settings-model-presets"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200"
          />
          <datalist id="settings-model-presets">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || update.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </button>
        {savedNote && <span className="text-xs text-green-400">Applied to the live strategy ✓</span>}
        {update.isError && (
          <span className="text-xs text-red-400">{(update.error as Error).message}</span>
        )}
      </div>
    </div>
  );
}

// Hook wrapper: useProviderModels must be called unconditionally; tolerate empty
// provider (query disabled) and fall back to presets in the caller.
function useProviderModelsSafe(provider: string): string[] | undefined {
  const { data } = useProviderModels(provider);
  return data && data.length > 0 ? data : undefined;
}

import { useState } from "react";
import {
  useDashboard,
  useProviderModels,
  useStrategyConfig,
  useUpdateStrategyConfig,
} from "@/api/strategies";

// Owner-only strategy settings: decision frequency, max leverage, LLM
// provider/model. Read-only by default; the ✎ Edit button reveals the form.
// Saved edits hot-apply to the live strategy (no restart): cadence on the loop's
// next tick, model on the next LLM cycle, leverage immediately.

// Decision-interval unit → seconds (mirrors the create page).
const INTERVAL_UNITS: Record<string, { label: string; seconds: number }> = {
  sec: { label: "Seconds", seconds: 1 },
  min: { label: "Minutes", seconds: 60 },
  hour: { label: "Hours", seconds: 3600 },
  day: { label: "Days", seconds: 86400 },
};
const UNIT_ORDER = ["day", "hour", "min", "sec"];

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

// Largest whole unit that divides the interval evenly (600s → 10 min, 3600s → 1 hour).
function secondsToParts(sec: number): { value: number; unit: string } {
  for (const unit of UNIT_ORDER) {
    const s = INTERVAL_UNITS[unit].seconds;
    if (sec % s === 0) return { value: sec / s, unit };
  }
  return { value: sec, unit: "sec" };
}

function humanInterval(sec: number | null): string {
  if (sec == null) return "5 minutes (default)";
  const { value, unit } = secondsToParts(sec);
  const base = { sec: "second", min: "minute", hour: "hour", day: "day" }[unit] ?? "second";
  return `${value} ${base}${value === 1 ? "" : "s"}`;
}

const inputCls =
  "bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500";

export function SettingsSection({ id }: { id: string }) {
  const { data: dash } = useDashboard();
  const isOwner = dash?.strategies.some((s) => s.strategyId === id && s.isOwner) ?? false;
  const { data: cfg } = useStrategyConfig(id, isOwner);
  const update = useUpdateStrategyConfig();

  const [editing, setEditing] = useState(false);
  const [intervalNum, setIntervalNum] = useState("");
  const [intervalUnit, setIntervalUnit] = useState("min");
  const [leverage, setLeverage] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState("");

  // Model discovery for the provider currently selected in the form (hook must run
  // unconditionally, before the ownership early-return).
  const { data: fetched } = useProviderModels(provider);

  if (!isOwner || !cfg) return null;

  const models = fetched && fetched.length > 0 ? fetched : MODEL_PRESETS[provider] ?? [];
  const decideSeconds = Number(intervalNum) * (INTERVAL_UNITS[intervalUnit]?.seconds ?? 1);

  const startEdit = () => {
    const parts =
      cfg.decideIntervalSeconds != null ? secondsToParts(cfg.decideIntervalSeconds) : { value: 5, unit: "min" };
    setIntervalNum(String(parts.value));
    setIntervalUnit(parts.unit);
    setLeverage(cfg.maxLeverage != null ? String(cfg.maxLeverage) : "");
    setProvider(cfg.modelProvider ?? "deepseek");
    setModel(cfg.modelId ?? "");
    setError("");
    setEditing(true);
  };

  const save = () => {
    if (!(decideSeconds >= 60 && decideSeconds <= 86400)) {
      setError("Decision frequency must be between 1 minute and 1 day.");
      return;
    }
    const lev = Number(leverage);
    if (!(lev >= 1 && lev <= 20)) {
      setError("Max leverage must be between 1 and 20.");
      return;
    }
    if (!model.trim()) {
      setError("Model cannot be empty.");
      return;
    }
    const input: Parameters<typeof update.mutate>[0] = { id };
    if (decideSeconds !== cfg.decideIntervalSeconds) input.decide_interval_seconds = decideSeconds;
    if (lev !== cfg.maxLeverage) input.max_leverage = lev;
    if (provider !== cfg.modelProvider) input.model_provider = provider;
    if (model.trim() !== cfg.modelId) input.model_id = model.trim();
    if (Object.keys(input).length === 1) {
      setEditing(false); // nothing changed
      return;
    }
    update.mutate(input, {
      onSuccess: () => {
        setEditing(false);
        setError("");
      },
      onError: (e) => setError((e as Error).message),
    });
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">Settings</h3>
        {!editing && (
          <button
            onClick={startEdit}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded-lg px-2 py-1 transition-colors"
          >
            ✎ Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ROStat label="Decision frequency" value={humanInterval(cfg.decideIntervalSeconds)} />
          <ROStat label="Max leverage" value={cfg.maxLeverage != null ? `${cfg.maxLeverage}x` : "-"} />
          <ROStat label="LLM provider" value={cfg.modelProvider || "-"} />
          <ROStat label="Model" value={cfg.modelId || "-"} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-500">Decision frequency</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={intervalNum}
                  onChange={(e) => setIntervalNum(e.target.value)}
                  className={`w-24 ${inputCls}`}
                />
                <select
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value)}
                  className={inputCls}
                >
                  {UNIT_ORDER.map((u) => (
                    <option key={u} value={u}>
                      {INTERVAL_UNITS[u].label}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-[11px] text-gray-600 mt-1 block">
                = {decideSeconds ? decideSeconds.toLocaleString() : "?"}s per cycle
              </span>
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
                className={`mt-1 w-full ${inputCls}`}
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
                className={`mt-1 w-full ${inputCls}`}
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
                className={`mt-1 w-full ${inputCls}`}
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
              disabled={update.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
              className="text-sm text-gray-400 hover:text-gray-200 px-2 py-2"
            >
              Cancel
            </button>
            <span className="text-[11px] text-gray-500">applies to the live strategy — no restart</span>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </>
      )}
    </div>
  );
}

// ROStat: a read-only label/value pair matching the page's Stat style.
function ROStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-gray-200">{value}</div>
    </div>
  );
}

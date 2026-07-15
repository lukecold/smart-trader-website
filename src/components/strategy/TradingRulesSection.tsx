import { useState } from "react";
import {
  useDashboard,
  useStrategyConfig,
  useUpdateStrategyConfig,
  type EngineRules,
  type SymbolGroupInput,
  type SymbolGroupView,
  type UpdateStrategyConfigInput,
} from "@/api/strategies";

// Owner-only trading-rules panel. Editable: the tradable-symbol universe and the
// volatility GROUPS (any number of named tiers, each with its own holdings caps —
// generalizing the old binary high-vol list). Read-only-by-default with an ✎ Edit
// toggle, mirroring SettingsSection. Below sits an always-visible, collapsible view of
// every OTHER engine rule at its effective value, so nothing the engine does stays
// hidden. Saving symbols/groups restarts the strategy to apply (the backend reloads).

const inputCls =
  "bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500";

// Format a fraction-of-equity as a percent, trimming trailing zeros (0.015 -> "1.5%").
function fmtPct(frac: number): string {
  return `${parseFloat((frac * 100).toFixed(2))}%`;
}

// Normalize a symbol the same way the backend does (uppercase, strip separators), so
// the client detects the same "one ticker in two groups" collisions the API rejects.
function normSym(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Parse a user-entered percent into a fraction of equity. Blank => 0 (uncapped). Returns
// null when out of range so the caller can surface a validation error.
function parseCapPct(s: string): number | null {
  const t = s.trim();
  if (t === "") return 0;
  const n = Number(t);
  if (!isFinite(n) || n < 0 || n > 2000) return null; // 2000% aligns with the API's 20x cap
  return n / 100;
}

// Group caps rendered for the read-only summary.
function capText(g: SymbolGroupView): string {
  const per = g.perSymbolCap > 0 ? `${fmtPct(g.perSymbolCap)}/ticker` : "per-ticker uncapped";
  const comb = g.combinedCap > 0 ? `${fmtPct(g.combinedCap)} combined` : "combined uncapped";
  return `${per} · ${comb}`;
}

// Editable group row: caps are percent STRINGS while editing (converted on save).
interface EditGroup {
  name: string;
  symbols: string[];
  per: string;
  comb: string;
}

function toEditGroup(g: SymbolGroupView): EditGroup {
  return {
    name: g.name,
    symbols: g.symbols,
    per: g.perSymbolCap > 0 ? String(parseFloat((g.perSymbolCap * 100).toFixed(4))) : "",
    comb: g.combinedCap > 0 ? String(parseFloat((g.combinedCap * 100).toFixed(4))) : "",
  };
}

// --- read-only "all engine rules" descriptors ---
type Fmt = "bool" | "pct" | "num" | "mult" | "pctOrOff";
interface RuleDesc {
  key: keyof EngineRules;
  label: string;
  fmt: Fmt;
}
const RULE_GROUPS: { title: string; rules: RuleDesc[] }[] = [
  {
    title: "Entry",
    rules: [
      { key: "bounceGateEnabled", label: "Bounce gate", fmt: "bool" },
      { key: "bounceGatePriceVsEma20Pct", label: "· short-block above EMA20", fmt: "pct" },
      { key: "bounceGateRecoveryPct", label: "· short-block after recovery", fmt: "pct" },
      { key: "llmPrefilterEnabled", label: "LLM pre-filter", fmt: "bool" },
      { key: "trendBand", label: "Trend dead-band", fmt: "pct" },
      { key: "trendSlopeMin", label: "Trend slope min", fmt: "pct" },
      { key: "trendSlopeLookback", label: "Trend slope lookback", fmt: "num" },
      { key: "trendConfirmCycles", label: "Trend confirm cycles", fmt: "num" },
    ],
  },
  {
    title: "Exit & stops",
    rules: [
      { key: "stopTriggerEnabled", label: "Stop trigger", fmt: "bool" },
      { key: "minStopDistancePct", label: "Min stop distance", fmt: "pct" },
      { key: "trailLockPct", label: "Break-even lock", fmt: "pct" },
      { key: "trailExitEnabled", label: "Trailing-stop exit", fmt: "bool" },
      { key: "trailActivatePct", label: "Trail activate", fmt: "pct" },
      { key: "trailAtrMult", label: "Trail ATR mult", fmt: "mult" },
      { key: "trailDistPct", label: "Trail distance floor", fmt: "pct" },
      { key: "trailDistMaxPct", label: "Trail distance cap", fmt: "pct" },
      { key: "backstopTpPct", label: "Backstop take-profit", fmt: "pctOrOff" },
      { key: "reversalExitEnabled", label: "Reversal scale-out", fmt: "bool" },
      { key: "reversalScaleOutPct", label: "· portion closed", fmt: "pct" },
      { key: "reversalRemainderCycles", label: "· remainder cycles", fmt: "num" },
    ],
  },
  {
    title: "Decision cadence",
    rules: [
      { key: "decisionGateEnabled", label: "Decision gate", fmt: "bool" },
      { key: "gatePnlBandPct", label: "Gate PnL band", fmt: "pct" },
      { key: "gateHeartbeatCycles", label: "Gate heartbeat (cycles)", fmt: "num" },
      { key: "srEnabled", label: "S/R analysis", fmt: "bool" },
      { key: "srClusterTolAtr", label: "S/R cluster tolerance", fmt: "mult" },
      { key: "srResNearPct", label: "S/R near-resistance", fmt: "pct" },
    ],
  },
];

function fmtRule(v: number | boolean, fmt: Fmt): string {
  if (fmt === "bool") return v ? "On" : "Off";
  if (fmt === "num") return String(v);
  if (fmt === "mult") return `${v}×`;
  if (fmt === "pctOrOff") return (v as number) > 0 ? fmtPct(v as number) : "Off";
  return fmtPct(v as number);
}

// Chip/tag input for a list of tickers (add on Enter/comma, × to remove, Backspace on an
// empty field pops the last). Mirrors the create-form symbol editor.
function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const s = raw.trim().toUpperCase();
    if (s && !value.includes(s)) onChange([...value, s]);
    setText("");
  };
  return (
    <div className="min-h-[42px] w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 flex flex-wrap gap-1.5 focus-within:border-blue-500">
      {value.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-full"
        >
          {s}
          <button
            type="button"
            onClick={() => onChange(value.filter((x) => x !== s))}
            className="text-blue-300/70 hover:text-blue-100"
            aria-label={`Remove ${s}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && text === "" && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && add(text)}
        placeholder={value.length ? "" : placeholder}
        className="flex-1 min-w-[100px] bg-transparent text-white text-sm outline-none px-1"
      />
    </div>
  );
}

export function TradingRulesSection({ id }: { id: string }) {
  const { data: dash } = useDashboard();
  const isOwner = dash?.strategies.some((s) => s.strategyId === id && s.isOwner) ?? false;
  const { data: cfg } = useStrategyConfig(id, isOwner);
  const update = useUpdateStrategyConfig();

  const [editing, setEditing] = useState(false);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [groups, setGroups] = useState<EditGroup[]>([]);
  const [emaFast, setEmaFast] = useState("");
  const [emaSlow, setEmaSlow] = useState("");
  const [initial, setInitial] = useState<{
    symbols: string[];
    groups: EditGroup[];
    emaFast: string;
    emaSlow: string;
  }>({ symbols: [], groups: [], emaFast: "", emaSlow: "" });
  const [error, setError] = useState("");

  if (!isOwner || !cfg) return null;

  const startEdit = () => {
    const seedSymbols = cfg.symbols ?? [];
    const seedGroups = (cfg.symbolGroups ?? []).map(toEditGroup);
    const seedFast = String(cfg.trendEmaFast ?? 20);
    const seedSlow = String(cfg.trendEmaSlow ?? 50);
    setSymbols(seedSymbols);
    setGroups(seedGroups);
    setEmaFast(seedFast);
    setEmaSlow(seedSlow);
    setInitial({ symbols: seedSymbols, groups: seedGroups, emaFast: seedFast, emaSlow: seedSlow });
    setError("");
    setEditing(true);
  };

  const updateGroup = (i: number, patch: Partial<EditGroup>) =>
    setGroups((gs) => gs.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  const addGroup = () =>
    setGroups((gs) => [...gs, { name: "", symbols: [], per: "", comb: "" }]);
  const removeGroup = (i: number) => setGroups((gs) => gs.filter((_, idx) => idx !== i));

  const save = () => {
    const syms = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (syms.length === 0) {
      setError("Tradable symbols cannot be empty.");
      return;
    }

    // Validate + normalize groups (mirrors the backend so errors surface instantly).
    const seenName = new Set<string>();
    const seenSym = new Map<string, string>();
    const outGroups: SymbolGroupInput[] = [];
    for (const g of groups) {
      const name = g.name.trim();
      if (!name) {
        setError("Every group needs a name.");
        return;
      }
      if (seenName.has(name.toLowerCase())) {
        setError(`Duplicate group name: "${name}".`);
        return;
      }
      seenName.add(name.toLowerCase());
      const gsyms = g.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (gsyms.length === 0) {
        setError(`Group "${name}" has no tickers.`);
        return;
      }
      for (const s of gsyms) {
        const n = normSym(s);
        const other = seenSym.get(n);
        if (other) {
          setError(`${s} is in two groups ("${other}" and "${name}").`);
          return;
        }
        seenSym.set(n, name);
      }
      const per = parseCapPct(g.per);
      const comb = parseCapPct(g.comb);
      if (per === null) {
        setError(`Per-ticker cap for "${name}" must be between 0 and 2000%.`);
        return;
      }
      if (comb === null) {
        setError(`Combined cap for "${name}" must be between 0 and 2000%.`);
        return;
      }
      if (per > 0 && comb > 0 && comb < per) {
        setError(`Combined cap must be ≥ per-ticker cap for "${name}".`);
        return;
      }
      outGroups.push({ name, symbols: gsyms, per_symbol_cap: per, combined_cap: comb });
    }

    // Trend EMA periods: bounds + fast<slow, mirroring the backend validation.
    const fastN = Number(emaFast);
    const slowN = Number(emaSlow);
    if (!Number.isInteger(fastN) || fastN < 2 || fastN > 400) {
      setError("Trend EMA fast must be a whole number between 2 and 400.");
      return;
    }
    if (!Number.isInteger(slowN) || slowN < 2 || slowN > 400) {
      setError("Trend EMA slow must be a whole number between 2 and 400.");
      return;
    }
    if (fastN >= slowN) {
      setError("Trend EMA fast must be less than slow.");
      return;
    }

    // Only send what actually changed (any of these restarts the strategy, so avoid a
    // needless reload when nothing did).
    const input: UpdateStrategyConfigInput = { id };
    if (JSON.stringify(symbols) !== JSON.stringify(initial.symbols)) input.symbols = syms;
    if (JSON.stringify(groups) !== JSON.stringify(initial.groups)) input.symbol_groups = outGroups;
    if (emaFast !== initial.emaFast) input.trend_ema_fast = fastN;
    if (emaSlow !== initial.emaSlow) input.trend_ema_slow = slowN;
    if (
      input.symbols === undefined &&
      input.symbol_groups === undefined &&
      input.trend_ema_fast === undefined &&
      input.trend_ema_slow === undefined
    ) {
      setEditing(false);
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
        <h3 className="text-sm font-semibold text-gray-200">Trading rules</h3>
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
        <div className="space-y-4">
          <div>
            <div className="text-xs text-gray-500 mb-1.5">Volatility groups</div>
            {cfg.symbolGroups && cfg.symbolGroups.length > 0 ? (
              <div className="space-y-2">
                {cfg.symbolGroups.map((g) => (
                  <div key={g.name} className="rounded-lg border border-gray-800 bg-gray-900/40 p-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm font-medium text-gray-200">{g.name}</span>
                      <span className="text-[11px] text-gray-500">{capText(g)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.symbols.map((s) => (
                        <span key={s} className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">No volatility groups — every ticker trades uncapped.</p>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1.5">Tradable symbols</div>
            <div className="flex flex-wrap gap-1.5">
              {(cfg.symbols ?? []).map((s) => (
                <span key={s} className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Trend signal</div>
            <div className="text-sm font-medium text-gray-200">
              EMA {cfg.trendEmaFast ?? 20} / {cfg.trendEmaSlow ?? 50} cross
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs text-gray-500">Tradable symbols</span>
            <div className="mt-1">
              <ChipInput value={symbols} onChange={setSymbols} placeholder="Add a ticker, e.g. BTC/USDT" />
            </div>
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500">Volatility groups</span>
              <button type="button" onClick={addGroup} className="text-xs text-blue-400 hover:text-blue-300">
                + Add group
              </button>
            </div>
            <div className="space-y-3">
              {groups.map((g, i) => (
                <div key={i} className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={g.name}
                      onChange={(e) => updateGroup(i, { name: e.target.value })}
                      placeholder="Group name (e.g. High volatility)"
                      className={`flex-1 ${inputCls}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeGroup(i)}
                      className="text-gray-500 hover:text-red-400 text-sm px-2"
                    >
                      Remove
                    </button>
                  </div>
                  <ChipInput
                    value={g.symbols}
                    onChange={(v) => updateGroup(i, { symbols: v })}
                    placeholder="Add tickers for this group"
                  />
                  <div className="flex gap-2">
                    <label className="flex-1 block">
                      <span className="text-[11px] text-gray-500">Max per ticker (% equity)</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={g.per}
                        onChange={(e) => updateGroup(i, { per: e.target.value })}
                        placeholder="uncapped"
                        className={`mt-1 w-full ${inputCls}`}
                      />
                    </label>
                    <label className="flex-1 block">
                      <span className="text-[11px] text-gray-500">Max combined (% equity)</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={g.comb}
                        onChange={(e) => updateGroup(i, { comb: e.target.value })}
                        placeholder="uncapped"
                        className={`mt-1 w-full ${inputCls}`}
                      />
                    </label>
                  </div>
                </div>
              ))}
              {groups.length === 0 && (
                <p className="text-xs text-gray-600">
                  No groups. Add one to cap how much the strategy can hold in a set of tickers.
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs text-gray-500 mb-1.5">Trend signal (EMA cross)</div>
            <div className="flex gap-2">
              <label className="flex-1 block">
                <span className="text-[11px] text-gray-500">Fast period</span>
                <input
                  type="number"
                  min={2}
                  max={400}
                  value={emaFast}
                  onChange={(e) => setEmaFast(e.target.value)}
                  className={`mt-1 w-full ${inputCls}`}
                />
              </label>
              <label className="flex-1 block">
                <span className="text-[11px] text-gray-500">Slow period</span>
                <input
                  type="number"
                  min={2}
                  max={400}
                  value={emaSlow}
                  onChange={(e) => setEmaSlow(e.target.value)}
                  className={`mt-1 w-full ${inputCls}`}
                />
              </label>
            </div>
            <p className="text-[11px] text-gray-600 mt-1">
              Drives the daily trend label, bounce gate and soft S/R. The 20/50 default is
              backtest-calibrated — a faster pair flips direction more often. Paper-test before
              changing on a live strategy.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
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
            <span className="text-[11px] text-gray-500">changing symbols, groups or the trend EMAs restarts the strategy to apply</span>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}

      {/* Every other engine rule, at its effective value — visible but not editable here. */}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 select-none">
          All engine rules (read-only)
        </summary>
        <p className="text-[11px] text-gray-600 mt-1.5 mb-2">
          Every rule the engine applies, at its effective value. These are calibrated defaults; editing them
          from here is coming later.
        </p>
        {cfg.rules ? (
          <div className="space-y-3">
            {RULE_GROUPS.map((grp) => (
              <div key={grp.title}>
                <div className="text-[11px] font-medium text-gray-400 mb-1">{grp.title}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {grp.rules.map((rd) => (
                    <div key={rd.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-500 truncate">{rd.label}</span>
                      <span className="text-gray-300 tabular-nums">{fmtRule(cfg.rules![rd.key], rd.fmt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-600">Rules unavailable.</p>
        )}
      </details>
    </div>
  );
}

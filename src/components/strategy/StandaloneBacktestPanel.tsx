import { useState, useRef, useCallback, useEffect } from "react";
import { formatCurrency, formatPct, formatNumber, cn } from "@/lib/utils";
import type { BacktestPoint, BacktestTrade, BacktestSummary } from "@/types/strategy";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface StandaloneBacktestConfig {
  promptText: string;
  symbols: string[];
  initialCapital: number;
  maxLeverage: number;
  maxPositions: number;
  llmProvider: string;
  llmModelId: string;
  llmApiKey?: string;
}

interface Props {
  config: StandaloneBacktestConfig;
  onLaunchPaper: (promptText: string) => void;
  onLaunchLive: (promptText: string) => void;
}

type Phase = "idle" | "estimating" | "ready" | "running" | "done" | "error";

interface EstimateResult {
  steps: number;
  estimatedMinutes: number;
  maxSteps: number;
  overLimit: boolean;
}

export function StandaloneBacktestPanel({ config, onLaunchPaper, onLaunchLive }: Props) {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [startDate, setStartDate] = useState(fmtDate(sevenDaysAgo));
  const [endDate, setEndDate] = useState(fmtDate(today));
  const [stepInterval, setStepInterval] = useState("4h");
  const [promptText, setPromptText] = useState(config.promptText);
  const [phase, setPhase] = useState<Phase>("idle");
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [progress, setProgress] = useState({ step: 0, total: 0 });
  const [points, setPoints] = useState<BacktestPoint[]>([]);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Keep prompt in sync if config changes (user edits form above)
  useEffect(() => {
    setPromptText(config.promptText);
  }, [config.promptText]);

  // Auto-estimate on date/interval change
  useEffect(() => {
    if (!startDate || !endDate) return;
    setPhase("estimating");
    setEstimate(null);
    const ctrl = new AbortController();
    fetch(
      `/api/v1/strategies/estimate-backtest?start_date=${startDate}&end_date=${endDate}&step_interval=${stepInterval}`,
      { signal: ctrl.signal }
    )
      .then((r) => r.json())
      .then((json) => {
        const data = camelizeKeys(json.data) as EstimateResult;
        setEstimate(data);
        setPhase(data.overLimit ? "idle" : "ready");
      })
      .catch((err) => {
        if (err.name !== "AbortError") setPhase("idle");
      });
    return () => ctrl.abort();
  }, [startDate, endDate, stepInterval]);

  const runBacktest = useCallback(async () => {
    setPhase("running");
    setPoints([]);
    setTrades([]);
    setSummary(null);
    setErrorMsg("");
    setProgress({ step: 0, total: estimate?.steps ?? 0 });

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/v1/strategies/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // no "id" — standalone mode
          prompt_text: promptText,
          symbols: config.symbols,
          llm_provider: config.llmProvider,
          llm_model_id: config.llmModelId,
          llm_api_key: config.llmApiKey || undefined,
          max_leverage: config.maxLeverage,
          max_positions: config.maxPositions,
          initial_capital: config.initialCapital,
          start_date: startDate,
          end_date: endDate,
          step_interval: stepInterval,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.msg || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const evt = camelizeKeys(JSON.parse(payload)) as Record<string, unknown>;
            switch (evt.type) {
              case "progress":
                setProgress({ step: evt.step as number, total: evt.total as number });
                break;
              case "point":
                setPoints((prev) => [
                  ...prev,
                  { ts: evt.ts as number, totalValue: evt.totalValue as number, cash: evt.cash as number, pnl: evt.pnl as number },
                ]);
                break;
              case "trade":
                setTrades((prev) => [
                  ...prev,
                  { ts: evt.ts as number, symbol: evt.symbol as string, action: evt.action as string, side: evt.side as string, quantity: evt.quantity as number, price: evt.price as number, pnl: evt.pnl as number },
                ]);
                break;
              case "summary":
                setSummary({
                  totalReturn: evt.totalReturn as number,
                  totalReturnPct: evt.totalReturnPct as number,
                  totalTrades: evt.totalTrades as number,
                  winningTrades: evt.winningTrades as number,
                  winRate: evt.winRate as number,
                  maxDrawdown: evt.maxDrawdown as number,
                  maxDrawdownPct: evt.maxDrawdownPct as number,
                });
                setPhase("done");
                break;
              case "error":
                setErrorMsg(evt.error as string);
                setPhase("error");
                break;
            }
          } catch { /* ignore unparseable lines */ }
        }
      }

      setPhase((p) => (p === "running" ? "done" : p));
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setErrorMsg((err as Error).message);
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  }, [config, promptText, startDate, endDate, stepInterval, estimate]);

  const resetAndRerun = () => {
    setPhase("ready");
    setPoints([]);
    setTrades([]);
    setSummary(null);
    setErrorMsg("");
  };

  const progressPct = progress.total > 0 ? Math.round((progress.step / progress.total) * 100) : 0;
  const overLimit = estimate?.overLimit ?? false;

  return (
    <div className="mt-6 border-t border-gray-800 pt-6 space-y-4">
      <h3 className="text-base font-semibold text-white">Backtest</h3>

      {/* Prompt override */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Prompt to test <span className="text-gray-600">(pre-filled from form above, edit freely)</span>
        </label>
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          disabled={phase === "running"}
          rows={5}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 resize-y font-mono disabled:opacity-50"
        />
      </div>

      {/* Date / interval controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            disabled={phase === "running"}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            disabled={phase === "running"}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Step Interval</label>
          <select value={stepInterval} onChange={(e) => setStepInterval(e.target.value)}
            disabled={phase === "running"}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50">
            <option value="15m">15 minutes</option>
            <option value="1h">1 hour</option>
            <option value="4h">4 hours</option>
            <option value="1d">1 day</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          {estimate && !overLimit && phase !== "running" && (
            <span className="text-xs text-gray-500">
              {estimate.steps} steps (~{estimate.estimatedMinutes} min)
            </span>
          )}
          {phase === "running" ? (
            <button onClick={() => { abortRef.current?.abort(); setPhase("done"); }}
              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm font-medium transition-colors">
              Stop
            </button>
          ) : (
            <button onClick={runBacktest}
              disabled={phase === "estimating" || !estimate || overLimit}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors">
              Run Backtest
            </button>
          )}
        </div>
      </div>

      {/* Over-limit warning */}
      {overLimit && estimate && (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-400">
          {estimate.steps} steps exceeds the {estimate.maxSteps}-step limit. Shorten the time range or increase the step interval.
        </div>
      )}

      {/* Progress */}
      {phase === "running" && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Step {progress.step}/{progress.total}</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* Error */}
      {phase === "error" && errorMsg && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">{errorMsg}</div>
      )}

      {/* Results */}
      {points.length >= 2 && <BtChart points={points} />}
      {summary && <BtSummary summary={summary} />}
      {trades.length > 0 && <BtTrades trades={trades} />}

      {/* Post-result actions */}
      {(phase === "done" || phase === "error") && (
        <div className="pt-2 border-t border-gray-800 flex flex-wrap gap-3">
          <button onClick={resetAndRerun}
            className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm font-medium transition-colors">
            Run Again
          </button>
          <div className="flex-1" />
          <button onClick={() => onLaunchPaper(promptText)}
            className="px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 text-sm font-medium transition-colors">
            Launch as Paper Trading
          </button>
          <button onClick={() => onLaunchLive(promptText)}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium transition-colors">
            Launch Live
          </button>
        </div>
      )}
    </div>
  );
}

// --- Chart ---

function BtChart({ points }: { points: BacktestPoint[] }) {
  const data = points.map((p) => ({
    time: new Date(p.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: p.totalValue,
  }));
  const isUp = data[data.length - 1].value >= data[0].value;
  const color = isUp ? "#22c55e" : "#ef4444";

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-400 mb-2">Equity Curve</h4>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="sb-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v.toLocaleString()}`} width={72} />
            <Tooltip contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }} formatter={(v: number) => [`$${v.toLocaleString()}`, "Value"]} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#sb-grad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --- Summary ---

function BtSummary({ summary }: { summary: BacktestSummary }) {
  const isPos = summary.totalReturn >= 0;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg border border-gray-800 bg-gray-800/30">
      <Stat label="Return" value={`${formatCurrency(summary.totalReturn)} (${formatPct(summary.totalReturnPct)})`} color={isPos ? "text-green-400" : "text-red-400"} />
      <Stat label="Total Trades" value={String(summary.totalTrades)} />
      <Stat label="Win Rate" value={`${summary.winningTrades}/${summary.totalTrades} (${formatPct(summary.winRate)})`} />
      <Stat label="Max Drawdown" value={`${formatCurrency(summary.maxDrawdown)} (${formatPct(summary.maxDrawdownPct)})`} color="text-red-400" />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={cn("text-sm font-medium", color || "text-gray-200")}>{value}</div>
    </div>
  );
}

// --- Trades ---

function BtTrades({ trades }: { trades: BacktestTrade[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? trades : trades.slice(-20);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-400">Trades ({trades.length})</h4>
        {trades.length > 20 && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-400 hover:text-blue-300">
            {expanded ? "Show recent" : "Show all"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto max-h-56 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-1.5 font-medium">Time</th>
              <th className="text-left py-1.5 font-medium">Action</th>
              <th className="text-left py-1.5 font-medium">Symbol</th>
              <th className="text-right py-1.5 font-medium">Qty</th>
              <th className="text-right py-1.5 font-medium">Price</th>
              <th className="text-right py-1.5 font-medium">PnL</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t, i) => (
              <tr key={i} className="border-b border-gray-800/50">
                <td className="py-1.5 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(t.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="py-1.5">
                  <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono", t.action.includes("open") ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400")}>
                    {t.action.replace("_", " ").toUpperCase()}
                  </span>
                </td>
                <td className="py-1.5 text-white font-medium">{t.symbol}</td>
                <td className="py-1.5 text-right text-gray-300">{formatNumber(t.quantity)}</td>
                <td className="py-1.5 text-right text-gray-300">{formatNumber(t.price, 2)}</td>
                <td className={cn("py-1.5 text-right", t.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                  {t.pnl !== 0 ? formatCurrency(t.pnl) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Helpers ---

function fmtDate(d: Date) { return d.toISOString().slice(0, 10); }

function camelize(s: string) { return s.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase()); }

function camelizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === "object")
    return Object.fromEntries(Object.entries(obj as Record<string, unknown>).map(([k, v]) => [camelize(k), camelizeKeys(v)]));
  return obj;
}

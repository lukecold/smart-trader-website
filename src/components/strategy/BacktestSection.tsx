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

type Phase = "idle" | "estimating" | "ready" | "running" | "done" | "error";

interface EstimateResult {
  steps: number;
  estimatedMinutes: number;
}

export function BacktestSection({ id }: { id: string }) {
  // Default date range: last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [startDate, setStartDate] = useState(fmtDate(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(fmtDate(today));
  const [stepInterval, setStepInterval] = useState("4h");
  const [phase, setPhase] = useState<Phase>("idle");
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [progress, setProgress] = useState({ step: 0, total: 0 });
  const [points, setPoints] = useState<BacktestPoint[]>([]);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Fetch estimate when dates or interval change
  useEffect(() => {
    if (!startDate || !endDate) return;
    setPhase("estimating");
    setEstimate(null);

    const controller = new AbortController();
    fetch(
      `/api/v1/strategies/estimate-backtest?id=${id}&start_date=${startDate}&end_date=${endDate}&step_interval=${stepInterval}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((json) => {
        const data = camelizeKeys(json.data) as EstimateResult;
        setEstimate(data);
        setPhase("ready");
      })
      .catch((err) => {
        if (err.name !== "AbortError") setPhase("idle");
      });

    return () => controller.abort();
  }, [id, startDate, endDate, stepInterval]);

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
          id,
          start_date: startDate,
          end_date: endDate,
          step_interval: stepInterval,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

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
                  {
                    ts: evt.ts as number,
                    totalValue: evt.totalValue as number,
                    cash: evt.cash as number,
                    pnl: evt.pnl as number,
                  },
                ]);
                break;
              case "trade":
                setTrades((prev) => [
                  ...prev,
                  {
                    ts: evt.ts as number,
                    symbol: evt.symbol as string,
                    action: evt.action as string,
                    side: evt.side as string,
                    quantity: evt.quantity as number,
                    price: evt.price as number,
                    pnl: evt.pnl as number,
                  },
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
          } catch {
            // ignore unparseable SSE lines
          }
        }
      }

      // If we never got a summary but finished reading, set done
      setPhase((p) => (p === "running" ? "done" : p));
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setErrorMsg((err as Error).message);
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  }, [id, startDate, endDate, stepInterval, estimate]);

  const stopBacktest = () => {
    abortRef.current?.abort();
    setPhase("done");
  };

  const progressPct =
    progress.total > 0 ? Math.round((progress.step / progress.total) * 100) : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Backtest</h3>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={phase === "running"}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={phase === "running"}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Step</label>
          <select
            value={stepInterval}
            onChange={(e) => setStepInterval(e.target.value)}
            disabled={phase === "running"}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value="1h">1 hour</option>
            <option value="4h">4 hours</option>
            <option value="1d">1 day</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          {estimate && phase !== "running" && (
            <span className="text-xs text-gray-500">
              {estimate.steps} LLM calls (~{estimate.estimatedMinutes} min)
            </span>
          )}

          {phase === "running" ? (
            <button
              onClick={stopBacktest}
              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm font-medium transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={runBacktest}
              disabled={phase === "estimating" || !estimate}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              Run Backtest
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {phase === "running" && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>
              Step {progress.step}/{progress.total}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {phase === "error" && errorMsg && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Equity Curve */}
      {points.length >= 2 && <BacktestChart points={points} />}

      {/* Summary */}
      {summary && <BacktestSummaryCard summary={summary} />}

      {/* Trades */}
      {trades.length > 0 && <BacktestTrades trades={trades} />}
    </div>
  );
}

// --- Equity Chart ---

function BacktestChart({ points }: { points: BacktestPoint[] }) {
  const formatted = points.map((p) => ({
    time: new Date(p.ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    value: p.totalValue,
    pnl: p.pnl,
  }));

  const first = formatted[0].value;
  const last = formatted[formatted.length - 1].value;
  const isUp = last >= first;

  return (
    <div className="mb-4">
      <h4 className="text-sm font-medium text-gray-400 mb-2">Equity Curve</h4>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formatted} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="bt-grad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={isUp ? "#22c55e" : "#ef4444"}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={isUp ? "#22c55e" : "#ef4444"}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v.toLocaleString()}`}
              width={72}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#f9fafb",
                fontSize: 12,
              }}
              formatter={(v: number) => [`$${v.toLocaleString()}`, "Value"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isUp ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              fill="url(#bt-grad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// --- Summary Card ---

function BacktestSummaryCard({ summary }: { summary: BacktestSummary }) {
  const isPositive = summary.totalReturn >= 0;

  return (
    <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg border border-gray-800 bg-gray-800/30">
      <SumStat
        label="Return"
        value={`${formatCurrency(summary.totalReturn)} (${formatPct(summary.totalReturnPct)})`}
        color={isPositive ? "text-green-400" : "text-red-400"}
      />
      <SumStat label="Total Trades" value={String(summary.totalTrades)} />
      <SumStat
        label="Win Rate"
        value={`${summary.winningTrades}/${summary.totalTrades} (${formatPct(summary.winRate)})`}
      />
      <SumStat
        label="Max Drawdown"
        value={`${formatCurrency(summary.maxDrawdown)} (${formatPct(summary.maxDrawdownPct)})`}
        color="text-red-400"
      />
    </div>
  );
}

function SumStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={cn("text-sm font-medium", color || "text-gray-200")}>{value}</div>
    </div>
  );
}

// --- Trade List ---

function BacktestTrades({ trades }: { trades: BacktestTrade[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? trades : trades.slice(-20);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-400">
          Trades ({trades.length})
        </h4>
        {trades.length > 20 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {expanded ? "Show recent" : "Show all"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
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
                  {new Date(t.ts).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="py-1.5">
                  <span
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded font-mono",
                      t.action.includes("open")
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-orange-500/10 text-orange-400"
                    )}
                  >
                    {t.action.replace("_", " ").toUpperCase()}
                  </span>
                </td>
                <td className="py-1.5 text-white font-medium">{t.symbol}</td>
                <td className="py-1.5 text-right text-gray-300">
                  {formatNumber(t.quantity)}
                </td>
                <td className="py-1.5 text-right text-gray-300">
                  {formatNumber(t.price, 2)}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-right",
                    t.pnl >= 0 ? "text-green-400" : "text-red-400"
                  )}
                >
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

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function camelize(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function camelizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(camelizeKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, val]) => [
        camelize(key),
        camelizeKeys(val),
      ])
    );
  }
  return obj;
}

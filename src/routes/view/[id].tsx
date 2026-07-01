import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useRedactedView,
  useFollow,
  useUnfollow,
  useCopyTrade,
  useStopCopyTrade,
} from "@/api/strategies";
import { formatPct, cn } from "@/lib/utils";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { CopyTradeModal } from "@/components/strategy/CopyTradeModal";
import type { RedactedView, PerfPoint } from "@/types/strategy";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function RedactedStrategyView() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;

  return (
    <div className="space-y-6">
      <Link to="/leaderboard" className="text-sm text-gray-500 hover:text-gray-300">
        &larr; Back to Leaderboard
      </Link>
      <ViewBody id={id} />
    </div>
  );
}

function ViewBody({ id }: { id: string }) {
  const { data, isLoading } = useRedactedView(id);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-800 rounded w-64" />
        <div className="h-56 bg-gray-800 rounded" />
      </div>
    );
  }

  // The client may not throw on code:403/404 — data comes back null/undefined.
  if (!data || !data.strategyId) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
        <p className="text-lg text-gray-300">
          This strategy is private or unavailable
        </p>
        <p className="text-sm text-gray-500 mt-2">
          You need to follow or copy-trade it, or the owner must make it public.
        </p>
      </div>
    );
  }

  return (
    <>
      <Header view={data} id={id} />
      <PerformanceChart points={data.performance} />
      <PositionsTable positions={data.positions} />
    </>
  );
}

function Header({ view: v, id }: { view: RedactedView; id: string }) {
  const { withAuth } = useAuthGuard();
  const followMutation = useFollow();
  const unfollowMutation = useUnfollow();
  const copyTradeMutation = useCopyTrade();
  const uncopyTradeMutation = useStopCopyTrade();
  const [showCopyModal, setShowCopyModal] = useState(false);

  const isRunning = v.status === "running";
  const pctColor =
    v.totalPnlPct != null
      ? v.totalPnlPct >= 0
        ? "text-green-400"
        : "text-red-400"
      : "text-gray-500";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-white truncate">
              {v.strategyName || v.strategyId.slice(0, 20)}
            </h2>
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full",
                isRunning
                  ? "bg-green-500/10 text-green-400"
                  : "bg-gray-700 text-gray-400"
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isRunning ? "bg-green-500 animate-pulse" : "bg-gray-500"
                )}
              />
              {v.status}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300"
              title="This is a redacted, shared view. Capital, position sizes, prompt, and decision history are hidden."
            >
              Redacted view
            </span>
          </div>
          <div className="mt-3 flex items-center gap-6 text-sm flex-wrap">
            <div>
              <span className="text-gray-500">Return (since inception): </span>
              <span className={cn("font-semibold", pctColor)}>
                {formatPct(v.totalPnlPct)}
              </span>
            </div>
            {v.exchangeId && (
              <div>
                <span className="text-gray-500">Exchange: </span>
                <span className="text-gray-300">{v.exchangeId}</span>
              </div>
            )}
            {v.modelId && (
              <div>
                <span className="text-gray-500">Model: </span>
                <span className="text-gray-300">{v.modelId}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {v.isFollowing ? (
            <button
              onClick={() => withAuth(() => unfollowMutation.mutate(id))}
              className="text-sm px-4 py-2 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors"
            >
              Following
            </button>
          ) : (
            <button
              onClick={() => withAuth(() => followMutation.mutate(id))}
              className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              Follow
            </button>
          )}
          {v.isCopyTrading ? (
            <button
              onClick={() => withAuth(() => uncopyTradeMutation.mutate(id))}
              className="text-sm px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
            >
              Copy-trading
            </button>
          ) : (
            <button
              onClick={() => withAuth(() => setShowCopyModal(true))}
              className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
            >
              Copy-trade
            </button>
          )}
        </div>
      </div>
      {showCopyModal && (
        <CopyTradeModal
          name={v.strategyName || v.strategyId.slice(0, 20)}
          onCancel={() => setShowCopyModal(false)}
          onConfirm={(p) => {
            copyTradeMutation.mutate(
              { id, ...p },
              { onSuccess: (data) => data?.warning && alert(data.warning) }
            );
            setShowCopyModal(false);
          }}
        />
      )}
      <p className="mt-4 text-xs text-gray-500 border-t border-gray-800/60 pt-3">
        <span className="text-gray-400">Follow</span> bookmarks this strategy so you can track its redacted performance.{" "}
        <span className="text-gray-400">Copy-trade</span> replicates its trades with your own capital — it starts in{" "}
        <span className="text-amber-400/80">paper / testnet mode</span>, so no real orders are placed yet.
      </p>
    </div>
  );
}

function PerformanceChart({ points }: { points: PerfPoint[] }) {
  if (!points || points.length < 2) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Performance</h3>
        <div className="h-56 flex items-center justify-center text-sm text-gray-500">
          Not enough performance data yet.
        </div>
      </div>
    );
  }

  const first = points[0].pct;
  const last = points[points.length - 1].pct;
  const isUp = last >= first;

  const fmtAxis = (ts: number) =>
    new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtFull = (ts: number) =>
    new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold text-white">Performance</h3>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            isUp ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          )}
        >
          {formatPct(last)}
        </span>
        <span className="text-xs text-gray-500">% return</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={points}
            margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
          >
            <defs>
              <linearGradient id="redacted-grad" x1="0" y1="0" x2="0" y2="1">
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
              dataKey="ts"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tickFormatter={fmtAxis}
            />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              width={56}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#f9fafb",
                fontSize: 12,
              }}
              labelFormatter={(label: number) => fmtFull(label)}
              formatter={(v: number) => [`${v.toFixed(2)}%`, "Return"]}
            />
            <Area
              type="monotone"
              dataKey="pct"
              stroke={isUp ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              fill="url(#redacted-grad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PositionsTable({
  positions,
}: {
  positions: RedactedView["positions"];
}) {
  if (!positions || positions.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Open Positions</h3>
        <p className="text-sm text-gray-500">No open positions.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Open Positions</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 font-medium">Ticker</th>
              <th className="text-left py-2 font-medium">Direction</th>
              <th className="text-right py-2 font-medium">PnL %</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.symbol} className="border-b border-gray-800/50">
                <td className="py-2.5 text-white font-medium">{p.symbol}</td>
                <td className="py-2.5">
                  <span
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded",
                      p.direction === "LONG"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    )}
                  >
                    {p.direction}
                  </span>
                </td>
                <td
                  className={cn(
                    "py-2.5 text-right",
                    p.pnlPct >= 0 ? "text-green-400" : "text-red-400"
                  )}
                >
                  {formatPct(p.pnlPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

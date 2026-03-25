import { Link } from "react-router-dom";
import { useStrategies, useStopStrategy, useDeleteStrategy, useRestartStrategy } from "@/api/strategies";
import { formatCurrency, formatPct, timeAgo, cn } from "@/lib/utils";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import type { Strategy } from "@/types/strategy";

export function Dashboard() {
  const { data, isLoading } = useStrategies();
  const stopMutation = useStopStrategy();
  const deleteMutation = useDeleteStrategy();
  const restartMutation = useRestartStrategy();
  const { withAuth } = useAuthGuard();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-800 rounded w-48" />
        <div className="h-64 bg-gray-800 rounded" />
      </div>
    );
  }

  const strategies = data?.strategies ?? [];
  const runningCount = data?.runningCount ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Strategies</h2>
          <p className="text-sm text-gray-400 mt-1">
            {strategies.length} total, {runningCount} running
          </p>
        </div>
        <Link
          to="/strategy/create"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
        >
          + New Strategy
        </Link>
      </div>

      {strategies.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No strategies yet</p>
          <p className="text-sm mt-2">Create your first strategy to get started</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {strategies.map((s) => (
            <StrategyCard
              key={s.strategyId}
              strategy={s}
              onStop={() => withAuth(() => stopMutation.mutate(s.strategyId))}
              onDelete={() =>
                withAuth(() => {
                  if (confirm("Delete this strategy?")) {
                    deleteMutation.mutate(s.strategyId);
                  }
                })
              }
              onRestart={() => withAuth(() => restartMutation.mutate(s.strategyId))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyCard({
  strategy: s,
  onStop,
  onDelete,
  onRestart,
}: {
  strategy: Strategy;
  onStop: () => void;
  onDelete: () => void;
  onRestart: () => void;
}) {
  const isRunning = s.status === "running";
  const pnlColor =
    s.totalPnl != null
      ? s.totalPnl >= 0
        ? "text-green-400"
        : "text-red-400"
      : "text-gray-500";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between">
        <Link to={`/strategy/${s.strategyId}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                isRunning ? "bg-green-500 animate-pulse" : "bg-gray-600"
              )}
            />
            <h3 className="text-white font-medium truncate">
              {s.strategyName || s.strategyId.slice(0, 20)}
            </h3>
            <span
              className={cn(
                "text-xs px-2 py-0.5 rounded-full",
                isRunning
                  ? "bg-green-500/10 text-green-400"
                  : "bg-gray-700 text-gray-400"
              )}
            >
              {s.status}
            </span>
            {s.pushStatus === "empowered" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                empowered
              </span>
            )}
            {s.pushStatus === "degraded" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400">
                degraded
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">PnL: </span>
              <span className={pnlColor}>
                {formatCurrency(s.totalPnl)}
                {s.totalPnlPct != null && (
                  <span className="ml-1 text-xs">({formatPct(s.totalPnlPct)})</span>
                )}
              </span>
            </div>
            {s.exchangeId && (
              <div>
                <span className="text-gray-500">Exchange: </span>
                <span className="text-gray-300">{s.exchangeId}</span>
              </div>
            )}
            {s.tradingMode && (
              <div>
                <span
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded",
                    s.tradingMode === "live"
                      ? "bg-yellow-500/10 text-yellow-400"
                      : "bg-gray-700 text-gray-400"
                  )}
                >
                  {s.tradingMode}
                </span>
              </div>
            )}
            <div className="text-gray-500 text-xs">{timeAgo(s.createdAt)}</div>
          </div>
        </Link>

        <div className="flex gap-2 ml-4">
          {isRunning ? (
            <button
              onClick={onStop}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={onRestart}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
            >
              Restart
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 text-gray-400 hover:bg-gray-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

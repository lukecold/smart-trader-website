import { Link } from "react-router-dom";
import {
  useDashboard,
  useStopStrategy,
  useDeleteStrategy,
  useRestartStrategy,
  useUnfollow,
  useStopCopyTrade,
} from "@/api/strategies";
import { formatCurrency, formatPct, timeAgo, cn } from "@/lib/utils";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useAuthStore } from "@/stores/auth";
import { useAuthModalStore } from "@/stores/authModal";
import type { DashboardItem, StrategyRelation } from "@/types/strategy";

const RELATION_LABEL: Record<StrategyRelation, string> = {
  own: "Yours",
  follow: "Following",
  copytrade: "Copy-trading",
  "follow+copytrade": "Following + Copy-trading",
};

const RELATION_STYLE: Record<StrategyRelation, string> = {
  own: "bg-blue-500/10 text-blue-400",
  follow: "bg-purple-500/10 text-purple-400",
  copytrade: "bg-amber-500/10 text-amber-400",
  "follow+copytrade": "bg-teal-500/10 text-teal-300",
};

export function Dashboard() {
  const { isAuthenticated } = useAuthStore();
  const { open } = useAuthModalStore();
  const { data, isLoading } = useDashboard();
  const stopMutation = useStopStrategy();
  const deleteMutation = useDeleteStrategy();
  const restartMutation = useRestartStrategy();
  const unfollowMutation = useUnfollow();
  const stopCopyTradeMutation = useStopCopyTrade();
  const { withAuth } = useAuthGuard();

  if (!isAuthenticated) {
    return (
      <div className="text-center py-24">
        <h2 className="text-2xl font-bold text-white">Welcome to Smart Trader</h2>
        <p className="text-sm text-gray-400 mt-2 max-w-md mx-auto">
          Sign in to see the strategies you own, follow, and copy-trade. Or browse
          the public{" "}
          <Link to="/leaderboard" className="text-blue-400 hover:text-blue-300">
            Leaderboard
          </Link>{" "}
          to discover strategies.
        </p>
        <button
          onClick={() => open()}
          className="mt-6 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors text-sm font-medium"
        >
          Log in
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-800 rounded w-48" />
        <div className="h-64 bg-gray-800 rounded" />
      </div>
    );
  }

  const strategies = data?.strategies ?? [];
  const ownCount = strategies.filter((s) => s.isOwner).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Strategies</h2>
          <p className="text-sm text-gray-400 mt-1">
            {strategies.length} total, {ownCount} owned
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
          <p className="text-sm mt-2">
            Create your first strategy, or follow one from the{" "}
            <Link to="/leaderboard" className="text-blue-400 hover:text-blue-300">
              Leaderboard
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {strategies.map((s) =>
            s.isOwner ? (
              <OwnCard
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
                onRestart={() =>
                  withAuth(() => restartMutation.mutate(s.strategyId))
                }
              />
            ) : (
              <FollowedCard
                key={s.strategyId}
                strategy={s}
                onUnfollow={() =>
                  withAuth(() => unfollowMutation.mutate(s.strategyId))
                }
                onStopCopyTrade={() =>
                  withAuth(() => stopCopyTradeMutation.mutate(s.strategyId))
                }
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function RelationBadge({ relation }: { relation: StrategyRelation }) {
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full",
        RELATION_STYLE[relation]
      )}
    >
      {RELATION_LABEL[relation]}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const isRunning = status === "running";
  return (
    <span
      className={cn(
        "w-2 h-2 rounded-full flex-shrink-0",
        isRunning ? "bg-green-500 animate-pulse" : "bg-gray-600"
      )}
    />
  );
}

// OWN card — rich info + management actions, links to full detail.
function OwnCard({
  strategy: s,
  onStop,
  onDelete,
  onRestart,
}: {
  strategy: DashboardItem;
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
          <div className="flex items-center gap-3 flex-wrap">
            <StatusDot status={s.status} />
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
            <RelationBadge relation={s.relation} />
            {s.public && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                Public
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-6 text-sm flex-wrap">
            <div>
              <span className="text-gray-500">PnL: </span>
              <span className={pnlColor}>
                {formatCurrency(s.totalPnl)}
                {s.totalPnlPct != null && (
                  <span className="ml-1 text-xs">
                    ({formatPct(s.totalPnlPct)})
                  </span>
                )}
              </span>
            </div>
            {s.exchangeId && (
              <div>
                <span className="text-gray-500">Exchange: </span>
                <span className="text-gray-300">{s.exchangeId}</span>
              </div>
            )}
            {s.modelId && (
              <div>
                <span className="text-gray-500">Model: </span>
                <span className="text-gray-300">{s.modelId}</span>
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

// FOLLOWED / COPY-TRADED card — redacted info only (% never currency), links to /view/:id.
function FollowedCard({
  strategy: s,
  onUnfollow,
  onStopCopyTrade,
}: {
  strategy: DashboardItem;
  onUnfollow: () => void;
  onStopCopyTrade: () => void;
}) {
  const isRunning = s.status === "running";
  const pctColor =
    s.totalPnlPct != null
      ? s.totalPnlPct >= 0
        ? "text-green-400"
        : "text-red-400"
      : "text-gray-500";

  const showFollow =
    s.relation === "follow" || s.relation === "follow+copytrade";
  const showCopyTrade =
    s.relation === "copytrade" || s.relation === "follow+copytrade";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between">
        <Link to={`/view/${s.strategyId}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusDot status={s.status} />
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
            <RelationBadge relation={s.relation} />
          </div>

          <div className="mt-3 flex items-center gap-6 text-sm flex-wrap">
            <div>
              <span className="text-gray-500">Return: </span>
              <span className={pctColor}>{formatPct(s.totalPnlPct)}</span>
            </div>
            {s.exchangeId && (
              <div>
                <span className="text-gray-500">Exchange: </span>
                <span className="text-gray-300">{s.exchangeId}</span>
              </div>
            )}
            {s.modelId && (
              <div>
                <span className="text-gray-500">Model: </span>
                <span className="text-gray-300">{s.modelId}</span>
              </div>
            )}
            {showCopyTrade && s.copyTradeAllocation != null && (
              <div>
                <span className="text-gray-500">Copy-trading: </span>
                <span className="text-amber-400">
                  {formatCurrency(s.copyTradeAllocation)}
                </span>
              </div>
            )}
          </div>
        </Link>

        <div className="flex gap-2 ml-4">
          {showFollow && (
            <button
              onClick={onUnfollow}
              className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
            >
              Unfollow
            </button>
          )}
          {showCopyTrade && (
            <button
              onClick={onStopCopyTrade}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              Stop copy-trade
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

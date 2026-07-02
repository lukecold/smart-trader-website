import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useLeaderboard,
  useFollow,
  useUnfollow,
  useCopyTrade,
  useStopCopyTrade,
} from "@/api/strategies";
import { formatPct, cn } from "@/lib/utils";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { CopyTradeModal } from "@/components/strategy/CopyTradeModal";
import { Sparkline } from "@/components/strategy/Sparkline";
import { RangeSelector, isLeaderboardRange } from "@/components/strategy/RangeSelector";
import type { LeaderboardItem, LeaderboardRange } from "@/types/strategy";

// Persist the leaderboard's selected window across reloads. Its own key — the
// detail chart's range set differs (MTD/YTD/ALL vs 3Y) — so they don't clobber
// each other. Falls back to "1M" on first load or an invalid/missing value.
const RANGE_STORAGE_KEY = "smart-trader:leaderboard-range";
function loadStoredRange(): LeaderboardRange {
  try {
    const v = localStorage.getItem(RANGE_STORAGE_KEY);
    if (isLeaderboardRange(v)) return v;
  } catch {
    /* localStorage unavailable — use default */
  }
  return "1M";
}
function storeRange(r: LeaderboardRange): void {
  try {
    localStorage.setItem(RANGE_STORAGE_KEY, r);
  } catch {
    /* ignore persistence failures */
  }
}

export function Leaderboard() {
  // Restore the last-selected range on load; persist every change.
  const [range, setRangeState] = useState<LeaderboardRange>(loadStoredRange);
  const setRange = (r: LeaderboardRange) => {
    setRangeState(r);
    storeRange(r);
  };
  const { data, isLoading } = useLeaderboard(range);
  const navigate = useNavigate();
  const { withAuth } = useAuthGuard();

  const followMutation = useFollow();
  const unfollowMutation = useUnfollow();
  const copyTradeMutation = useCopyTrade();
  const uncopyTradeMutation = useStopCopyTrade();

  // Copy-trade modal target (null = closed).
  const [copyTradeTarget, setCopyTradeTarget] = useState<LeaderboardItem | null>(
    null
  );

  const strategies = data?.strategies ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
          <p className="text-sm text-gray-400 mt-1">
            Public strategies ranked by return over the selected window.
          </p>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-gray-800 rounded" />
          <div className="h-16 bg-gray-800 rounded" />
          <div className="h-16 bg-gray-800 rounded" />
        </div>
      ) : strategies.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">No public strategies yet</p>
          <p className="text-sm mt-2 max-w-md mx-auto">
            Strategies appear here once their owner makes them public. Publish one
            of your own from its detail page to show up on the leaderboard.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {strategies.map((s, i) => (
            <LeaderboardRow
              key={s.strategyId}
              rank={i + 1}
              strategy={s}
              onOpen={() => navigate(`/view/${s.strategyId}?range=${range}`)}
              onFollow={() =>
                withAuth(() => followMutation.mutate(s.strategyId))
              }
              onUnfollow={() =>
                withAuth(() => unfollowMutation.mutate(s.strategyId))
              }
              onCopyTrade={() => withAuth(() => setCopyTradeTarget(s))}
              onStopCopyTrade={() =>
                withAuth(() => uncopyTradeMutation.mutate(s.strategyId))
              }
            />
          ))}
        </div>
      )}

      {copyTradeTarget && (
        <CopyTradeModal
          name={
            copyTradeTarget.strategyName ||
            copyTradeTarget.strategyId.slice(0, 20)
          }
          onCancel={() => setCopyTradeTarget(null)}
          onConfirm={(p) => {
            copyTradeMutation.mutate(
              { id: copyTradeTarget.strategyId, ...p },
              {
                onSuccess: (data) => {
                  if (data?.warning) alert(data.warning);
                },
              }
            );
            setCopyTradeTarget(null);
          }}
        />
      )}
    </div>
  );
}

function LeaderboardRow({
  rank,
  strategy: s,
  onOpen,
  onFollow,
  onUnfollow,
  onCopyTrade,
  onStopCopyTrade,
}: {
  rank: number;
  strategy: LeaderboardItem;
  onOpen: () => void;
  onFollow: () => void;
  onUnfollow: () => void;
  onCopyTrade: () => void;
  onStopCopyTrade: () => void;
}) {
  const rangeColor =
    s.rangeReturnPct != null
      ? s.rangeReturnPct >= 0
        ? "text-green-400"
        : "text-red-400"
      : "text-gray-500";

  // Stop row-navigation when clicking an action button.
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div
      onClick={onOpen}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors cursor-pointer flex items-center gap-4"
    >
      <div className="w-8 text-center text-lg font-bold text-gray-500 flex-shrink-0">
        {rank}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-white font-medium truncate">
            {s.strategyName || s.strategyId.slice(0, 20)}
          </h3>
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              s.status === "running"
                ? "bg-green-500/10 text-green-400"
                : "bg-gray-700 text-gray-400"
            )}
          >
            {s.status}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          {s.exchangeId && <span>{s.exchangeId}</span>}
          {s.modelId && <span>{s.modelId}</span>}
          <span>
            Since inception:{" "}
            <span
              className={cn(
                s.totalPnlPct != null && s.totalPnlPct >= 0
                  ? "text-green-500"
                  : "text-red-500"
              )}
            >
              {formatPct(s.totalPnlPct)}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <Sparkline points={s.sparkline} />
        <div className="text-right">
          <div className={cn("text-xl font-bold", rangeColor)}>
            {formatPct(s.rangeReturnPct)}
          </div>
          <div className="text-xs text-gray-500">range return</div>
        </div>
      </div>

      <div className="flex gap-2 ml-2 flex-shrink-0">
        {s.isFollowing ? (
          <button
            onClick={stop(onUnfollow)}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors"
          >
            Following
          </button>
        ) : (
          <button
            onClick={stop(onFollow)}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Follow
          </button>
        )}
        {s.isCopyTrading ? (
          <button
            onClick={stop(onStopCopyTrade)}
            className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
          >
            Copy-trading
          </button>
        ) : (
          <button
            onClick={stop(onCopyTrade)}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            Copy-trade
          </button>
        )}
      </div>
    </div>
  );
}


import { useDashboard, useSetVisibility } from "@/api/strategies";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { cn } from "@/lib/utils";

// Public / Private toggle — rendered only for the strategy's owner. Ownership +
// current public state are derived from the authed dashboard query (which
// includes the user's own strategies with an `isOwner` + `public` flag), so no
// extra endpoint is needed.
export function VisibilityToggle({ id }: { id: string }) {
  const { data } = useDashboard();
  const setVisibility = useSetVisibility();
  const { withAuth } = useAuthGuard();

  const item = data?.strategies.find((s) => s.strategyId === id);
  if (!item || !item.isOwner) return null;

  const isPublic = item.public;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Visibility</span>
      <button
        onClick={() =>
          withAuth(() => setVisibility.mutate({ id, public: !isPublic }))
        }
        disabled={setVisibility.isPending}
        className={cn(
          "text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50",
          isPublic
            ? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
            : "bg-gray-700 text-gray-300 hover:bg-gray-600"
        )}
      >
        {setVisibility.isPending ? "Saving…" : isPublic ? "Public" : "Private"}
      </button>
      <InfoTooltip />
    </div>
  );
}

// Dependency-free accessible tooltip: focusable trigger + group-hover/focus reveal.
function InfoTooltip() {
  return (
    <span className="relative group inline-flex">
      <button
        type="button"
        aria-label="What do Public and Private mean?"
        className="w-5 h-5 rounded-full bg-gray-700 text-gray-300 text-xs font-bold flex items-center justify-center hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-7 z-50 w-72 rounded-lg border border-gray-700 bg-gray-950 p-3 text-xs leading-relaxed text-gray-300 shadow-xl opacity-0 invisible transition-opacity group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible"
      >
        <span className="block mb-1">
          <span className="text-green-400 font-medium">Public:</span> your strategy
          appears on the Leaderboard and others can follow or copy-trade it — they see
          your performance in % and open positions as ticker + direction + PnL %
          only, never your capital, sizes, prompt, or decision history.
        </span>
        <span className="block">
          <span className="text-gray-200 font-medium">Private:</span> only you can
          see it.
        </span>
      </span>
    </span>
  );
}

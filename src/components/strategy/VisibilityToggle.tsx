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
  const pending = setVisibility.isPending;
  // The mutation isn't optimistic — `isPublic` only updates once the refetch
  // lands. While pending we already know the target (the user just flipped it),
  // so reflect it immediately: the knob slides the moment they click, and rolls
  // back on error when `pending` clears and `isPublic` reverts to its old value.
  const shown = pending ? !isPublic : isPublic;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Visibility</span>
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        aria-busy={pending}
        aria-label={`Strategy visibility: ${shown ? "public" : "private"}`}
        onClick={() =>
          withAuth(() => setVisibility.mutate({ id, public: !isPublic }))
        }
        disabled={pending}
        className={cn(
          "relative inline-flex h-7 w-[84px] shrink-0 items-center rounded-full",
          "transition-colors duration-200 ease-in-out",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70",
          "disabled:cursor-not-allowed disabled:opacity-60",
          shown ? "bg-green-500" : "bg-gray-600"
        )}
      >
        {/* State label, pinned to the side opposite the knob. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 flex items-center text-[11px] font-semibold",
            "transition-colors duration-200",
            shown ? "left-3 text-white" : "right-3 text-gray-100"
          )}
        >
          {shown ? "Public" : "Private"}
        </span>
        {/* Sliding knob. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0.5 h-6 w-6 rounded-full bg-white shadow-sm",
            "transform transition-transform duration-200 ease-in-out motion-reduce:transition-none",
            shown ? "translate-x-[56px]" : "translate-x-0"
          )}
        />
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

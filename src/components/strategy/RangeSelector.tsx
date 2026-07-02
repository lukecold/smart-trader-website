import { cn } from "@/lib/utils";
import { RANGES, type LeaderboardRange } from "@/lib/ranges";

// RangeSelector is the segmented time-window control used by the leaderboard and
// the redacted-view chart. The range domain (set, default, helpers) lives in
// @/lib/ranges — this component only renders it.
export function RangeSelector({
  value,
  onChange,
  className,
}: {
  value: LeaderboardRange;
  onChange: (r: LeaderboardRange) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex rounded-lg bg-gray-800/80 p-0.5 gap-0.5", className)}>
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            "px-3 py-1.5 rounded text-xs font-medium transition-colors",
            value === r
              ? "bg-gray-600 text-white"
              : "text-gray-400 hover:text-gray-200"
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

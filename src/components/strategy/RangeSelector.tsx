import { cn } from "@/lib/utils";
import type { LeaderboardRange } from "@/types/strategy";

// The zoom windows shared by the leaderboard and the strategy detail chart.
export const RANGES: LeaderboardRange[] = ["1W", "1M", "3M", "1Y", "3Y"];

const DAY = 24 * 60 * 60 * 1000;

// rangeToMs mirrors the backend rangeToDuration (social.go) so the client-side
// chart window matches the leaderboard's range-return computation exactly.
export function rangeToMs(range: LeaderboardRange): number {
  switch (range) {
    case "1W":
      return 7 * DAY;
    case "1M":
      return 30 * DAY;
    case "3M":
      return 90 * DAY;
    case "1Y":
      return 365 * DAY;
    case "3Y":
      return 3 * 365 * DAY;
  }
}

// isLeaderboardRange narrows an untrusted string (e.g. a URL param) to a valid range.
export function isLeaderboardRange(v: string | null | undefined): v is LeaderboardRange {
  return v != null && (RANGES as string[]).includes(v);
}

// RangeSelector is the segmented time-window control used by the leaderboard and
// the strategy detail chart, so both offer the identical set of zooms.
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

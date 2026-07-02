// Single source of truth for the leaderboard / redacted-view performance window.
// Everything about a "range" — the valid set, the type, the default, the URL param,
// the storage key, and the lookback duration — is defined here exactly once. No
// component should hardcode a range value, a default, or these keys inline.

// The canonical set. The type is derived from it, so adding/removing a window is a
// one-line change here (and the exhaustive RANGE_MS below will fail to compile until
// its mapping is updated).
export const RANGES = ["1W", "1M", "3M", "1Y", "3Y"] as const;
export type LeaderboardRange = (typeof RANGES)[number];

// Default window when none has been stored or passed in.
export const DEFAULT_RANGE: LeaderboardRange = "1M";

// URL query-param key that carries the window from the leaderboard into the view.
export const RANGE_PARAM = "range";

// localStorage key that persists the leaderboard's chosen window across reloads.
// Its own key — the detail chart's range set differs — so they never clobber.
export const RANGE_STORAGE_KEY = "smart-trader:leaderboard-range";

const DAY_MS = 24 * 60 * 60 * 1000;

// Lookback per window. Record<LeaderboardRange, …> makes this exhaustive: a new
// range in RANGES that isn't mapped here is a compile error, not a silent default.
// Mirrors the backend rangeToDuration (social.go).
const RANGE_MS: Record<LeaderboardRange, number> = {
  "1W": 7 * DAY_MS,
  "1M": 30 * DAY_MS,
  "3M": 90 * DAY_MS,
  "1Y": 365 * DAY_MS,
  "3Y": 3 * 365 * DAY_MS,
};

export function rangeToMs(range: LeaderboardRange): number {
  return RANGE_MS[range];
}

// Narrows an untrusted string (URL param, localStorage value) to a valid range.
export function isLeaderboardRange(v: string | null | undefined): v is LeaderboardRange {
  return v != null && (RANGES as readonly string[]).includes(v);
}

// Restore the leaderboard's last-selected window; falls back to DEFAULT_RANGE on a
// missing/invalid value or when localStorage is unavailable.
export function loadStoredRange(): LeaderboardRange {
  try {
    const v = localStorage.getItem(RANGE_STORAGE_KEY);
    if (isLeaderboardRange(v)) return v;
  } catch {
    /* localStorage unavailable — use default */
  }
  return DEFAULT_RANGE;
}

export function storeRange(r: LeaderboardRange): void {
  try {
    localStorage.setItem(RANGE_STORAGE_KEY, r);
  } catch {
    /* ignore persistence failures */
  }
}

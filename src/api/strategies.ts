import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { useAuthStore } from "@/stores/auth";
import type {
  StrategyList,
  Holding,
  PortfolioSummary,
  StrategyPerformance,
  ComposeCycle,
  Prompt,
  PromptVersion,
  CreateStrategyInput,
  DashboardResponse,
  LeaderboardResponse,
  LeaderboardRange,
  RedactedView,
} from "@/types/strategy";

const KEYS = {
  list: ["strategies"] as const,
  detail: (id: string) => ["strategy", id] as const,
  holdings: (id: string) => ["strategy", id, "holdings"] as const,
  portfolio: (id: string) => ["strategy", id, "portfolio"] as const,
  performance: (id: string) => ["strategy", id, "performance"] as const,
  cycles: (id: string) => ["strategy", id, "cycles"] as const,
  prompts: ["prompts"] as const,
  dashboard: ["dashboard"] as const,
  leaderboard: (range: LeaderboardRange) => ["leaderboard", range] as const,
  redacted: (id: string) => ["redacted", id] as const,
};

export function useStrategies(status?: string) {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: async () => {
      const params = status ? `?status=${status}` : "";
      const res = await api.get<StrategyList>(`/strategies/${params}`);
      return res.data;
    },
    refetchInterval: 5000,
  });
}

export function usePushStatus(id: string) {
  const { data } = useStrategies();
  const s = data?.strategies.find((s) => s.strategyId === id);
  return s?.pushStatus ?? null;
}

/** Returns the live run status ("running" / "stopped" / …) for a strategy,
 *  derived from the polled strategy list, or null until it loads. */
export function useStrategyStatus(id: string) {
  const { data } = useStrategies();
  const s = data?.strategies.find((s) => s.strategyId === id);
  return s?.status ?? null;
}

export function useStrategyPerformance(id: string) {
  return useQuery({
    queryKey: KEYS.performance(id),
    queryFn: async () => {
      const res = await api.get<StrategyPerformance>(
        `/strategies/performance?id=${id}`
      );
      return res.data;
    },
    enabled: !!id,
  });
}

export function useStrategyHoldings(id: string) {
  return useQuery({
    queryKey: KEYS.holdings(id),
    queryFn: async () => {
      const res = await api.get<Holding[]>(`/strategies/holding?id=${id}`);
      return res.data;
    },
    enabled: !!id,
    refetchInterval: 10000,
  });
}

export function usePortfolioSummary(id: string) {
  return useQuery({
    queryKey: KEYS.portfolio(id),
    queryFn: async () => {
      const res = await api.get<PortfolioSummary>(
        `/strategies/portfolio_summary?id=${id}`
      );
      return res.data;
    },
    enabled: !!id,
    refetchInterval: 10000,
  });
}

export function useStrategyDetail(id: string) {
  return useQuery({
    queryKey: KEYS.cycles(id),
    queryFn: async () => {
      const res = await api.get<ComposeCycle[]>(`/strategies/detail?id=${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function usePrompts() {
  return useQuery({
    queryKey: KEYS.prompts,
    queryFn: async () => {
      const res = await api.get<Prompt[]>("/strategies/prompts/");
      return res.data;
    },
  });
}

export function useCreateStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStrategyInput) => {
      const res = await api.post<{ strategyId: string }>(
        "/strategies/create",
        input
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

// Replicate an owned strategy into a new one (owner only). The backend copies
// the FULL stored config — prompt text, risk config, candle configs, symbols —
// and applies the overrides, so the replica behaves exactly like the source
// until edited. Classic use: clone a live strategy into "virtual" (paper) mode
// on a different model to A/B-test it. The replica starts running immediately.
// Business errors arrive as HTTP 200 with a non-zero envelope code.
export interface ReplicateStrategyInput {
  id: string;
  strategy_name?: string;
  provider?: string;
  model_id?: string;
  api_key?: string;
  trading_mode?: "live" | "virtual";
  initial_capital?: number;
}

export function useReplicateStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReplicateStrategyInput) => {
      const res = await api.post<{ strategyId: string }>(
        "/strategies/replicate",
        input
      );
      if (res.code !== 0) {
        throw new Error(res.msg || "Failed to replicate strategy");
      }
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function useFetchBalance() {
  return useMutation({
    mutationFn: async (payload: {
      exchange_id: string;
      api_key: string;
      secret_key: string;
      passphrase?: string;
      market_type?: string;
    }) => {
      const res = await api.post<{ freeBalance: number; totalBalance: number }>(
        "/strategies/fetch-balance",
        payload
      );
      return res.data;
    },
  });
}

// The permission set Binance has recorded for an API key, camelized from the
// backend's /strategies/validate-credentials response.
export interface BinanceApiRestrictions {
  createTime: number;
  enableFutures: boolean;
  enableMargin: boolean;
  enableReading: boolean;
  enableSpotAndMarginTrading: boolean;
  enableWithdrawals: boolean;
  ipRestrict: boolean;
}

export function useValidateBinanceCredentials() {
  return useMutation({
    mutationFn: async (payload: {
      exchange_id: string;
      api_key: string;
      secret_key: string;
    }) => {
      const res = await api.post<BinanceApiRestrictions>(
        "/strategies/validate-credentials",
        payload
      );
      if (res.code !== 0) throw new Error(res.msg || "Validation failed");
      return res.data;
    },
  });
}

// Static context for the Binance onboarding wizard: the IP users must
// whitelist on their API key, plus Binance deep links. Only fetched while the
// wizard is mounted; the values change at most on redeploy.
export function useBinanceOnboardingInfo() {
  return useQuery({
    queryKey: ["onboarding", "binance"],
    queryFn: async () => {
      const res = await api.get<{
        apiManagementUrl: string;
        registerUrl: string;
        whitelistIp: string;
      }>("/onboarding/binance");
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useEquityCurve(id: string) {
  return useQuery({
    queryKey: ["strategy", id, "equity"] as const,
    queryFn: async () => {
      const res = await api.get<{ ts: number; totalValue: number }[]>(
        `/strategies/equity?id=${id}`
      );
      return res.data;
    },
    enabled: !!id,
    refetchInterval: 30000,
  });
}

export function useStopStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/strategies/stop?id=${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useDeleteStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/strategies/delete?id=${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function useRestartStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/strategies/restart?id=${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
  });
}

export function usePromptHistory(id: string) {
  return useQuery({
    queryKey: ["strategy", id, "prompt-history"] as const,
    queryFn: async () => {
      const res = await api.get<PromptVersion[]>(
        `/strategies/prompt-history?id=${id}`
      );
      return res.data;
    },
    enabled: !!id,
  });
}

export function useClosePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, symbol }: { id: string; symbol: string }) => {
      await api.post(`/strategies/close-position?id=${id}&symbol=${encodeURIComponent(symbol)}`);
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.holdings(id) });
      qc.invalidateQueries({ queryKey: KEYS.portfolio(id) });
    },
  });
}

export function useUpdatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      prompt,
      note,
    }: {
      id: string;
      prompt: string;
      note?: string;
    }) => {
      await api.post("/strategies/update-prompt", {
        id,
        prompt,
        note: note || "manual edit",
      });
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({
        queryKey: ["strategy", id, "prompt-history"],
      });
      qc.invalidateQueries({
        queryKey: ["strategy", id, "performance"],
      });
    },
  });
}

interface ProviderModelsResponse {
  provider: string;
  models: string[];
  // True when the server holds an env API key for the provider; then a blank
  // user key falls back to the server key. When false, a key must be entered.
  serverKeyConfigured: boolean;
}

async function fetchProviderModels(
  provider: string
): Promise<ProviderModelsResponse> {
  const res = await api.get<ProviderModelsResponse>(
    `/strategies/models?provider=${encodeURIComponent(provider)}`
  );
  return res.data ?? { provider, models: [], serverKeyConfigured: false };
}

// Available LLM models for a provider, discovered from the provider's /models
// endpoint. The backend caches per provider for 24h and re-pulls on the first
// request after that, so selecting a provider transparently gets a fresh list at
// most once a day. Falls back to a hardcoded list server-side if a provider has no
// key / is unreachable, so this never returns empty for a known provider.
export function useProviderModels(provider: string) {
  return useQuery({
    queryKey: ["models", provider],
    queryFn: () => fetchProviderModels(provider),
    select: (d) => d.models,
    enabled: !!provider,
    staleTime: 24 * 60 * 60 * 1000, // server owns the 24h freshness; don't refetch within a session
  });
}

// Whether the server has an env API key configured for the provider. Shares the
// ["models", provider] query with useProviderModels, so it adds no extra fetch.
export function useProviderServerKeyConfigured(provider: string) {
  return useQuery({
    queryKey: ["models", provider],
    queryFn: () => fetchProviderModels(provider),
    select: (d) => d.serverKeyConfigured,
    enabled: !!provider,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

// Rename a strategy (owner only). The backend enforces a 30-day cooldown between
// renames. NOTE: the API returns business errors as HTTP 200 with a non-zero
// envelope `code` + `msg` (cooldown / not-owner / invalid), so we must inspect the
// envelope rather than the HTTP status to surface the reason to the user.
export function useRenameStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await api.post<null>("/strategies/rename", { id, name });
      if (res.code !== 0) {
        throw new Error(res.msg || "Failed to rename strategy");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list });
      qc.invalidateQueries({ queryKey: KEYS.dashboard });
    },
  });
}

export function usePruneSnapshots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, minValue }: { id: string; minValue: number }) => {
      const res = await api.delete<{ deleted: number }>(
        `/strategies/snapshots?id=${id}&min_value=${minValue}`
      );
      return res.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["strategy", id, "equity"] });
      qc.invalidateQueries({ queryKey: KEYS.portfolio(id) });
      qc.invalidateQueries({ queryKey: KEYS.performance(id) });
    },
  });
}

// ----- Social: follow / copy-trade / leaderboard / redacted view -----

/** Scoped dashboard: own + followed + copy-traded strategies. Auth-only. */
export function useDashboard() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: KEYS.dashboard,
    queryFn: async () => {
      const res = await api.get<DashboardResponse>("/strategies/dashboard");
      return res.data;
    },
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });
}

/** Leaderboard for a time window. Works logged-out; personalized when logged in. */
export function useLeaderboard(range: LeaderboardRange) {
  return useQuery({
    queryKey: KEYS.leaderboard(range),
    queryFn: async () => {
      const res = await api.get<LeaderboardResponse>(
        `/strategies/leaderboard?range=${range}`
      );
      return res.data;
    },
    refetchInterval: 15000,
  });
}

/** Redacted follow-view of a strategy (no capital/sizes). */
export function useRedactedView(id: string) {
  return useQuery({
    queryKey: KEYS.redacted(id),
    queryFn: async () => {
      const res = await api.get<RedactedView | null>(
        `/strategies/redacted?id=${id}`
      );
      return res.data;
    },
    enabled: !!id,
    refetchInterval: 10000,
  });
}

// Invalidate every query that could reflect a follow/copy-trade/visibility change.
function invalidateSocial(qc: ReturnType<typeof useQueryClient>, id?: string) {
  qc.invalidateQueries({ queryKey: KEYS.dashboard });
  qc.invalidateQueries({ queryKey: ["leaderboard"] });
  if (id) qc.invalidateQueries({ queryKey: KEYS.redacted(id) });
}

export function useFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post("/strategies/follow", { strategy_id: id });
    },
    onSuccess: (_, id) => invalidateSocial(qc, id),
  });
}

export function useUnfollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/strategies/follow?strategy_id=${id}`);
    },
    onSuccess: (_, id) => invalidateSocial(qc, id),
  });
}

export interface CopyTradeInput {
  id: string;
  allocation: number;
  mode?: "paper" | "live";
  onConstraint?: "skip" | "partial";
  apiKey?: string;
  apiSecret?: string;
}

export function useCopyTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CopyTradeInput) => {
      const res = await api.post<{ mode: string; warning?: string }>(
        "/strategies/copy-trade",
        {
          strategy_id: input.id,
          allocation: input.allocation,
          mode: input.mode ?? "paper",
          on_constraint: input.onConstraint ?? "skip",
          // Credentials are sent only for live; the backend seals them into an
          // encrypted vault and never echoes or stores them in plaintext.
          api_key: input.apiKey,
          api_secret: input.apiSecret,
        }
      );
      return res.data;
    },
    onSuccess: (_, { id }) => invalidateSocial(qc, id),
  });
}

export function useStopCopyTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/strategies/copy-trade?strategy_id=${id}`);
    },
    onSuccess: (_, id) => invalidateSocial(qc, id),
  });
}

export function useSetVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, public: isPublic }: { id: string; public: boolean }) => {
      await api.post("/strategies/visibility", {
        strategy_id: id,
        public: isPublic,
      });
    },
    onSuccess: (_, { id }) => invalidateSocial(qc, id),
  });
}

// --- User-editable strategy config (owner only) ---

// NOTE: the api client camelizes response keys; request bodies stay snake_case.

// A named ticker group with its own holdings caps (fractions of equity; 0 = uncapped).
// The categorization is manual: a ticker is "high volatility" iff it's listed here.
export interface SymbolGroupView {
  name: string;
  symbols: string[];
  perSymbolCap: number; // max in ONE ticker of this group, as a fraction of equity
  combinedCap: number; // max across ALL tickers of this group
}

// The read-only engine rules, at their EFFECTIVE values (defaults merged with any
// per-strategy overrides). Surfaced for visibility only — not editable in this release.
export interface EngineRules {
  bounceGateEnabled: boolean;
  bounceGatePriceVsEma20Pct: number;
  bounceGateRecoveryPct: number;
  trendBand: number;
  trendSlopeMin: number;
  trendSlopeLookback: number;
  trendConfirmCycles: number;
  stopTriggerEnabled: boolean;
  minStopDistancePct: number;
  trailLockPct: number;
  trailExitEnabled: boolean;
  trailActivatePct: number;
  trailAtrMult: number;
  trailDistPct: number;
  trailDistMaxPct: number;
  backstopTpPct: number;
  reversalExitEnabled: boolean;
  reversalScaleOutPct: number;
  reversalRemainderCycles: number;
  decisionGateEnabled: boolean;
  llmPrefilterEnabled: boolean;
  srEnabled: boolean;
  srClusterTolAtr: number;
  srResNearPct: number;
  gatePnlBandPct: number;
  gateHeartbeatCycles: number;
}

// The strategy's explicit trade-notification config. The Discord webhook comes
// back in full (it is the owner's own channel URL); the Slack token only masked.
export interface NotificationConfigView {
  channel: "discord" | "slack";
  webhookUrl?: string;
  apiKeyMasked?: string;
  target?: string;
}

export interface StrategyConfigView {
  maxLeverage: number | null;
  decideIntervalSeconds: number | null;
  modelId: string | null;
  modelProvider: string | null;
  symbols: string[] | null;
  symbolGroups: SymbolGroupView[] | null;
  // Trend-signal EMA periods (effective values; defaults 20/50). Editable, but
  // calibrated — the backend enforces fast < slow and 2..400 bounds.
  trendEmaFast: number | null;
  trendEmaSlow: number | null;
  // First characters + **** ("" when unset) — enough to recognize the key.
  llmApiKeyMasked: string;
  // Explicit per-strategy notifications; null = the strategy does not notify.
  notification: NotificationConfigView | null;
  // read-only structural + rules
  exchangeId: string | null;
  tradingMode: string | null;
  initialCapital: number | null;
  maxPositions: number | null;
  capFactor: number | null;
  strategyType: string | null;
  rules: EngineRules | null;
}

// Request bodies stay snake_case (the client only camelizes responses).
export interface SymbolGroupInput {
  name: string;
  symbols: string[];
  per_symbol_cap: number;
  combined_cap: number;
}

export interface UpdateStrategyConfigInput {
  id: string;
  max_leverage?: number;
  decide_interval_seconds?: number;
  model_id?: string;
  model_provider?: string;
  // LLM api key — sent only when the owner types a new one (never echoed back).
  api_key?: string;
  // Trade-notification channel; {channel:""} explicitly disables notifications.
  notification?: {
    channel: string;
    webhook_url?: string; // discord
    api_key?: string; // slack bot token (omit to keep the stored one)
    target?: string; // slack channel
  };
  symbols?: string[];
  symbol_groups?: SymbolGroupInput[];
  trend_ema_fast?: number;
  trend_ema_slow?: number;
}

// Whitelisted editable config (cadence, leverage, model). 403s for non-owners —
// callers should gate on ownership (useDashboard isOwner) before enabling this.
export function useStrategyConfig(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["strategy", id, "config"],
    queryFn: async () => {
      const res = await api.get<StrategyConfigView>(
        `/strategies/config?id=${encodeURIComponent(id)}`
      );
      if (res.code !== 0) throw new Error(res.msg || "Failed to load config");
      return res.data;
    },
    enabled,
  });
}

// Edits persist AND hot-apply to the live strategy (cadence within one old
// interval, model on the next LLM cycle, leverage immediately). Business errors
// arrive as HTTP 200 with a non-zero envelope code.
export function useUpdateStrategyConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateStrategyConfigInput) => {
      const res = await api.post<StrategyConfigView>("/strategies/update-config", input);
      if (res.code !== 0) throw new Error(res.msg || "Failed to update config");
      return res.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["strategy", id, "config"] });
      qc.invalidateQueries({ queryKey: KEYS.performance(id) });
      qc.invalidateQueries({ queryKey: KEYS.list });
    },
  });
}

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

// Available LLM models for a provider, discovered from the provider's /models
// endpoint. The backend caches per provider for 24h and re-pulls on the first
// request after that, so selecting a provider transparently gets a fresh list at
// most once a day. Falls back to a hardcoded list server-side if a provider has no
// key / is unreachable, so this never returns empty for a known provider.
export function useProviderModels(provider: string) {
  return useQuery({
    queryKey: ["models", provider],
    queryFn: async () => {
      const res = await api.get<{ provider: string; models: string[] }>(
        `/strategies/models?provider=${encodeURIComponent(provider)}`
      );
      return res.data?.models ?? [];
    },
    enabled: !!provider,
    staleTime: 24 * 60 * 60 * 1000, // server owns the 24h freshness; don't refetch within a session
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

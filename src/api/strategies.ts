import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  StrategyList,
  Holding,
  PortfolioSummary,
  StrategyPerformance,
  ComposeCycle,
  Prompt,
  PromptVersion,
  CreateStrategyInput,
} from "@/types/strategy";

const KEYS = {
  list: ["strategies"] as const,
  detail: (id: string) => ["strategy", id] as const,
  holdings: (id: string) => ["strategy", id, "holdings"] as const,
  portfolio: (id: string) => ["strategy", id, "portfolio"] as const,
  performance: (id: string) => ["strategy", id, "performance"] as const,
  cycles: (id: string) => ["strategy", id, "cycles"] as const,
  prompts: ["prompts"] as const,
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

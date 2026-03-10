import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  StrategyList,
  Holding,
  PortfolioSummary,
  StrategyPerformance,
  ComposeCycle,
  Prompt,
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
      const res = await api.post<{ strategy_id: string }>(
        "/strategies/create",
        input
      );
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.list }),
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

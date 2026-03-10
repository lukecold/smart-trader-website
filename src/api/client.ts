import { useAuthStore } from "@/stores/auth";

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

const BASE_URL = "/api/v1";

// Recursively convert snake_case object keys to camelCase.
function camelize(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function camelizeKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(camelizeKeys);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([key, val]) => [
        camelize(key),
        camelizeKeys(val),
      ])
    );
  }
  return obj;
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  // Inject session token if available
  const { sessionToken, clearAuth } = useAuthStore.getState();
  const authHeader: Record<string, string> = sessionToken
    ? { Authorization: `Bearer ${sessionToken}` }
    : {};

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...options?.headers,
    },
    ...options,
  });

  // Session expired or invalid — clear local auth state
  if (res.status === 401) {
    clearAuth();
    throw new Error("Authentication required");
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  return camelizeKeys(json) as ApiResponse<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) =>
    request<T>(path, { method: "DELETE" }),
};

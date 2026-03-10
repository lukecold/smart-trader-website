import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  email: string | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  setAuth: (email: string, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      email: null,
      sessionToken: null,
      isAuthenticated: false,

      setAuth: (email, token) =>
        set({ email, sessionToken: token, isAuthenticated: true }),

      clearAuth: () =>
        set({ email: null, sessionToken: null, isAuthenticated: false }),
    }),
    {
      name: "smart_trader_auth",
    }
  )
);

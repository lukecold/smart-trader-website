import { useCallback } from "react";
import { useAuthStore } from "@/stores/auth";
import { useAuthModalStore } from "@/stores/authModal";

/**
 * Returns `withAuth(action)` — runs the action immediately if the user is
 * authenticated, otherwise opens the login modal and queues the action to run
 * automatically after a successful login.
 */
export function useAuthGuard() {
  const { isAuthenticated } = useAuthStore();
  const { open } = useAuthModalStore();

  const withAuth = useCallback(
    (action: () => void) => {
      if (isAuthenticated) {
        action();
      } else {
        open(action);
      }
    },
    [isAuthenticated, open]
  );

  return { withAuth };
}

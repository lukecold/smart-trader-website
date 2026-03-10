import { create } from "zustand";

interface AuthModalState {
  isOpen: boolean;
  /** Action to execute once the user has authenticated. */
  pendingAction: (() => void) | null;
  open: (action?: () => void) => void;
  close: () => void;
}

export const useAuthModalStore = create<AuthModalState>()((set) => ({
  isOpen: false,
  pendingAction: null,

  open: (action) =>
    set({ isOpen: true, pendingAction: action ?? null }),

  close: () =>
    set({ isOpen: false, pendingAction: null }),
}));

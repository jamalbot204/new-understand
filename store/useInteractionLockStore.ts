import { create } from 'zustand';

interface InteractionLockState {
  isLocked: boolean;
  activateLock: (duration?: number) => void;
}

export const useInteractionLockStore = create<InteractionLockState>((set) => ({
  isLocked: false,
  activateLock: (duration = 500) => { // 500ms is a safe default
    set({ isLocked: true });
    setTimeout(() => {
      set({ isLocked: false });
    }, duration);
  },
}));

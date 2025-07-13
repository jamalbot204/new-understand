
import { create } from 'zustand';

interface SelectionState {
  isSelectionModeActive: boolean;
  selectedMessageIds: Set<string>;
  toggleSelectionMode: () => void;
  toggleMessageSelection: (messageId: string) => void;
  clearSelection: () => void;
  selectAllVisible: (visibleMessageIds: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  isSelectionModeActive: false,
  selectedMessageIds: new Set(),

  clearSelection: () => {
    set({ selectedMessageIds: new Set() });
  },

  toggleSelectionMode: () => {
    const isNowActive = !get().isSelectionModeActive;
    if (!isNowActive) {
      get().clearSelection();
    }
    set({ isSelectionModeActive: isNowActive });
  },

  toggleMessageSelection: (messageId: string) => {
    set(state => {
      const newSet = new Set(state.selectedMessageIds);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return { selectedMessageIds: newSet };
    });
  },

  selectAllVisible: (visibleMessageIds: string[]) => {
    set({ selectedMessageIds: new Set(visibleMessageIds) });
  },
}));

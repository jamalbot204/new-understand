
import { create } from 'zustand';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useToastStore } from './useToastStore.ts';

interface ChatTitleEditingState {
  editingTitleInfo: {
    id: string | null;
    value: string;
  };
  startEditingTitle: (id: string, value: string) => void;
  setEditingTitleValue: (value: string) => void;
  cancelEditingTitle: () => void;
  saveChatTitle: () => Promise<void>;
}

const initialState = { id: null, value: '' };

export const useChatTitleStore = create<ChatTitleEditingState>((set, get) => ({
  editingTitleInfo: initialState,
  startEditingTitle: (id, value) => set({ editingTitleInfo: { id, value } }),
  setEditingTitleValue: (value) => set(state => ({ editingTitleInfo: { ...state.editingTitleInfo, value } })),
  cancelEditingTitle: () => set({ editingTitleInfo: initialState }),
  saveChatTitle: async () => {
    const { editingTitleInfo, cancelEditingTitle } = get();
    const { updateCurrentChatSession } = useActiveChatStore.getState();
    const showToast = useToastStore.getState().showToast;

    if (editingTitleInfo.id && editingTitleInfo.value.trim()) {
      await updateCurrentChatSession(session => session ? ({ ...session, title: editingTitleInfo.value.trim() }) : null);
      showToast("Chat title updated!", "success");
    }
    cancelEditingTitle();
  },
}));

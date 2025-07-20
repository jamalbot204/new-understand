import { create } from 'zustand';
import { useActiveChatStore } from './useActiveChatStore';
import { useGeminiApiStore } from './useGeminiApiStore.ts';

interface AutoSendState {
  isAutoSendingActive: boolean;
  autoSendText: string;
  autoSendRepetitionsInput: string;
  autoSendRemaining: number;
  isWaitingForErrorRetry: boolean;
  errorRetryCountdown: number;
  _internalAutoSendText: string; // Keep internal text to prevent UI flicker
}

interface AutoSendActions {
  setAutoSendText: (text: string) => void;
  setAutoSendRepetitionsInput: (reps: string) => void;
  startAutoSend: (text: string, repetitions: number) => void;
  stopAutoSend: () => void;
  decrementRemaining: () => void;
  canStartAutoSend: () => boolean;
  isPreparingAutoSend: () => boolean;
  setErrorRetry: (isRetrying: boolean, countdown?: number) => void;
}

export const useAutoSendStore = create<AutoSendState & AutoSendActions>((set, get) => ({
    isAutoSendingActive: false,
    autoSendText: '',
    autoSendRepetitionsInput: '1',
    autoSendRemaining: 0,
    isWaitingForErrorRetry: false,
    errorRetryCountdown: 0,
    _internalAutoSendText: '',
  
    setAutoSendText: (text) => set({ autoSendText: text }),

    setAutoSendRepetitionsInput: (reps) => set({ autoSendRepetitionsInput: reps }),
    
    isPreparingAutoSend: () => {
        const { autoSendText, autoSendRepetitionsInput, isAutoSendingActive } = get();
        return autoSendText.trim() !== '' && parseInt(autoSendRepetitionsInput, 10) > 0 && !isAutoSendingActive;
    },

    canStartAutoSend: () => {
        const { autoSendText, autoSendRepetitionsInput } = get();
        const { currentChatSession } = useActiveChatStore.getState();
        return !!currentChatSession && autoSendText.trim() !== '' && parseInt(autoSendRepetitionsInput, 10) > 0;
    },
  
    startAutoSend: (text, repetitions) => {
      // Stop any existing process before starting a new one
      if (useGeminiApiStore.getState().isLoading) {
        useGeminiApiStore.getState().handleCancelGeneration();
      }
      get().stopAutoSend(); // Clear any previous auto-send state

      set({
        isAutoSendingActive: true,
        _internalAutoSendText: text,
        autoSendRemaining: repetitions,
        isWaitingForErrorRetry: false,
        errorRetryCountdown: 0,
      });
    },
  
    stopAutoSend: () => {
      set({ 
        isAutoSendingActive: false, 
        autoSendRemaining: 0,
        isWaitingForErrorRetry: false,
        errorRetryCountdown: 0,
        _internalAutoSendText: '',
      });
    },

    decrementRemaining: () => {
      set(state => ({ autoSendRemaining: Math.max(0, state.autoSendRemaining - 1) }));
    },

    setErrorRetry: (isRetrying, countdown = 30) => {
      set({ isWaitingForErrorRetry: isRetrying, errorRetryCountdown: countdown });
    },
}));


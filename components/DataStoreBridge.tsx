


import { useEffect, useRef } from 'react';
import { useDataStore } from '../store/useDataStore.ts';
import { useActiveChatStore } from '../store/useActiveChatStore.ts';
import { useChatListStore } from '../store/useChatListStore.ts';

const AUTOSAVE_DEBOUNCE_MS = 2500; // 2.5 seconds

export const DataStoreBridge = () => {
  const { init, handleManualSave } = useDataStore.getState();
  const { currentChatSession } = useActiveChatStore();
  const isLoadingData = useChatListStore(state => state.isLoadingData);
  const debounceTimeoutRef = useRef<number | null>(null);

  // This effect handles the initial data load.
  useEffect(() => {
    init();
  }, [init]);

  // This effect handles debounced auto-saving of the application state.
  useEffect(() => {
    // Don't auto-save if there's no session or we are still loading initial data.
    if (!currentChatSession || isLoadingData) {
      return;
    }

    // A change has occurred. Clear any existing timeout to reset the debounce timer.
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set a new timeout to save the state after a period of inactivity.
    debounceTimeoutRef.current = window.setTimeout(() => {
      // Pass `true` for a silent save (no success/error toasts for background saves).
      handleManualSave(true).catch(err => {
        // Error is already logged inside handleManualSave, this catch prevents unhandled rejections.
        console.error("Auto-save promise was rejected:", err);
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    // Cleanup function to clear the timeout on component unmount or before the effect re-runs.
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [currentChatSession, isLoadingData, handleManualSave]); // Re-run effect when session data or loading state changes.


  return null; // This component renders nothing.
};
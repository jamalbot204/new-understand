// src/components/MultiSelectActionBar.tsx
import React, { memo, useCallback, useMemo } from 'react';
import { useUIStore } from '../stores/uiStore.ts';
import { useSessionStore } from '../stores/sessionStore.ts';
import { useAppConfigStore } from '../stores/appConfigStore.ts';
import { useChatStore } from '../stores/chatStore.ts';
import { useAudioContext } from '../contexts/AudioContext.tsx';
import { TrashIcon, AudioResetIcon, XCircleIcon } from './Icons.tsx';
import { INITIAL_MESSAGES_COUNT } from '../constants.ts';

const MultiSelectActionBar: React.FC = memo(() => {
  const { selectedMessageIds } = useUIStore();
  const { clearSelection, toggleSelectionMode, selectAllVisible } = useUIStore(state => state.actions);
  
  const currentChatSession = useSessionStore(state => state.chatHistory.find(s => s.id === state.currentChatId));
  const messagesToDisplay = useAppConfigStore(s => s.messagesToDisplayConfig[currentChatSession?.id ?? ''] ?? currentChatSession?.settings.maxInitialMessagesDisplayed ?? INITIAL_MESSAGES_COUNT);
  const visibleMessagesForCurrentChat = useMemo(() => {
      if (!currentChatSession) return [];
      return currentChatSession.messages.slice(-messagesToDisplay);
  }, [currentChatSession, messagesToDisplay]);

  const { deleteMultipleMessages } = useChatStore(state => state.actions);
  const audio = useAudioContext();

  const { handleResetAudioCacheForMultipleMessages } = audio;

  const selectedCount = selectedMessageIds.size;
  const visibleMessageIds = visibleMessagesForCurrentChat.map(m => m.id);

  const handleDelete = useCallback(() => {
    if (selectedCount === 0 || !currentChatSession) return;
    deleteMultipleMessages(Array.from(selectedMessageIds));
  }, [selectedCount, deleteMultipleMessages, selectedMessageIds, currentChatSession]);

  const handleResetAudio = useCallback(() => {
    if (selectedCount === 0) return;
    handleResetAudioCacheForMultipleMessages(Array.from(selectedMessageIds));
  }, [selectedCount, handleResetAudioCacheForMultipleMessages, selectedMessageIds]);
  
  const handleSelectAll = useCallback(() => {
    selectAllVisible(visibleMessageIds);
  }, [selectAllVisible, visibleMessageIds]);

  const handleDone = useCallback(() => {
    toggleSelectionMode();
  }, [toggleSelectionMode]);

  const isSidebarOpen = useUIStore(state => state.isSidebarOpen);

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-sm border-t border-gray-700 p-2 sm:p-3 z-30 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:left-72' : 'left-0'}`}>
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4">
                <span className="text-sm font-medium text-gray-300 w-24 text-center">{selectedCount} selected</span>
                <div className="space-x-2">
                    <button onClick={handleSelectAll} className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50" disabled={visibleMessageIds.length === 0}>Select All Visible</button>
                    <button onClick={clearSelection} className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50" disabled={selectedCount === 0}>Deselect All</button>
                </div>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2">
                <button onClick={handleResetAudio} disabled={selectedCount === 0} className="flex items-center px-2 py-1.5 sm:px-3 text-xs font-medium text-yellow-300 bg-yellow-600 bg-opacity-20 rounded-md hover:bg-opacity-40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <AudioResetIcon className="w-4 h-4 mr-1 sm:mr-1.5" />
                    <span className="hidden sm:inline">Reset Audio</span>
                </button>
                <button onClick={handleDelete} disabled={selectedCount === 0} className="flex items-center px-2 py-1.5 sm:px-3 text-xs font-medium text-red-300 bg-red-600 bg-opacity-20 rounded-md hover:bg-opacity-40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <TrashIcon className="w-4 h-4 mr-1 sm:mr-1.5" />
                    <span className="hidden sm:inline">Delete</span>
                </button>
                 <button onClick={handleDone} className="flex items-center px-2 py-1.5 sm:px-3 text-xs font-medium text-gray-200 bg-gray-600 rounded-md hover:bg-gray-500 transition-colors">
                    <XCircleIcon className="w-4 h-4 mr-1 sm:mr-1.5" /> Done
                </button>
            </div>
        </div>
    </div>
  );
});

export default MultiSelectActionBar;
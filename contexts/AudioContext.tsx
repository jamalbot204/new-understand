// contexts/AudioContext.tsx
import React, { createContext, useContext, useRef, ReactNode, useCallback, useMemo } from 'react';
import { AudioPlayerState, ChatMessage } from '../types.ts';
import { useAudioPlayer } from '../hooks/useAudioPlayer.ts';
import { useAudioControls } from '../hooks/useAudioControls.ts';
import { useSessionStore } from '../stores/sessionStore.ts';
import { useChatStore } from '../stores/chatStore.ts';
import { useUIStore } from '../stores/uiStore.ts';
import { useAutoPlay } from '../hooks/useAutoPlay.ts';
import { splitTextForTts } from '../services/utils.ts';
import { MAX_WORDS_PER_TTS_SEGMENT } from '../constants.ts';
import { useApiKeyStore } from '../stores/apiKeyStore.ts';

interface AudioContextType {
  audioPlayerState: AudioPlayerState;
  handlePlayTextForMessage: (text: string, messageId: string, partIndex?: number) => Promise<void>;
  handleStopAndCancelAllForCurrentAudio: () => void;
  handleClosePlayerViewOnly: () => void;
  handleDownloadAudio: (sessionId: string, messageId: string, userProvidedName?: string) => void;
  handleResetAudioCache: (sessionId: string, messageId: string) => void;
  handleResetAudioCacheForMultipleMessages: (messageIds: string[]) => Promise<void>;
  isMainButtonMultiFetchingApi: (baseId: string) => boolean;
  getSegmentFetchError: (uniqueSegmentId: string) => string | undefined;
  isApiFetchingThisSegment: (uniqueSegmentId: string) => boolean;
  onCancelApiFetchThisSegment: (uniqueSegmentId: string) => void;
  handleCancelMultiPartFetch: (baseMessageId: string) => void;
  seekRelative: (offsetSeconds: number) => Promise<void>;
  seekToAbsolute: (timeInSeconds: number) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  increaseSpeed: () => void;
  decreaseSpeed: () => void;
  triggerAutoPlayForNewMessage: (newAiMessage: ChatMessage) => Promise<void>;
}

const AudioContext = createContext<AudioContextType | null>(null);

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentChatSession } = useSessionStore(state => ({
    currentChatSession: state.chatHistory.find(s => s.id === state.currentChatId)
  }));
  const { updateChatSession } = useSessionStore(state => state.actions);
  const { logApiRequest } = useChatStore(() => ({ logApiRequest: () => {} })); // Placeholder
  const uiActions = useUIStore(state => state.actions);
  const { activeApiKey } = useApiKeyStore();
  const apiKey = activeApiKey?.value || '';

  const audioControlsHookRef = useRef<any>(null);

  const audioPlayer = useAudioPlayer({
    apiKey: apiKey,
    logApiRequest: logApiRequest, 
    onCacheAudio: (id, buffer) => audioControlsHookRef.current?.handleCacheAudioForMessageCallback(id, buffer),
    onAutoplayNextSegment: async (baseMessageId, playedPartIndex) => {
      if (!currentChatSession || !currentChatSession.settings?.ttsSettings) return;
      const message = currentChatSession.messages.find(m => m.id === baseMessageId);
      if (!message) return;
      const maxWords = currentChatSession.settings.ttsSettings.maxWordsPerSegment || MAX_WORDS_PER_TTS_SEGMENT;
      const allTextSegments = splitTextForTts(message.content, maxWords);
      const nextPartIndex = playedPartIndex + 1;
      if (nextPartIndex < allTextSegments.length) {
        const nextTextSegment = allTextSegments[nextPartIndex];
        const nextUniqueSegmentId = `${baseMessageId}_part_${nextPartIndex}`;
        const nextCachedBuffer = message.cachedAudioBuffers?.[nextPartIndex];
        audioPlayer.playText(nextTextSegment, nextUniqueSegmentId, currentChatSession.settings.ttsSettings, nextCachedBuffer);
      }
    },
  });

  const audioControls = useAudioControls({
    apiKey: apiKey,
    currentChatSession: currentChatSession || null,
    updateChatSession: updateChatSession,
    logApiRequest: logApiRequest,
    showToast: uiActions.showToast,
    audioPlayerHook: audioPlayer,
    requestResetAudioCacheConfirmationModal: uiActions.requestResetAudioCacheConfirmation,
    isAutoFetchingSegment: () => false,
    onCancelAutoFetchSegment: () => {},
  });
  
  audioControlsHookRef.current = audioControls;

  const autoPlay = useAutoPlay({
    currentChatSession: currentChatSession || null,
    playFunction: audioControls.handlePlayTextForMessage,
  });
  
  const handleResetAudioCacheForMultipleMessages = useCallback(async (messageIds: string[]) => {
    if (!currentChatSession || messageIds.length === 0) return;
    
    const anyPlaying = messageIds.some(id => audioPlayer.audioPlayerState.currentMessageId?.startsWith(id));
    if (anyPlaying) {
      audioPlayer.stopPlayback();
    }

    await updateChatSession(currentChatSession.id, session => {
        if (!session) return null;
        const idSet = new Set(messageIds);
        const newMessages = session.messages.map(m => 
            idSet.has(m.id) ? { ...m, cachedAudioBuffers: null } : m
        );
        return { ...session, messages: newMessages };
    });

    uiActions.showToast(`Audio cache reset for ${messageIds.length} message(s).`, "success");
    uiActions.toggleSelectionMode(); // This also clears selection
  }, [currentChatSession, updateChatSession, audioPlayer, uiActions.showToast, uiActions.toggleSelectionMode]);

  const value = useMemo(() => ({
    audioPlayerState: audioPlayer.audioPlayerState,
    handlePlayTextForMessage: audioControls.handlePlayTextForMessage,
    handleStopAndCancelAllForCurrentAudio: audioControls.handleStopAndCancelAllForCurrentAudio,
    handleClosePlayerViewOnly: audioControls.handleClosePlayerViewOnly,
    handleDownloadAudio: audioControls.handleDownloadAudio,
    handleResetAudioCache: audioControls.handleResetAudioCache,
    handleResetAudioCacheForMultipleMessages,
    isMainButtonMultiFetchingApi: audioControls.isMainButtonMultiFetchingApi,
    getSegmentFetchError: audioPlayer.getSegmentFetchError,
    isApiFetchingThisSegment: audioPlayer.isApiFetchingThisSegment,
    onCancelApiFetchThisSegment: audioPlayer.cancelCurrentSegmentAudioLoad,
    handleCancelMultiPartFetch: audioControls.handleCancelMultiPartFetch,
    seekRelative: audioPlayer.seekRelative,
    seekToAbsolute: audioPlayer.seekToAbsolute,
    togglePlayPause: audioPlayer.togglePlayPause,
    increaseSpeed: audioPlayer.increaseSpeed,
    decreaseSpeed: audioPlayer.decreaseSpeed,
    triggerAutoPlayForNewMessage: autoPlay.triggerAutoPlayForNewMessage,
  }), [audioPlayer, audioControls, handleResetAudioCacheForMultipleMessages, autoPlay.triggerAutoPlayForNewMessage]);

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export const useAudioContext = (): AudioContextType => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudioContext must be used within an AudioProvider');
  }
  return context;
};
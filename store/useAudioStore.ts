

import { create } from 'zustand';
import { AudioPlayerState, ChatMessage } from '../types.ts';
import { generateSpeech, playPcmAudio } from '../services/ttsService.ts';
import { strictAbort } from '../services/cancellationService.ts';
import * as audioUtils from '../services/audioUtils.ts';
import { splitTextForTts, sanitizeFilename, triggerDownload } from '../services/utils.ts';
import { MAX_WORDS_PER_TTS_SEGMENT, PLAYBACK_SPEEDS, APP_TITLE } from '../constants.ts';
import { useSelectionStore } from './useSelectionStore.ts';
import { useToastStore } from './useToastStore.ts';
import { useModalStore } from './useModalStore.ts';
import { useApiKeyStore } from './useApiKeyStore.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useGeminiApiStore } from './useGeminiApiStore.ts';
import { useDummyAudioStore } from './useDummyAudioStore.ts';

interface AudioState {
  audioPlayerState: AudioPlayerState;
  fetchingSegmentIds: Set<string>;
  segmentFetchErrors: Map<string, string>;
  activeMultiPartFetches: Set<string>;
}

interface AudioActions {
  init: () => void;
  cleanup: () => void;
  handlePlayTextForMessage: (text: string, messageId: string, partIndex?: number) => Promise<void>;
  handleStopAndCancelAllForCurrentAudio: () => void;
  handleClosePlayerViewOnly: () => void;
  handleDownloadAudio: (messageId: string, userProvidedName?: string) => void;
  handleResetAudioCache: (messageId: string) => void;
  handleResetAudioCacheForMultipleMessages: (messageIds: string[]) => Promise<void>;
  isMainButtonMultiFetchingApi: (baseId: string) => boolean;
  getSegmentFetchError: (uniqueSegmentId: string) => string | undefined;
  isApiFetchingThisSegment: (uniqueSegmentId: string) => boolean;
  onCancelApiFetchThisSegment: (uniqueSegmentId: string, showToastNotification?: boolean) => void;
  handleCancelMultiPartFetch: (baseMessageId: string) => void;
  seekRelative: (offsetSeconds: number) => Promise<void>;
  seekToAbsolute: (timeInSeconds: number) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  increaseSpeed: () => void;
  decreaseSpeed: () => void;
  triggerAutoPlayForNewMessage: (newAiMessage: ChatMessage) => Promise<void>;
}

export const useAudioStore = create<AudioState & AudioActions>((set, get) => {
  let audioContext: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;
  let currentPcmDataBuffer: ArrayBuffer | null = null;
  let animationFrameId: number | null = null;
  let audioStartTime = 0;

  const activeFetchControllers = new Map<string, AbortController>();
  const multiPartFetchControllers = new Map<string, AbortController>();
  const processedNewMessagesForAutoplay = new Set<string>();
  let autoPlayTimeout: number | null = null;

  const stopCurrentPlayback = (clearFullState = false) => {
    if (audioSource) {
      try {
        audioSource.onended = null;
        audioSource.stop();
      } catch (e) { /* ignore */ }
      audioSource.disconnect();
      audioSource = null;
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (clearFullState) {
      currentPcmDataBuffer = null;
      set(state => ({
        audioPlayerState: {
          ...state.audioPlayerState,
          isLoading: false, isPlaying: false, currentMessageId: null, currentPlayingText: null,
          currentTime: 0, duration: 0, error: null,
        }
      }));
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
    } else {
      set(state => ({ audioPlayerState: { ...state.audioPlayerState, isPlaying: false } }));
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
    // Sync with dummy audio element for media key support
    useDummyAudioStore.getState().pause();
  };

  const updateProgress = () => {
    if (!audioContext || !audioSource?.buffer) {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      return;
    }
    set(state => {
      if (!state.audioPlayerState.isPlaying || state.audioPlayerState.currentMessageId === null || state.audioPlayerState.duration === undefined) {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        return state;
      }
      const elapsed = audioContext!.currentTime - audioStartTime;
      const newCurrentTime = elapsed * (audioSource?.playbackRate.value || 1.0);
      animationFrameId = requestAnimationFrame(updateProgress);
      return {
        audioPlayerState: {
          ...state.audioPlayerState,
          currentTime: Math.min(state.audioPlayerState.duration, Math.max(0, newCurrentTime)),
        }
      };
    });
  };

  const startPlaybackInternal = async (pcmBuffer: ArrayBuffer, startTimeOffset: number, textSegment: string, uniqueSegmentId: string) => {
    if (!audioContext) throw new Error("AudioContext not available.");
    stopCurrentPlayback(false);
    currentPcmDataBuffer = pcmBuffer;

    const { sourceNode, duration } = await playPcmAudio(audioContext, pcmBuffer, 24000);
    audioSource = sourceNode;
    audioSource.playbackRate.value = get().audioPlayerState.playbackRate;

    set(state => ({
      audioPlayerState: {
        ...state.audioPlayerState, isLoading: false, isPlaying: true, currentMessageId: uniqueSegmentId,
        error: null, currentTime: startTimeOffset, duration: duration, currentPlayingText: textSegment,
      },
      segmentFetchErrors: new Map(state.segmentFetchErrors).set(uniqueSegmentId, undefined as any) // Clear error on successful play
    }));

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: textSegment, artist: APP_TITLE });
      navigator.mediaSession.playbackState = 'playing';
    }

    // Sync with dummy audio element for media key support
    useDummyAudioStore.getState().play();

    audioStartTime = audioContext.currentTime - (startTimeOffset / get().audioPlayerState.playbackRate);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = requestAnimationFrame(updateProgress);

    audioSource.onended = () => {
      if (audioSource === sourceNode) {
        stopCurrentPlayback(false);
        const parts = uniqueSegmentId.split('_part_');
        if (parts.length === 2) {
          const baseMessageId = parts[0];
          const playedPartIndex = parseInt(parts[1], 10);
          if (!isNaN(playedPartIndex)) {
            const currentChatSession = useActiveChatStore.getState().currentChatSession;
            const message = currentChatSession?.messages.find(m => m.id === baseMessageId);
            if(message) {
              const maxWords = currentChatSession?.settings.ttsSettings?.maxWordsPerSegment || MAX_WORDS_PER_TTS_SEGMENT;
              const allTextSegments = splitTextForTts(message.content, maxWords);
              if (playedPartIndex + 1 < allTextSegments.length) {
                get().handlePlayTextForMessage(message.content, baseMessageId, playedPartIndex + 1);
              }
            }
          }
        }
      }
    };
    audioSource.start(0, startTimeOffset);
  };
  
  const handleCacheAudioForMessageCallback = async (uniqueSegmentId: string, audioBuffer: ArrayBuffer) => {
      const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
      if (!currentChatSession?.id) return;

      const parts = uniqueSegmentId.split('_part_');
      const baseMessageId = parts[0];
      const partIndex = parts.length > 1 ? parseInt(parts[1], 10) : 0;

      await updateCurrentChatSession((session) => {
          if (!session) return null;
          const messageIndex = session.messages.findIndex(m => m.id === baseMessageId);
          if (messageIndex === -1) return session;

          const updatedMessages = [...session.messages];
          const existingBuffers = updatedMessages[messageIndex].cachedAudioBuffers || [];
          
          const newBuffers = [...existingBuffers];
          while (newBuffers.length <= partIndex) newBuffers.push(null);
          newBuffers[partIndex] = audioBuffer;
          
          updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], cachedAudioBuffers: newBuffers };
          return { ...session, messages: updatedMessages };
      });
  };

  const resumePlayback = async () => {
    const { isPlaying, currentMessageId, currentTime, currentPlayingText } = get().audioPlayerState;
    if (!isPlaying && currentMessageId && currentPcmDataBuffer) {
      if (!audioContext) return;
      if (audioContext.state === 'suspended') await audioContext.resume();
      try {
        set(s => ({ audioPlayerState: { ...s.audioPlayerState, isLoading: true, error: null } }));
        await startPlaybackInternal(currentPcmDataBuffer, currentTime || 0, currentPlayingText || "", currentMessageId);
      } catch (e: any) {
        set(s => ({ audioPlayerState: { ...s.audioPlayerState, isLoading: false, isPlaying: false, error: e.message || "Failed to resume." } }));
      }
    }
  };

  return {
    audioPlayerState: { isLoading: false, isPlaying: false, currentMessageId: null, error: null, currentTime: 0, duration: 0, currentPlayingText: null, playbackRate: 1.0 },
    fetchingSegmentIds: new Set(),
    segmentFetchErrors: new Map(),
    activeMultiPartFetches: new Set(),

    init: () => {
      if (typeof window !== 'undefined' /* && !audioContext */) { // Defer audio context creation
        // audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        if ('mediaSession' in navigator) {
          navigator.mediaSession.setActionHandler('play', () => { get().togglePlayPause(); });
          navigator.mediaSession.setActionHandler('pause', () => { get().togglePlayPause(); });
          navigator.mediaSession.setActionHandler('stop', () => { get().handleStopAndCancelAllForCurrentAudio(); });
          navigator.mediaSession.setActionHandler('seekbackward', (details) => { get().seekRelative(-(details.seekOffset || 10)); });
          navigator.mediaSession.setActionHandler('seekforward', (details) => { get().seekRelative(details.seekOffset || 10); });
          // Placeholders for next/previous track functionality
          try {
            navigator.mediaSession.setActionHandler('previoustrack', () => { /* TODO: Implement logic to play previous message */ });
            navigator.mediaSession.setActionHandler('nexttrack', () => { /* TODO: Implement logic to play next message */ });
          } catch (e) {
            console.warn("Could not set previoustrack/nexttrack handlers, this is expected in some environments.", e);
          }
        }
      }
    },
    cleanup: () => {
      stopCurrentPlayback(true);
      activeFetchControllers.forEach(c => strictAbort(c));
      activeFetchControllers.clear();
      multiPartFetchControllers.forEach(c => strictAbort(c));
      multiPartFetchControllers.clear();
      if (autoPlayTimeout) clearTimeout(autoPlayTimeout);
      audioContext?.close();
      audioContext = null;
    },

    handlePlayTextForMessage: async (originalFullText, baseMessageId, partIndexToPlay) => {
        // JIT AudioContext Creation: Create the audio context on the first user gesture.
        if (!audioContext) {
          audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        const chat = useActiveChatStore.getState().currentChatSession;
        const { logApiRequest } = useGeminiApiStore.getState();
  
        if (!chat || !chat.settings?.ttsSettings || !originalFullText.trim()) {
          useToastStore.getState().showToast("TTS settings or message not available.", "error");
          return;
        }
        if (audioContext?.state === 'suspended') await audioContext.resume();
  
        const ttsSettings = chat.settings.ttsSettings;
        const maxWords = ttsSettings.maxWordsPerSegment || MAX_WORDS_PER_TTS_SEGMENT;
        const textSegments = splitTextForTts(originalFullText, maxWords);
        const numExpectedSegments = textSegments.length;

        const targetSegmentId = partIndexToPlay !== undefined 
            ? `${baseMessageId}_part_${partIndexToPlay}` 
            : (numExpectedSegments > 1 ? `${baseMessageId}_part_0` : baseMessageId);

        const { currentMessageId, isPlaying } = get().audioPlayerState;
  
        if (currentMessageId && currentMessageId !== targetSegmentId) {
          get().handleStopAndCancelAllForCurrentAudio();
        }
  
        const message = chat.messages.find(m => m.id === baseMessageId);
        if (!message) return;
        
        const allPartsAreCached = message.cachedAudioBuffers && message.cachedAudioBuffers.length === numExpectedSegments && message.cachedAudioBuffers.every(b => !!b);
  
        let needsApiCall = false;
        if (partIndexToPlay !== undefined) {
          const isPartCached = !!message.cachedAudioBuffers?.[partIndexToPlay];
          if (!isPartCached) {
              needsApiCall = true;
          }
        } else { // main button clicked
            if (!allPartsAreCached) {
                needsApiCall = true;
            }
        }
        
        if (needsApiCall) {
          await useApiKeyStore.getState().rotateActiveKey();
        }
  
        const apiKey = useApiKeyStore.getState().activeApiKey?.value;
  
        if (needsApiCall && !apiKey) {
          useToastStore.getState().showToast("API key not available for TTS.", "error");
          return;
        }
        
        if (partIndexToPlay !== undefined) {
            const textSegmentToPlayNow = textSegments[partIndexToPlay];
            if (!textSegmentToPlayNow) return;
            const uniqueSegmentId = `${baseMessageId}_part_${partIndexToPlay}`;
            const cachedBuffer = message.cachedAudioBuffers?.[partIndexToPlay];
            if (cachedBuffer) {
                if (isPlaying && currentMessageId === uniqueSegmentId) get().togglePlayPause();
                else await startPlaybackInternal(cachedBuffer, 0, textSegmentToPlayNow, uniqueSegmentId);
            } else {
              // Fetch logic
              const controller = new AbortController();
              activeFetchControllers.set(uniqueSegmentId, controller);
              set(s => ({ fetchingSegmentIds: new Set(s.fetchingSegmentIds).add(uniqueSegmentId), audioPlayerState: {...s.audioPlayerState, isLoading: true, currentMessageId: uniqueSegmentId, currentPlayingText: textSegmentToPlayNow} }));
              try {
                const pcmData = await generateSpeech(apiKey!, textSegmentToPlayNow, ttsSettings, logApiRequest, controller.signal);
                if (controller.signal.aborted) throw new DOMException('Aborted');
                handleCacheAudioForMessageCallback(uniqueSegmentId, pcmData);
                set(s => ({ fetchingSegmentIds: new Set([...s.fetchingSegmentIds].filter(id => id !== uniqueSegmentId)), audioPlayerState: {...s.audioPlayerState, isLoading: false} }));
                
              } catch (e: any) {
                 if (e.name !== 'AbortError') {
                   set(s => ({ fetchingSegmentIds: new Set([...s.fetchingSegmentIds].filter(id => id !== uniqueSegmentId)), audioPlayerState: {...s.audioPlayerState, isLoading: false, error: e.message}, segmentFetchErrors: new Map(s.segmentFetchErrors).set(uniqueSegmentId, e.message) }));
                 }
              } finally {
                activeFetchControllers.delete(uniqueSegmentId);
              }
            }
        } else { // Main button logic
          if (allPartsAreCached) {
            await startPlaybackInternal(message.cachedAudioBuffers![0]!, 0, textSegments[0], targetSegmentId);
          } else {
            // Fetch all logic
            const controller = new AbortController();
            multiPartFetchControllers.set(baseMessageId, controller);
            set(s => ({ activeMultiPartFetches: new Set(s.activeMultiPartFetches).add(baseMessageId) }));
            const partsToFetchCount = textSegments.filter((_, idx) => !message.cachedAudioBuffers?.[idx]).length;
            if (partsToFetchCount > 0) useToastStore.getState().showToast(`Fetching ${partsToFetchCount} audio part(s)...`, "success");
  
            try {
              const fetchPromises = textSegments.map((segment, i) => {
                if (message.cachedAudioBuffers?.[i]) return Promise.resolve(message.cachedAudioBuffers[i]);
                return generateSpeech(apiKey!, segment, ttsSettings, logApiRequest, controller.signal);
              });
              const results = await Promise.all(fetchPromises);
              if (controller.signal.aborted) return;
              results.forEach((buffer, i) => { if(buffer) handleCacheAudioForMessageCallback(`${baseMessageId}_part_${i}`, buffer) });
              useToastStore.getState().showToast("All audio parts fetched.", "success");
              
            } catch(e: any) {
              if (e.name !== 'AbortError') {
                useToastStore.getState().showToast(`Audio fetch failed: ${e.message}`, "error");
              }
            } finally {
              multiPartFetchControllers.delete(baseMessageId);
              set(s => ({ activeMultiPartFetches: new Set([...s.activeMultiPartFetches].filter(id => id !== baseMessageId)) }));
            }
          }
        }
    },
    handleStopAndCancelAllForCurrentAudio: () => {
      const { currentMessageId } = get().audioPlayerState;
      if (currentMessageId) {
        get().handleCancelMultiPartFetch(currentMessageId.split('_part_')[0]);
        get().onCancelApiFetchThisSegment(currentMessageId, false);
      }
      stopCurrentPlayback(true);
    },
    handleClosePlayerViewOnly: () => stopCurrentPlayback(true),
    handleDownloadAudio: async (messageId, userProvidedName) => {
      const chat = useActiveChatStore.getState().currentChatSession;
      const message = chat?.messages.find(m => m.id === messageId);
      if (!chat || !message || !message.cachedAudioBuffers?.every(b => !!b)) {
        useToastStore.getState().showToast("Audio not fully ready for download.", "error");
        return;
      }
      const finalFilename = `${sanitizeFilename(userProvidedName || 'audio', 100)}.mp3`;
      const combinedPcm = audioUtils.concatenateAudioBuffers(message.cachedAudioBuffers as ArrayBuffer[]);
      if (combinedPcm.byteLength === 0) return;
      const audioBlob = audioUtils.createAudioFileFromPcm(combinedPcm, 'audio/mpeg');
      triggerDownload(audioBlob, finalFilename);
      useToastStore.getState().showToast(`Download started as "${finalFilename}".`, "success");
    },
    handleResetAudioCache: (messageId) => {
      const chat = useActiveChatStore.getState().currentChatSession;
      if (!chat) return;
      useModalStore.getState().requestResetAudioCacheConfirmation(chat.id, messageId);
    },
    handleResetAudioCacheForMultipleMessages: async (messageIds) => {
      const { updateCurrentChatSession } = useActiveChatStore.getState();
      if (!updateCurrentChatSession) return;

      const anyPlaying = messageIds.some(id => get().audioPlayerState.currentMessageId?.startsWith(id));
      if (anyPlaying) get().handleStopAndCancelAllForCurrentAudio();

      await updateCurrentChatSession(session => {
          if (!session) return null;
          const idSet = new Set(messageIds);
          const newMessages = session.messages.map(m => idSet.has(m.id) ? { ...m, cachedAudioBuffers: null } : m );
          return { ...session, messages: newMessages };
      });
      useToastStore.getState().showToast(`Audio cache reset for ${messageIds.length} message(s).`, "success");
      useSelectionStore.getState().toggleSelectionMode();
    },
    isMainButtonMultiFetchingApi: (baseId) => get().activeMultiPartFetches.has(baseId),
    getSegmentFetchError: (id) => get().segmentFetchErrors.get(id),
    isApiFetchingThisSegment: (id) => get().fetchingSegmentIds.has(id),
    onCancelApiFetchThisSegment: (uniqueSegmentId: string, showToastNotification = true) => {
      set(s => ({ fetchingSegmentIds: new Set([...s.fetchingSegmentIds].filter(id => id !== uniqueSegmentId)) }));
      activeFetchControllers.get(uniqueSegmentId)?.abort();
      if(showToastNotification) {
        useToastStore.getState().showToast("Audio fetch for segment canceled.", "success");
      }
  },

  handleCancelMultiPartFetch: (baseMessageId: string) => {
      set(s => ({ activeMultiPartFetches: new Set([...s.activeMultiPartFetches].filter(id => id !== baseMessageId)) }));
      multiPartFetchControllers.get(baseMessageId)?.abort();
      useToastStore.getState().showToast("Audio fetch for all parts canceled.", "success");
  },
    seekRelative: async (offset) => {
      const { duration, currentTime } = get().audioPlayerState;
      if (duration === undefined || currentTime === undefined) return;
      await startPlaybackInternal(currentPcmDataBuffer!, currentTime + offset, get().audioPlayerState.currentPlayingText || "", get().audioPlayerState.currentMessageId!);
    },
    seekToAbsolute: async (time) => {
      await startPlaybackInternal(currentPcmDataBuffer!, time, get().audioPlayerState.currentPlayingText || "", get().audioPlayerState.currentMessageId!);
    },
    togglePlayPause: async () => {
      if (get().audioPlayerState.isPlaying) stopCurrentPlayback(false);
      else await resumePlayback();
    },
    increaseSpeed: () => {
        const { playbackRate } = get().audioPlayerState;
        const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
        const newRate = PLAYBACK_SPEEDS[Math.min(currentIndex + 1, PLAYBACK_SPEEDS.length - 1)];
        if (audioSource) audioSource.playbackRate.value = newRate;
        set(s => ({ audioPlayerState: {...s.audioPlayerState, playbackRate: newRate} }));
    },
    decreaseSpeed: () => {
        const { playbackRate } = get().audioPlayerState;
        const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
        const newRate = PLAYBACK_SPEEDS[Math.max(currentIndex - 1, 0)];
        if (audioSource) audioSource.playbackRate.value = newRate;
        set(s => ({ audioPlayerState: {...s.audioPlayerState, playbackRate: newRate} }));
    },
    triggerAutoPlayForNewMessage: async (newAiMessage) => {
        const autoPlayIsEnabled = useActiveChatStore.getState().currentChatSession?.settings?.ttsSettings?.autoPlayNewMessages ?? false;
        if (!autoPlayIsEnabled || newAiMessage.isStreaming || processedNewMessagesForAutoplay.has(newAiMessage.id)) return;
        processedNewMessagesForAutoplay.add(newAiMessage.id);
        if (autoPlayTimeout) clearTimeout(autoPlayTimeout);
        autoPlayTimeout = window.setTimeout(() => {
            get().handlePlayTextForMessage(newAiMessage.content, newAiMessage.id, undefined);
        }, 750);
    },
  };
});

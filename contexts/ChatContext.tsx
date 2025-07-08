// src/contexts/ChatContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo, useRef } from 'react';
import { ChatSession, ChatMessage, Attachment, AICharacter, ApiRequestLog, ExportConfiguration, LogApiRequestCallback, UseAutoSendReturn, ChatMessageRole } from '../types.ts';
import { useChatSessions } from '../hooks/useChatSessions.ts';
import { useAiCharacters } from '../hooks/useAiCharacters.ts';
import { useGemini } from '../hooks/useGemini.ts';
import { useImportExport } from '../hooks/useImportExport.ts';
import { useAppPersistence } from '../hooks/useAppPersistence.ts';
import { useSidebarActions } from '../hooks/useSidebarActions.ts';
import { useChatInteractions } from '../hooks/useChatInteractions.ts';
import { useAutoSend } from '../hooks/useAutoSend.ts';
import { useUIStore } from '../stores/uiStore.ts';
import { EditMessagePanelAction, EditMessagePanelDetails } from '../components/EditMessagePanel.tsx';
import { DEFAULT_SETTINGS, INITIAL_MESSAGES_COUNT } from '../constants.ts';
import { useMessageInjection } from '../hooks/useMessageInjection.ts';
import { useApiKeyStore } from '../stores/apiKeyStore.ts';

// For data that changes less often
interface ChatStateContextType {
  chatHistory: ChatSession[];
  currentChatId: string | null;
  currentChatSession: ChatSession | null;
  visibleMessagesForCurrentChat: ChatMessage[];
  isLoadingData: boolean;
  editingTitleInfo: { id: string | null; value: string };
  messagesToDisplayConfig: Record<string, number>;
  currentExportConfig: ExportConfiguration;
  messageGenerationTimes: Record<string, number>;
  logApiRequest: LogApiRequestCallback;
}

// For frequently changing status
interface ChatInteractionStatusContextType {
  isLoading: boolean;
  currentGenerationTimeDisplay: string;
  autoSendHook: UseAutoSendReturn;
}

// For stable action functions
interface ChatActionsContextType {
  setChatHistory: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setCurrentChatId: (id: string | null) => Promise<void>;
  updateChatSession: (sessionId: string, updater: (session: ChatSession) => ChatSession | null) => Promise<void>;
  handleNewChat: () => void;
  handleSelectChat: (id: string) => void;
  handleDeleteChat: (id: string) => void;
  handleSendMessage: (promptContent: string, attachments?: Attachment[], historyContextOverride?: ChatMessage[], characterIdForAPICall?: string, isTemporaryContext?: boolean) => Promise<void>;
  handleContinueFlow: () => Promise<void>;
  handleCancelGeneration: () => Promise<void>;
  handleRegenerateAIMessage: (sessionId: string, aiMessageIdToRegenerate: string) => Promise<void>;
  handleRegenerateResponseForUserMessage: (sessionId: string, userMessageId: string) => Promise<void>;
  handleEditPanelSubmit: (action: EditMessagePanelAction, newContent: string, details: EditMessagePanelDetails) => Promise<void>;
  handleToggleCharacterMode: () => Promise<void>;
  handleAddCharacter: (name: string, systemInstruction: string) => Promise<void>;
  handleEditCharacter: (id: string, name: string, systemInstruction: string) => Promise<void>;
  handleDeleteCharacter: (id: string) => Promise<void>;
  handleReorderCharacters: (newCharacters: AICharacter[]) => Promise<void>;
  handleSaveCharacterContextualInfo: (characterId: string, newInfo: string) => Promise<void>;
  handleExportChats: (chatIdsToExport: string[], exportConfig: ExportConfiguration) => Promise<void>;
  handleImportAll: () => Promise<void>;
  setMessagesToDisplayConfig: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
  setCurrentExportConfig: (newConfig: ExportConfiguration) => Promise<void>;
  handleManualSave: () => Promise<void>;
  handleStartEditChatTitle: (sessionId: string, currentTitle: string) => void;
  handleSaveChatTitle: () => Promise<void>;
  handleCancelEditChatTitle: () => void;
  handleEditTitleInputChange: (newTitle: string) => void;
  handleDuplicateChat: (sessionId: string) => Promise<void>;
  handleActualCopyMessage: (content: string) => Promise<boolean>;
  handleDeleteMessageAndSubsequent: (sessionId: string, messageId: string) => Promise<void>;
  handleDeleteSingleMessageOnly: (sessionId: string, messageId: string) => void;
  handleLoadMoreDisplayMessages: (chatId: string, count: number) => Promise<void>;
  handleLoadAllDisplayMessages: (chatId: string, count: number) => Promise<void>;
  handleClearApiLogs: (sessionId: string) => Promise<void>;
  handleClearChatCacheForCurrentSession: () => void;
  handleReUploadAttachment: (sessionId: string, messageId: string, attachmentId: string) => Promise<void>;
  triggerAutoPlayForNewMessage: (callback: (newAiMessage: ChatMessage) => Promise<void>) => void;
  performActualAudioCacheReset: (sessionId: string, messageId: string) => Promise<void>;
  handleInsertEmptyMessageAfter: (sessionId: string, afterMessageId: string, roleToInsert: ChatMessageRole.USER | ChatMessageRole.MODEL) => Promise<void>;
  handleDeleteMultipleMessages: (messageIds: string[]) => Promise<void>;
  handleSetGithubRepo: (url: string | null) => Promise<void>;
}

const ChatStateContext = createContext<ChatStateContextType | null>(null);
const ChatInteractionStatusContext = createContext<ChatInteractionStatusContextType | null>(null);
const ChatActionsContext = createContext<ChatActionsContextType | null>(null);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeApiKey } = useApiKeyStore();
  const { rotateActiveKey } = useApiKeyStore(state => state.actions);

  const {
    chatHistory, setChatHistory, currentChatId, setCurrentChatId, currentChatSession: rawCurrentChatSession,
    updateChatSession, handleNewChat: useChatSessionsHandleNewChat,
    handleSelectChat: useChatSessionsHandleSelectChat,
    handleDeleteChat: useChatSessionsHandleDeleteChat, isLoadingData,
  } = useChatSessions();

  const [loadedMsgGenTimes, setLoadedMsgGenTimes] = useState<Record<string, number>>({});
  const [loadedDisplayConfig, setLoadedDisplayConfig] = useState<Record<string, number>>({});

  const persistence = useAppPersistence(
    chatHistory, currentChatId, loadedMsgGenTimes, setLoadedMsgGenTimes,
    loadedDisplayConfig, setLoadedDisplayConfig, useUIStore.getState().actions.showToast
  );
  
  const triggerAutoPlayCallbackRef = useRef<(newAiMessage: ChatMessage) => Promise<void>>(() => Promise.resolve());

  const gemini = useGemini({
    apiKey: activeApiKey?.value || '',
    currentChatSession: rawCurrentChatSession || null,
    updateChatSession,
    logApiRequestDirectly: (logDetails) => {
      if (rawCurrentChatSession && rawCurrentChatSession.settings.debugApiRequests) {
        const newLogEntry: ApiRequestLog = { ...logDetails, id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, timestamp: new Date() };
        updateChatSession(rawCurrentChatSession.id, session => session ? ({ ...session, apiRequestLogs: [...(session.apiRequestLogs || []), newLogEntry] }) : null);
      }
    },
    onNewAIMessageFinalized: async (newAiMessage) => {
      await triggerAutoPlayCallbackRef.current(newAiMessage);
    },
    setMessageGenerationTimes: persistence.setMessageGenerationTimes,
    rotateApiKey: rotateActiveKey,
  });

  const chatInteractions = useChatInteractions({
    apiKey: activeApiKey?.value || '',
    currentChatSession: rawCurrentChatSession || null, updateChatSession, showToast: useUIStore.getState().actions.showToast,
    openEditPanel: useUIStore.getState().actions.openEditPanel, closeEditPanel: useUIStore.getState().actions.closeEditPanel,
    geminiHandleEditPanelSubmit: gemini.handleEditPanelSubmit,
    geminiHandleCancelGeneration: gemini.handleCancelGeneration,
    isLoadingFromGemini: gemini.isLoading,
    setMessageGenerationTimes: persistence.setMessageGenerationTimes,
    setMessagesToDisplayConfig: persistence.setMessagesToDisplayConfig,
    stopAndCancelAudio: () => {}, 
    activeAutoFetches: new Map(), setActiveAutoFetches: () => {},
    requestDeleteConfirmationModal: useUIStore.getState().actions.requestDeleteConfirmation,
    requestResetAudioCacheConfirmationModal: useUIStore.getState().actions.requestResetAudioCacheConfirmation,
    isSettingsPanelOpen: useUIStore.getState().isSettingsPanelOpen,
    closeSettingsPanel: useUIStore.getState().actions.closeSettingsPanel,
    closeSidebar: useUIStore.getState().actions.closeSidebar,
    logApiRequest: gemini.logApiRequest,
  });

  const autoSend = useAutoSend({
    currentChatSession: rawCurrentChatSession || null,
    isLoadingFromGemini: gemini.isLoading,
    sendMessageToGemini: gemini.handleSendMessage,
    cancelGeminiGeneration: gemini.handleCancelGeneration,
    handleRegenerateResponseForUserMessage: gemini.handleRegenerateResponseForUserMessage,
  });
  
  const aiCharacters = useAiCharacters(rawCurrentChatSession || null, updateChatSession);
  const sidebarActions = useSidebarActions({
    chatHistory, setChatHistory, updateChatSession, setCurrentChatId,
    setMessagesToDisplayConfig: persistence.setMessagesToDisplayConfig, showToast: useUIStore.getState().actions.showToast,
  });
  const importExport = useImportExport(
    setChatHistory, setCurrentChatId, persistence.setMessageGenerationTimes,
    persistence.setMessagesToDisplayConfig, useUIStore.getState().actions.showToast, chatHistory
  );

  const messageInjection = useMessageInjection({
    updateChatSession,
    setMessagesToDisplayConfig: persistence.setMessagesToDisplayConfig,
    messagesToDisplayConfig: persistence.messagesToDisplayConfig,
    showToast: useUIStore.getState().actions.showToast,
  });

  const handleNewChat = useCallback(async () => {
    await useChatSessionsHandleNewChat(persistence.setMessagesToDisplayConfig);
    useUIStore.getState().actions.showToast("New chat created!", "success");
  }, [useChatSessionsHandleNewChat, persistence.setMessagesToDisplayConfig]);

  const handleSelectChat = useCallback(async (id: string) => {
    if (autoSend.isAutoSendingActive) await autoSend.stopAutoSend();
    await useChatSessionsHandleSelectChat(id, persistence.setMessagesToDisplayConfig);
  }, [useChatSessionsHandleSelectChat, persistence.setMessagesToDisplayConfig, autoSend]);

  const handleDeleteChat = useCallback(async (id: string) => {
    if (currentChatId === id) {
      if (autoSend.isAutoSendingActive) await autoSend.stopAutoSend();
    }
    await useChatSessionsHandleDeleteChat(id, persistence.setMessagesToDisplayConfig, persistence.setMessageGenerationTimes);
    useUIStore.getState().actions.showToast("Chat deleted!", "success");
  }, [currentChatId, useChatSessionsHandleDeleteChat, persistence, autoSend]);
  
  const handleAddCharacter = async (name: string, systemInstruction: string) => {
    await aiCharacters.handleAddCharacter(name, systemInstruction);
    useUIStore.getState().actions.showToast("Character added!", "success");
  };

  const handleEditCharacter = async (id: string, name: string, systemInstruction: string) => {
    await aiCharacters.handleEditCharacter(id, name, systemInstruction);
    useUIStore.getState().actions.showToast("Character updated!", "success");
  };

  const handleDeleteCharacter = async (id: string) => {
    await aiCharacters.handleDeleteCharacter(id);
    useUIStore.getState().actions.showToast("Character deleted!", "success");
  };
  
  const handleSetGithubRepo = useCallback(async (url: string | null) => {
    if (!rawCurrentChatSession) {
      useUIStore.getState().actions.showToast("No active chat session.", "error");
      return;
    }

    if (url === null) {
      await updateChatSession(rawCurrentChatSession.id, session => session ? ({
        ...session,
        githubRepoContext: null,
        messages: [...session.messages, {
          id: `msg-${Date.now()}-system`,
          role: ChatMessageRole.SYSTEM,
          content: "GitHub repository context has been removed.",
          timestamp: new Date(),
        }]
      }) : null);
      useUIStore.getState().actions.showToast("GitHub repository context removed.", "success");
      return;
    }

    useUIStore.getState().actions.closeGitHubImportModal();
    
    const processingMessage: ChatMessage = {
      id: `msg-${Date.now()}-system-processing`,
      role: ChatMessageRole.SYSTEM,
      content: `Processing GitHub repository: ${url}...`,
      timestamp: new Date(),
    };
    await updateChatSession(rawCurrentChatSession.id, session => session ? ({
      ...session,
      messages: [...session.messages, processingMessage]
    }) : null);

    try {
      const cleanUrlString = url.endsWith('.git') ? url.slice(0, -4) : url;
      const urlObject = new URL(cleanUrlString);
      const urlParts = urlObject.pathname.split('/').filter(Boolean);

      if (urlParts.length < 2) throw new Error("Invalid GitHub URL format. Expected 'github.com/owner/repo'.");
      const [owner, repo] = urlParts;

      let contextBuilder = "Here is the code I would like to discuss:\n\n";
      let fetchedFilesCount = 0;

      const fetchDirectoryContents = async (path: string) => {
        const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        const response = await fetch(contentsUrl);

        if (!response.ok) {
            console.warn(`Could not fetch directory contents for: ${path}. Status: ${response.status}`);
            return;
        }
        
        const contents: any[] = await response.json();

        for (const item of contents) {
            if (item.type === 'file' && item.download_url) {
                try {
                    const contentResponse = await fetch(item.download_url);
                    if (contentResponse.ok) {
                        const content = await contentResponse.text();
                        const fileContext = `--- FILE: ${item.path} ---\n\n${content}\n\n`;
                        contextBuilder += fileContext;
                        fetchedFilesCount++;
                    }
                } catch (fileFetchError) {
                    console.warn(`Could not fetch content for file: ${item.path}`, fileFetchError);
                }
            } else if (item.type === 'dir') {
                await fetchDirectoryContents(item.path);
            }
        }
      };

      await fetchDirectoryContents('');
      
      if (fetchedFilesCount === 0) {
        throw new Error("Could not fetch any readable files from the repository.");
      }

      const finalContextMessage: ChatMessage = {
           id: `msg-${Date.now()}-system-complete`,
           role: ChatMessageRole.SYSTEM,
           content: `GitHub context created from ${fetchedFilesCount} file(s). You can now ask questions about the repository.`,
           timestamp: new Date(),
      };

      await updateChatSession(rawCurrentChatSession.id, session => session ? ({
          ...session,
          githubRepoContext: { url: cleanUrlString, contextText: contextBuilder },
          messages: [...session.messages.filter(m => m.id !== processingMessage.id), finalContextMessage],
      }) : null);
      
      useUIStore.getState().actions.showToast("GitHub repository context loaded!", "success");

    } catch (error: any) {
      console.error("Error processing GitHub repo:", error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-system-error`,
        role: ChatMessageRole.SYSTEM,
        content: `Error loading GitHub context: ${error.message}`,
        timestamp: new Date(),
      };
      await updateChatSession(rawCurrentChatSession.id, session => session ? ({
        ...session,
        messages: [...session.messages.filter(m => m.id !== processingMessage.id), errorMessage]
      }) : null);
      useUIStore.getState().actions.showToast(`Error: ${error.message}`, "error");
    }
  }, [rawCurrentChatSession, updateChatSession]);

  const performActualAudioCacheReset = useCallback(async (sessionId: string, messageId: string) => {
    await updateChatSession(sessionId, session => {
      if (!session) return null;
      const messageIndex = session.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return session;

      const updatedMessages = [...session.messages];
      updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], cachedAudioBuffers: null };
      return { ...session, messages: updatedMessages };
    });
    useUIStore.getState().actions.showToast("Audio cache reset for message.", "success");
  }, [updateChatSession]);

  const handleDeleteMultipleMessages = useCallback(async (messageIds: string[]) => {
    if (!rawCurrentChatSession || messageIds.length === 0) return;
    await updateChatSession(rawCurrentChatSession.id, session => {
      if (!session) return null;
      const idSet = new Set(messageIds);
      const newMessages = session.messages.filter(m => !idSet.has(m.id));
      persistence.setMessageGenerationTimes(prevTimes => {
        const newTimesState = { ...prevTimes };
        messageIds.forEach(id => delete newTimesState[id]);
        return newTimesState;
      }).catch(console.error);
      return { ...session, messages: newMessages };
    });
    useUIStore.getState().actions.showToast(`${messageIds.length} message(s) deleted.`, "success");
    useUIStore.getState().actions.toggleSelectionMode();
  }, [rawCurrentChatSession, updateChatSession, persistence]);

  const visibleMessagesForCurrentChat = useMemo(() => {
    if (!rawCurrentChatSession || !rawCurrentChatSession.id) return [];
    const countFromConfig = persistence.messagesToDisplayConfig[rawCurrentChatSession.id];
    const countFromSessionSettings = rawCurrentChatSession.settings?.maxInitialMessagesDisplayed;
    const countFromGlobalDefaults = DEFAULT_SETTINGS.maxInitialMessagesDisplayed;
    let numToDisplay = countFromConfig ?? countFromSessionSettings ?? countFromGlobalDefaults ?? INITIAL_MESSAGES_COUNT;
    return rawCurrentChatSession.messages.slice(-numToDisplay);
  }, [rawCurrentChatSession, persistence.messagesToDisplayConfig]);
  
  const stateValue = useMemo<ChatStateContextType>(() => ({
    chatHistory, currentChatId, currentChatSession: rawCurrentChatSession || null, visibleMessagesForCurrentChat,
    isLoadingData, editingTitleInfo: sidebarActions.editingTitleInfo,
    messagesToDisplayConfig: persistence.messagesToDisplayConfig,
    currentExportConfig: persistence.currentExportConfig,
    messageGenerationTimes: persistence.messageGenerationTimes,
    logApiRequest: gemini.logApiRequest,
  }), [chatHistory, currentChatId, rawCurrentChatSession, visibleMessagesForCurrentChat, isLoadingData,
      sidebarActions.editingTitleInfo, persistence.messagesToDisplayConfig,
      persistence.currentExportConfig, persistence.messageGenerationTimes, gemini.logApiRequest]);
      
  const interactionStatusValue = useMemo<ChatInteractionStatusContextType>(() => ({
    isLoading: gemini.isLoading,
    currentGenerationTimeDisplay: gemini.currentGenerationTimeDisplay,
    autoSendHook: autoSend,
  }), [gemini.isLoading, gemini.currentGenerationTimeDisplay, autoSend]);
  
  const actionsValue = useMemo<ChatActionsContextType>(() => ({
    setChatHistory, setCurrentChatId, updateChatSession, handleNewChat, handleSelectChat, handleDeleteChat,
    handleSendMessage: gemini.handleSendMessage,
    handleContinueFlow: gemini.handleContinueFlow,
    handleCancelGeneration: gemini.handleCancelGeneration,
    handleRegenerateAIMessage: gemini.handleRegenerateAIMessage,
    handleRegenerateResponseForUserMessage: gemini.handleRegenerateResponseForUserMessage,
    handleEditPanelSubmit: chatInteractions.handleEditPanelSubmitWrapper,
    handleToggleCharacterMode: aiCharacters.handleToggleCharacterMode,
    handleAddCharacter, handleEditCharacter, handleDeleteCharacter,
    handleReorderCharacters: aiCharacters.handleReorderCharacters,
    handleSaveCharacterContextualInfo: aiCharacters.handleSaveCharacterContextualInfo,
    handleExportChats: importExport.handleExportChats,
    handleImportAll: importExport.handleImportAll,
    setMessagesToDisplayConfig: persistence.setMessagesToDisplayConfig,
    setCurrentExportConfig: persistence.setCurrentExportConfig,
    handleManualSave: persistence.handleManualSave,
    handleStartEditChatTitle: sidebarActions.handleStartEditChatTitle,
    handleSaveChatTitle: sidebarActions.handleSaveChatTitle,
    handleCancelEditChatTitle: sidebarActions.handleCancelEditChatTitle,
    handleEditTitleInputChange: sidebarActions.handleEditTitleInputChange,
    handleDuplicateChat: sidebarActions.handleDuplicateChat,
    handleActualCopyMessage: chatInteractions.handleActualCopyMessage,
    handleDeleteMessageAndSubsequent: chatInteractions.handleDeleteMessageAndSubsequent,
    handleDeleteSingleMessageOnly: chatInteractions.handleDeleteSingleMessageOnly,
    handleLoadMoreDisplayMessages: chatInteractions.handleLoadMoreDisplayMessages,
    handleLoadAllDisplayMessages: chatInteractions.handleLoadAllDisplayMessages,
    handleClearApiLogs: chatInteractions.handleClearApiLogs,
    handleClearChatCacheForCurrentSession: chatInteractions.handleClearChatCacheForCurrentSession,
    handleReUploadAttachment: chatInteractions.handleReUploadAttachment,
    triggerAutoPlayForNewMessage: (callback) => { triggerAutoPlayCallbackRef.current = callback; (callback as any)._placeholder = false; },
    performActualAudioCacheReset,
    handleInsertEmptyMessageAfter: messageInjection.handleInsertEmptyMessageAfter,
    handleDeleteMultipleMessages,
    handleSetGithubRepo,
  }), [
    setChatHistory, setCurrentChatId, updateChatSession, handleNewChat, handleSelectChat, handleDeleteChat,
    gemini.handleSendMessage, gemini.handleContinueFlow, gemini.handleCancelGeneration,
    gemini.handleRegenerateAIMessage, gemini.handleRegenerateResponseForUserMessage,
    chatInteractions.handleEditPanelSubmitWrapper, aiCharacters.handleToggleCharacterMode,
    handleAddCharacter, handleEditCharacter, handleDeleteCharacter, aiCharacters.handleReorderCharacters,
    aiCharacters.handleSaveCharacterContextualInfo, importExport.handleExportChats,
    importExport.handleImportAll, persistence.setMessagesToDisplayConfig,
    persistence.setCurrentExportConfig, persistence.handleManualSave,
    sidebarActions.handleStartEditChatTitle, sidebarActions.handleSaveChatTitle,
    sidebarActions.handleCancelEditChatTitle, sidebarActions.handleEditTitleInputChange,
    sidebarActions.handleDuplicateChat, chatInteractions.handleActualCopyMessage,
    chatInteractions.handleDeleteMessageAndSubsequent, chatInteractions.handleDeleteSingleMessageOnly,
    chatInteractions.handleLoadMoreDisplayMessages, chatInteractions.handleLoadAllDisplayMessages,
    chatInteractions.handleClearApiLogs, chatInteractions.handleClearChatCacheForCurrentSession,
    chatInteractions.handleReUploadAttachment, performActualAudioCacheReset,
    messageInjection.handleInsertEmptyMessageAfter, handleDeleteMultipleMessages, handleSetGithubRepo
  ]);
  
  (actionsValue.triggerAutoPlayForNewMessage as any)._placeholder = true;

  return (
    <ChatStateContext.Provider value={stateValue}>
      <ChatInteractionStatusContext.Provider value={interactionStatusValue}>
        <ChatActionsContext.Provider value={actionsValue}>
          {children}
        </ChatActionsContext.Provider>
      </ChatInteractionStatusContext.Provider>
    </ChatStateContext.Provider>
  );
};

export const useChatState = (): ChatStateContextType => {
  const context = useContext(ChatStateContext);
  if (!context) throw new Error('useChatState must be used within a ChatProvider');
  return context;
};
export const useChatInteractionStatus = (): ChatInteractionStatusContextType => {
  const context = useContext(ChatInteractionStatusContext);
  if (!context) throw new Error('useChatInteractionStatus must be used within a ChatProvider');
  return context;
};
export const useChatActions = (): ChatActionsContextType => {
  const context = useContext(ChatActionsContext);
  if (!context) throw new Error('useChatActions must be used within a ChatProvider');
  return context;
};
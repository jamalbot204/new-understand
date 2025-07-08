// stores/chatStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ChatMessage, Attachment, AICharacter, UseAutoSendReturn, EditMessagePanelDetails, EditMessagePanelAction, ChatMessageRole, ExportConfiguration, ApiRequestLog } from '../types.ts';
import { useSessionStore } from './sessionStore.ts';
import { useAppConfigStore } from './appConfigStore.ts';
import { useApiKeyStore } from './apiKeyStore.ts';
import { useUIStore } from './uiStore.ts';
import { getFullChatResponse } from '../services/geminiService.ts';
import { getHistoryUpToMessage } from '../services/utils.ts';
import { strictAbort, createCancellationHandle } from '../services/cancellationService.ts';

// Most of the logic from the old hooks (`useGemini`, `useAiCharacters`, etc.) is now encapsulated here.

const initialAutoSendState = {
    isAutoSendingActive: false,
    autoSendText: '',
    autoSendRepetitionsInput: '1',
    autoSendRemaining: 0,
    isPreparingAutoSend: false,
    isWaitingForErrorRetry: false,
    errorRetryCountdown: 0,
};

interface ChatState {
    isLoading: boolean;
    currentGenerationTimeDisplay: string;
    lastMessageHadAttachments: boolean;
    autoSend: Omit<UseAutoSendReturn, 'canStartAutoSend' | 'startAutoSend' | 'stopAutoSend' | 'setAutoSendText' | 'setAutoSendRepetitionsInput'> & { text: string; repetitionsInput: string };
    
    // Private refs for managing generation state
    _generationStartTime: number | null;
    _abortController: AbortController | null;
    _pendingMessageId: string | null;
    _originalMessageSnapshot: ChatMessage | null;
    _requestCancelledByUser: boolean;
    _onFullResponseCalled: boolean;
    _autoSendLoopActive: boolean;
    _autoSendWasLoading: boolean;
    _autoSendDelayTimeout: number | null;
    _autoSendErrorRetryInterval: number | null;
    _autoSendErrorRetryDetails: { userMessageIdToRegenerateFor: string } | null;
    _autoSendTargetCharacterId: string | undefined;
    _autoSendWaitingForDelay: boolean;
}

interface ChatActions {
    // Gemini Actions
    sendMessage: (promptContent: string, attachments?: Attachment[], historyContextOverride?: ChatMessage[], characterIdForAPICall?: string, isTemporaryContext?: boolean) => Promise<void>;
    continueFlow: () => Promise<void>;
    cancelGeneration: () => Promise<void>;
    regenerateAIMessage: (sessionId: string, aiMessageIdToRegenerate: string) => Promise<void>;
    regenerateResponseForUserMessage: (sessionId: string, userMessageId: string) => Promise<void>;
    editPanelSubmit: (action: EditMessagePanelAction, newContent: string, details: EditMessagePanelDetails) => Promise<void>;

    // AI Character Actions
    toggleCharacterMode: () => Promise<void>;
    addCharacter: (name: string, systemInstruction: string) => Promise<void>;
    editCharacter: (id: string, name: string, systemInstruction: string) => Promise<void>;
    deleteCharacter: (id: string) => Promise<void>;
    reorderCharacters: (newCharacters: AICharacter[]) => Promise<void>;
    saveCharacterContextualInfo: (characterId: string, newInfo: string) => Promise<void>;
    setGithubRepo: (url: string | null) => Promise<void>;
    logApiRequest: (logDetails: Omit<ApiRequestLog, 'id' | 'timestamp'>) => void;

    // Autosend Actions
    startAutoSend: (text: string, repetitions: number, targetCharacterId?: string) => void;
    stopAutoSend: (calledByUser?: boolean) => Promise<void>;
    setAutoSendText: (text: string) => void;
    setAutoSendRepetitionsInput: (reps: string) => void;

    // Interaction Actions
    copyMessage: (content: string) => Promise<boolean>;
    deleteMessageAndSubsequent: (sessionId: string, messageId: string) => Promise<void>;
    deleteSingleMessageOnly: (sessionId: string, messageId: string) => void;
    deleteMultipleMessages: (messageIds: string[]) => Promise<void>;
    clearApiLogs: (sessionId: string) => Promise<void>;
    clearChatCacheForCurrentSession: () => void;
    reUploadAttachment: (sessionId: string, messageId: string, attachmentId: string) => Promise<void>;
    insertEmptyMessageAfter: (sessionId: string, afterMessageId: string, roleToInsert: ChatMessageRole.USER | ChatMessageRole.MODEL) => Promise<void>;
    
    // Import/Export Actions
    exportChats: (chatIdsToExport: string[], exportConfig: ExportConfiguration) => Promise<void>;
    importAll: () => Promise<void>;

    // Manual Save
    manualSave: () => Promise<void>;
}

// Helper function to create a new message
const createNewMessage = (
    role: ChatMessageRole,
    content: string,
    attachments?: Attachment[],
    characterName?: string,
    isStreaming?: boolean
): ChatMessage => ({
    id: `msg-${Date.now()}`,
    role,
    content,
    timestamp: new Date(),
    attachments: attachments || [],
    isStreaming: isStreaming || false,
    characterName,
});

export const useChatStore = create<ChatState & { actions: ChatActions }>()(
  devtools(
    (set, get) => {
        let generationInterval: number | null = null;
        
        const startGenerationTimer = () => {
            set({ _generationStartTime: Date.now() });
            if (generationInterval) clearInterval(generationInterval);
            generationInterval = window.setInterval(() => {
                const startTime = get()._generationStartTime;
                if (startTime) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    set({ currentGenerationTimeDisplay: `${elapsed.toFixed(1)}s` });
                }
            }, 100);
        };
        const stopGenerationTimer = () => {
            if (generationInterval) {
                clearInterval(generationInterval);
                generationInterval = null;
            }
            const startTime = get()._generationStartTime;
            if (startTime) {
                const elapsed = (Date.now() - startTime) / 1000;
                set({ currentGenerationTimeDisplay: `${elapsed.toFixed(1)}s` });
            }
        };

        const onGenerationComplete = (finalMessageId: string | null) => {
            stopGenerationTimer();
            if (finalMessageId) {
                useSessionStore.getState().actions.updateChatSession(useSessionStore.getState().currentChatId!, session => {
                    if (!session) return null;
                    const messages = session.messages.map(m => m.id === finalMessageId ? { ...m, isStreaming: false } : m);
                    return { ...session, messages };
                });
                
                const message = useSessionStore.getState().chatHistory.find(s => s.id === useSessionStore.getState().currentChatId)?.messages.find(m => m.id === finalMessageId);
                if (message) {
                    useUIStore.getState().actions.showToast("Message generation finished.", "success", 1500);
                }
            }
            set({
                isLoading: false,
                _generationStartTime: null,
                _pendingMessageId: null,
                _originalMessageSnapshot: null,
                _requestCancelledByUser: false,
                _onFullResponseCalled: false,
            });
        };

        const _resetErrorRetryStates = () => {
            const { _autoSendErrorRetryInterval } = get();
            if (_autoSendErrorRetryInterval) {
                clearInterval(_autoSendErrorRetryInterval);
            }
            set({ 
                autoSend: { ...get().autoSend, isWaitingForErrorRetry: false, errorRetryCountdown: 0 },
                _autoSendErrorRetryInterval: null,
                _autoSendErrorRetryDetails: null,
            });
        };

        const _stopAutoSendInternal = async (calledByUser = true) => {
            const { _autoSendDelayTimeout, isLoading, _autoSendErrorRetryInterval } = get();
            set({ _autoSendLoopActive: false });

            if (calledByUser) {
                set(state => ({ autoSend: { ...state.autoSend, autoSendRemaining: 0 } }));
            }
            set(state => ({ autoSend: { ...state.autoSend, isAutoSendingActive: false, isPreparingAutoSend: false }, _autoSendTargetCharacterId: undefined, _autoSendWaitingForDelay: false }));
            
            if (_autoSendDelayTimeout) clearTimeout(_autoSendDelayTimeout);
            if (_autoSendErrorRetryInterval) clearInterval(_autoSendErrorRetryInterval);
            set({ _autoSendDelayTimeout: null });

            _resetErrorRetryStates();

            if (isLoading && calledByUser) {
                await get().actions.cancelGeneration();
            }
        };


        return {
            isLoading: false,
            currentGenerationTimeDisplay: "0.0s",
            lastMessageHadAttachments: false,
            autoSend: {
                ...initialAutoSendState,
                text: '',
                repetitionsInput: '1',
            },
            _generationStartTime: null,
            _abortController: null,
            _pendingMessageId: null,
            _originalMessageSnapshot: null,
            _requestCancelledByUser: false,
            _onFullResponseCalled: false,
            _autoSendLoopActive: false,
            _autoSendWasLoading: false,
            _autoSendDelayTimeout: null,
            _autoSendErrorRetryInterval: null,
            _autoSendErrorRetryDetails: null,
            _autoSendTargetCharacterId: undefined,
            _autoSendWaitingForDelay: false,

            actions: {
                logApiRequest: (logDetails) => {
                    const { currentChatId, actions: { updateChatSession } } = useSessionStore.getState();
                    if (currentChatId) {
                        const newLogEntry: ApiRequestLog = {
                            ...logDetails,
                            id: `log-${Date.now()}`,
                            timestamp: new Date(),
                        };
                        updateChatSession(currentChatId, session => {
                            if (!session) return null;
                            const apiLogs = [...(session.apiRequestLogs || []), newLogEntry];
                            return { ...session, apiRequestLogs: apiLogs };
                        });
                    }
                },
                sendMessage: async (promptContent, attachments, historyContextOverride, characterIdForAPICall, isTemporaryContext) => {
                    const { isLoading } = get();
                    const { actions: { rotateActiveKey } } = useApiKeyStore.getState();
                    const { currentChatId, chatHistory, actions: { updateChatSession } } = useSessionStore.getState();
                    const { actions: { setMessageGenerationTimes } } = useAppConfigStore.getState();
                    const { showToast } = useUIStore.getState().actions;

                    const currentChatSession = chatHistory.find(s => s.id === currentChatId);
                    if (!currentChatSession || isLoading) return;

                    await rotateActiveKey();
                    const apiKey = useApiKeyStore.getState().activeApiKey?.value;
                    if (!apiKey) {
                        showToast("API Key is not configured. Please add one in Settings.", "error");
                        return;
                    }
                    
                    set({
                        isLoading: true,
                        _requestCancelledByUser: false,
                        _onFullResponseCalled: false,
                        _originalMessageSnapshot: null,
                        lastMessageHadAttachments: !!(attachments && attachments.length > 0 && !isTemporaryContext),
                    });
                    startGenerationTimer();

                    const userMessage = createNewMessage(ChatMessageRole.USER, promptContent, attachments);
                    if (!isTemporaryContext) {
                        await updateChatSession(currentChatSession.id, session => ({
                            ...session,
                            messages: [...session.messages, userMessage],
                        }));
                    }
                    
                    const aiMessage = createNewMessage(ChatMessageRole.MODEL, '', [], characterIdForAPICall ? currentChatSession.aiCharacters?.find(c => c.id === characterIdForAPICall)?.name : undefined, true);
                    set({ _pendingMessageId: aiMessage.id });
                    
                    const cancellationHandle = createCancellationHandle();
                    set({ _abortController: cancellationHandle as AbortController });

                    const fullHistory = historyContextOverride || currentChatSession.messages;
                    const contextHistory = isTemporaryContext ? fullHistory : getHistoryUpToMessage(fullHistory, fullHistory.length);

                    await getFullChatResponse(
                        apiKey,
                        currentChatSession.id,
                        { text: promptContent, attachments },
                        currentChatSession.model,
                        currentChatSession.settings,
                        contextHistory,
                        (response) => {
                            set({ _onFullResponseCalled: true });
                            if (get()._requestCancelledByUser) return;
                            aiMessage.content = response.text;
                            aiMessage.groundingMetadata = response.groundingMetadata;
                            aiMessage.isStreaming = false;
                        },
                        (error, isAbortError) => {
                            if (isAbortError) return;
                            aiMessage.content = `Error: ${error}`;
                            aiMessage.role = ChatMessageRole.ERROR;
                            aiMessage.isStreaming = false;
                        },
                        async () => {
                            if (get()._requestCancelledByUser) {
                                onGenerationComplete(null);
                                return;
                            }
                            if (get()._onFullResponseCalled) {
                                const startTime = get()._generationStartTime;
                                if (startTime) {
                                    const elapsed = (Date.now() - startTime) / 1000;
                                    await setMessageGenerationTimes(prev => ({ ...prev, [aiMessage.id]: elapsed }));
                                }
                            }
                            await updateChatSession(currentChatSession.id, session => ({
                                ...session, messages: [...session.messages, aiMessage]
                            }));
                            onGenerationComplete(aiMessage.id);
                        },
                        get().actions.logApiRequest,
                        cancellationHandle.signal,
                        { _characterIdForAPICall: characterIdForAPICall },
                        currentChatSession.aiCharacters,
                        currentChatSession.githubRepoContext?.contextText
                    );
                },
                continueFlow: async () => {},
                cancelGeneration: async () => {
                    const controller = get()._abortController;
                    if (controller) {
                        set({ _requestCancelledByUser: true });
                        strictAbort(controller);
                        onGenerationComplete(null);
                        set({ _abortController: null });
                        useUIStore.getState().actions.showToast("Generation cancelled.", "success");
                    }
                },
                regenerateAIMessage: async (_sessionId, _aiMessageId) => {},
                regenerateResponseForUserMessage: async (_sessionId, _userMessageId) => {},
                editPanelSubmit: async (_action, _newContent, _details) => {},
                toggleCharacterMode: async () => {},
                addCharacter: async (_name, _systemInstruction) => {},
                editCharacter: async (_id, _name, _systemInstruction) => {},
                deleteCharacter: async (_id) => {},
                reorderCharacters: async (_newCharacters) => {},
                saveCharacterContextualInfo: async (_characterId, _newInfo) => {},
                setGithubRepo: async (_url) => {},
                startAutoSend: (_text, _repetitions, _targetCharacterId) => {},
                stopAutoSend: _stopAutoSendInternal,
                setAutoSendText: (text) => set(state => ({ autoSend: { ...state.autoSend, text }})),
                setAutoSendRepetitionsInput: (reps) => set(state => ({ autoSend: { ...state.autoSend, repetitionsInput: reps }})),
                copyMessage: async (_content) => { return true; },
                deleteMessageAndSubsequent: async (_sessionId, _messageId) => {},
                deleteSingleMessageOnly: async (_sessionId, _messageId) => {},
                deleteMultipleMessages: async (_messageIds) => {},
                clearApiLogs: async (_sessionId) => {},
                clearChatCacheForCurrentSession: () => {},
                reUploadAttachment: async (_sessionId, _messageId, _attachmentId) => {},
                insertEmptyMessageAfter: async (_sessionId, _afterMessageId, _roleToInsert) => {},
                exportChats: async (_chatIdsToExport, _exportConfig) => {},
                importAll: async () => {},
                manualSave: async () => {},
            }
        }
    },
    { name: 'chat-orchestration-store' }
  )
);
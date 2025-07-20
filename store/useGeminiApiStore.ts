
import { create } from 'zustand';
import { useApiKeyStore } from './useApiKeyStore.ts';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useDataStore } from './useDataStore.ts';
import { useAudioStore } from './useAudioStore.ts';
import {
    ChatMessage, ChatMessageRole, GeminiSettings, Attachment,
    FullResponseData, UserMessageInput, LogApiRequestCallback, ApiRequestLog
} from '../types.ts';
import { getFullChatResponse, generateMimicUserResponse, mapMessagesToFlippedRoleGeminiHistory } from '../services/geminiService.ts';
import { EditMessagePanelAction, EditMessagePanelDetails } from '../components/EditMessagePanel.tsx';
import { findPrecedingUserMessageIndex, getHistoryUpToMessage } from '../services/utils.ts';

interface GeminiApiState {
    isLoading: boolean;
    currentGenerationTimeDisplay: string;
    lastMessageHadAttachments: boolean;
}

interface GeminiApiActions {
    logApiRequest: LogApiRequestCallback;
    handleSendMessage: (
        promptContent: string,
        attachments?: Attachment[],
        historyContextOverride?: ChatMessage[],
        characterIdForAPICall?: string,
        isTemporaryContext?: boolean
    ) => Promise<void>;
    handleContinueFlow: () => Promise<void>;
    handleCancelGeneration: () => Promise<void>;
    handleRegenerateAIMessage: (aiMessageIdToRegenerate: string) => Promise<void>;
    handleRegenerateResponseForUserMessage: (userMessageId: string) => Promise<void>;
    handleEditPanelSubmit: (action: EditMessagePanelAction, newContent: string, editingMessageDetail: EditMessagePanelDetails) => Promise<void>;
}

export const useGeminiApiStore = create<GeminiApiState & GeminiApiActions>((set, get) => {
    let generationStartTimeRef: number | null = null;
    let abortControllerRef: AbortController | null = null;
    let pendingMessageIdRef: string | null = null;
    let originalMessageSnapshotRef: ChatMessage | null = null;
    let requestCancelledByUserRef = false;
    let onFullResponseCalledForPendingMessageRef = false;
    
    let timerIntervalId: number | undefined;

    const setIsLoading = (loading: boolean) => {
        set({ isLoading: loading });
        if (loading) {
            generationStartTimeRef = Date.now();
            if (timerIntervalId) clearInterval(timerIntervalId);
            set({ currentGenerationTimeDisplay: "0.0s" });
            timerIntervalId = window.setInterval(() => {
                if (generationStartTimeRef !== null) {
                    const elapsedSeconds = (Date.now() - generationStartTimeRef) / 1000;
                    set({ currentGenerationTimeDisplay: `${elapsedSeconds.toFixed(1)}s` });
                }
            }, 100);
        } else {
            if (timerIntervalId) clearInterval(timerIntervalId);
            timerIntervalId = undefined;
            generationStartTimeRef = null;
            set({ currentGenerationTimeDisplay: "0.0s" });
        }
    };

    const logApiRequestDirectly: LogApiRequestCallback = (logDetails) => {
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        if (currentChatSession && currentChatSession.settings.debugApiRequests) {
            const newLogEntry: ApiRequestLog = { ...logDetails, id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, timestamp: new Date() };
            updateCurrentChatSession(session => session ? ({ ...session, apiRequestLogs: [...(session.apiRequestLogs || []), newLogEntry] }) : null);
        }
    };
    
    const handleCancelGeneration = async () => {
        const { updateCurrentChatSession } = useActiveChatStore.getState();
        if (abortControllerRef && !abortControllerRef.signal.aborted) {
            requestCancelledByUserRef = true;
            abortControllerRef.abort();
        }

        setIsLoading(false);
        set({ lastMessageHadAttachments: false });
        onFullResponseCalledForPendingMessageRef = false;
        const currentPendingMessageId = pendingMessageIdRef;
        const currentOriginalSnapshot = originalMessageSnapshotRef;

        const { currentChatSession } = useActiveChatStore.getState();
        if (currentChatSession?.id && currentPendingMessageId) {
             if (currentOriginalSnapshot && currentOriginalSnapshot.id === currentPendingMessageId) {
                await updateCurrentChatSession(session => session ? ({...session, messages: session.messages.map(msg => msg.id === currentOriginalSnapshot.id ? currentOriginalSnapshot : msg)}) : null);
            } else {
                await updateCurrentChatSession(session => {
                    if (!session) return null;
                    const messageToRemove = session.messages.find(msg => msg.id === currentPendingMessageId && (msg.isStreaming || msg.content === ''));
                    if (messageToRemove) { return { ...session, messages: session.messages.filter(msg => msg.id !== currentPendingMessageId) }; }
                    return session;
                });
            }
        }
        pendingMessageIdRef = null;
        originalMessageSnapshotRef = null;
    };

    const handleSendMessage = (
        promptContent: string, attachments?: Attachment[], historyContextOverride?: ChatMessage[],
        characterIdForAPICall?: string, isTemporaryContext?: boolean
      ): Promise<void> => {
        return new Promise(async (resolve) => {
            const { rotateActiveKey } = useApiKeyStore.getState();
            const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
            const { setMessageGenerationTimes } = useDataStore.getState();

            if (!currentChatSession || get().isLoading) return resolve();
            
            const keyToUse = await rotateActiveKey();

            if (!keyToUse?.value) {
                updateCurrentChatSession(session => {
                    if (!session) return null;
                    const errorMessage: ChatMessage = {
                        id: `err-${Date.now()}`,
                        role: ChatMessageRole.ERROR,
                        content: "No API key set. Please go to Settings > API Key to set your key.",
                        timestamp: new Date(),
                    };
                    return { ...session, messages: [...session.messages, errorMessage] };
                });
                return resolve();
            }
        
            requestCancelledByUserRef = false;
            onFullResponseCalledForPendingMessageRef = false;
            if (!isTemporaryContext) {
                originalMessageSnapshotRef = null;
            }
            set({lastMessageHadAttachments: !!(attachments && attachments.length > 0 && !isTemporaryContext)});
        
            let sessionToUpdate = { ...currentChatSession };
            let baseSettingsForAPICall = { ...currentChatSession.settings };
            let settingsOverrideForAPICall: Partial<GeminiSettings & { _characterIdForAPICall?: string }> = {};
            let characterNameForResponse: string | undefined = undefined;
            let userMessageIdForPotentialTitleUpdate: string | null = null;
        
            if (currentChatSession.isCharacterModeActive && characterIdForAPICall) {
                const character = (currentChatSession.aiCharacters || []).find(c => c.id === characterIdForAPICall);
                if (character) {
                    settingsOverrideForAPICall.systemInstruction = character.systemInstruction;
                    settingsOverrideForAPICall.userPersonaInstruction = undefined;
                    settingsOverrideForAPICall._characterIdForAPICall = character.id;
                    characterNameForResponse = character.name;
                } else { return resolve(); }
            }
        
            let finalUserMessageInputForAPI: UserMessageInput;
            if (currentChatSession.isCharacterModeActive && characterIdForAPICall && !promptContent.trim() && (!attachments || attachments.length === 0) && !historyContextOverride) {
                const characterTriggered = (currentChatSession.aiCharacters || []).find(c => c.id === characterIdForAPICall);
                finalUserMessageInputForAPI = (characterTriggered?.contextualInfo?.trim()) ? { text: characterTriggered.contextualInfo, attachments: [] } : { text: "", attachments: [] };
            } else {
                finalUserMessageInputForAPI = { text: promptContent, attachments: attachments || [] };
            }
        
            if (!characterIdForAPICall && !historyContextOverride && !finalUserMessageInputForAPI.text.trim() && (!finalUserMessageInputForAPI.attachments || finalUserMessageInputForAPI.attachments.length === 0) && !currentChatSession.githubRepoContext) return resolve();
        
            let historyForGeminiSDK: ChatMessage[] = historyContextOverride ? [...historyContextOverride] : [...sessionToUpdate.messages];
        
            let currentTurnUserMessageForUI: ChatMessage | null = null;
            if (!isTemporaryContext) {
                currentTurnUserMessageForUI = { id: `msg-${Date.now()}-user-turn-${Math.random().toString(36).substring(2,7)}`, role: ChatMessageRole.USER, content: finalUserMessageInputForAPI.text, attachments: finalUserMessageInputForAPI.attachments?.map(att => ({...att})), timestamp: new Date() };
                userMessageIdForPotentialTitleUpdate = currentTurnUserMessageForUI.id;
            }
        
            setIsLoading(true);
            abortControllerRef = new AbortController();
        
            const modelMessageId = pendingMessageIdRef || `msg-${Date.now()}-model-${Math.random().toString(36).substring(2,7)}`;
            pendingMessageIdRef = modelMessageId;
            const placeholderAiMessage: ChatMessage = { id: modelMessageId, role: ChatMessageRole.MODEL, content: '', timestamp: new Date(), isStreaming: true, characterName: characterNameForResponse };
        
            let messagesForUIUpdate: ChatMessage[] = [...historyForGeminiSDK];
            if (currentTurnUserMessageForUI) messagesForUIUpdate.push(currentTurnUserMessageForUI);
            
            const existingMessageIndex = messagesForUIUpdate.findIndex(m => m.id === modelMessageId);
            if (existingMessageIndex > -1) {
                messagesForUIUpdate[existingMessageIndex] = placeholderAiMessage;
            } else {
                messagesForUIUpdate.push(placeholderAiMessage);
            }
        
            let newTitleForSession = sessionToUpdate.title;
            if (userMessageIdForPotentialTitleUpdate && sessionToUpdate.title === "New Chat") {
                const userMessagesInHistory = historyForGeminiSDK.filter(m => m.role === ChatMessageRole.USER).length;
                if (userMessagesInHistory === 0) {
                     newTitleForSession = (finalUserMessageInputForAPI.text || "Chat with attachments").substring(0, 35) + ((finalUserMessageInputForAPI.text.length > 35 || (!finalUserMessageInputForAPI.text && finalUserMessageInputForAPI.attachments && finalUserMessageInputForAPI.attachments.length > 0)) ? "..." : "");
                }
            }
        
            await updateCurrentChatSession(s => s ? ({ ...s, messages: messagesForUIUpdate, lastUpdatedAt: new Date(), title: newTitleForSession }) : null);
        
            const activeChatIdForThisCall = currentChatSession.id;
        
            await getFullChatResponse(
                keyToUse.value, activeChatIdForThisCall, finalUserMessageInputForAPI, currentChatSession.model, baseSettingsForAPICall,
                historyForGeminiSDK,
                async (responseData: FullResponseData) => {
                    if (requestCancelledByUserRef && pendingMessageIdRef === modelMessageId) return;
                    onFullResponseCalledForPendingMessageRef = true;
                    if (generationStartTimeRef) await setMessageGenerationTimes(prev => ({...prev, [modelMessageId]: (Date.now() - (generationStartTimeRef || 0)) / 1000}));
                    
                    const originalMessageSnapshot = originalMessageSnapshotRef;
                    let finalContent = responseData.text;
                    if(originalMessageSnapshot && originalMessageSnapshot.id === modelMessageId && isTemporaryContext) {
                        finalContent = originalMessageSnapshot.content + responseData.text;
                    }
                    const newAiMessage: ChatMessage = { ...placeholderAiMessage, content: finalContent, groundingMetadata: responseData.groundingMetadata, isStreaming: false, timestamp: new Date(), characterName: characterNameForResponse };
                    
                    await updateCurrentChatSession(session => session ? ({...session, messages: session.messages.map(msg => msg.id === modelMessageId ? newAiMessage : msg)}) : null);
                    
                    const { triggerAutoPlayForNewMessage } = useAudioStore.getState();
                    await triggerAutoPlayForNewMessage(newAiMessage);
                },
                async (errorMsg, isAbortError) => {
                    if (requestCancelledByUserRef && pendingMessageIdRef === modelMessageId) { setIsLoading(false); set({ lastMessageHadAttachments: false }); return; }
                    onFullResponseCalledForPendingMessageRef = false;
                    const finalErrorMessage = isAbortError ? `Response aborted.` : `Response failed: ${errorMsg}`;
                    await updateCurrentChatSession(session => session ? ({ ...session, messages: session.messages.map(msg => msg.id === modelMessageId ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: finalErrorMessage, characterName: characterNameForResponse } : msg)}) : null);
                    if (!requestCancelledByUserRef && pendingMessageIdRef === modelMessageId) { setIsLoading(false); set({ lastMessageHadAttachments: false }); }
                },
                async () => {
                    const userDidCancel = requestCancelledByUserRef;
                    const currentPendingMsgIdForComplete = pendingMessageIdRef;
                    if (userDidCancel && currentPendingMsgIdForComplete === modelMessageId) {}
                    else if (currentPendingMsgIdForComplete === modelMessageId) {
                        setIsLoading(false); set({ lastMessageHadAttachments: false });
                        if (!onFullResponseCalledForPendingMessageRef) {
                            await updateCurrentChatSession(session => {
                                if (!session) return null;
                                const messageInState = session.messages.find(m => m.id === modelMessageId);
                                if (messageInState && messageInState.isStreaming && messageInState.role !== ChatMessageRole.ERROR) {
                                    return { ...session, messages: session.messages.map(msg => msg.id === modelMessageId ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: "Response processing failed or stream ended unexpectedly.", timestamp: new Date(), characterName: characterNameForResponse } : msg ), lastUpdatedAt: new Date() };
                                }
                                return { ...session, lastUpdatedAt: new Date() };
                            });
                        } else {
                            await updateCurrentChatSession(session => session ? { ...session, lastUpdatedAt: new Date() } : null);
                        }
                        pendingMessageIdRef = null; originalMessageSnapshotRef = null;
                    }
                    if (abortControllerRef && currentPendingMsgIdForComplete === modelMessageId) abortControllerRef = null;
                    if (currentPendingMsgIdForComplete === modelMessageId) requestCancelledByUserRef = false;
                    onFullResponseCalledForPendingMessageRef = false;
                    resolve(); // Resolve the promise here
                },
                logApiRequestDirectly, abortControllerRef.signal, settingsOverrideForAPICall,
                currentChatSession.aiCharacters, currentChatSession.githubRepoContext?.contextText
            );
        });
      };

    const handleContinueFlow = async () => {
        const { currentChatSession } = useActiveChatStore.getState();
        const { rotateActiveKey } = useApiKeyStore.getState();
        if (!currentChatSession || get().isLoading || currentChatSession.isCharacterModeActive) return;
        if (currentChatSession.messages.length === 0) return;

        const keyToUse = await rotateActiveKey();
        if (!keyToUse?.value) {
             await useActiveChatStore.getState().updateCurrentChatSession(session => session ? ({ ...session, messages: [...session.messages, {id: `err-${Date.now()}`, role: ChatMessageRole.ERROR, content: "No API key available for Continue Flow.", timestamp: new Date()}]}) : null);
             return;
        }

        requestCancelledByUserRef = false;
        
        const { settings, model, messages } = currentChatSession;
        const lastMessage = messages[messages.length - 1];

        if (lastMessage.role === ChatMessageRole.MODEL) {
            setIsLoading(true);
            abortControllerRef = new AbortController();
            try {
                const historyForMimic = mapMessagesToFlippedRoleGeminiHistory(messages, settings);
                const mimicContent = await generateMimicUserResponse(
                    keyToUse.value, model, historyForMimic, settings.userPersonaInstruction || '',
                    settings, logApiRequestDirectly, abortControllerRef.signal
                );
                if (requestCancelledByUserRef) return;
                setIsLoading(false); // Mimic complete, now send as user
                await get().handleSendMessage(mimicContent, [], messages);

            } catch (error: any) {
                console.error("Error during Continue Flow (user mimic):", error);
                const errorMessage = `Flow generation failed: ${error.message}`;
                await useActiveChatStore.getState().updateCurrentChatSession(session => session ? ({ ...session, messages: [...session.messages, {id: `err-${Date.now()}`, role: ChatMessageRole.ERROR, content: errorMessage, timestamp: new Date()}]}) : null);
                setIsLoading(false);
            }
        } else {
            await get().handleSendMessage('', [], messages);
        }
    };

    const handleRegenerateAIMessage = async (aiMessageIdToRegenerate: string) => {
        const { rotateActiveKey } = useApiKeyStore.getState();
        const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
        const { setMessageGenerationTimes } = useDataStore.getState();

        if (!currentChatSession || get().isLoading) return;
        
        const keyToUse = await rotateActiveKey();
        if (!keyToUse?.value) {
            updateCurrentChatSession(session => {
                if (!session) return null;
                const errorMessage: ChatMessage = { id: `err-${Date.now()}`, role: ChatMessageRole.ERROR, content: "No API key set. Please go to Settings > API Key to set your key.", timestamp: new Date() };
                return { ...session, messages: [...session.messages, errorMessage] };
            });
            return;
        }

        const messageIndex = currentChatSession.messages.findIndex(m => m.id === aiMessageIdToRegenerate);
        if (messageIndex === -1) return;
        
        const originalAiMessage = currentChatSession.messages[messageIndex];
        if (originalAiMessage.role !== ChatMessageRole.MODEL && originalAiMessage.role !== ChatMessageRole.ERROR) return;

        const precedingUserMessageIndex = findPrecedingUserMessageIndex(currentChatSession.messages, messageIndex);
        if (precedingUserMessageIndex === -1) return;

        const userMessage = currentChatSession.messages[precedingUserMessageIndex];
        const historyForGeminiSDK = getHistoryUpToMessage(currentChatSession.messages, precedingUserMessageIndex);
        
        requestCancelledByUserRef = false;
        onFullResponseCalledForPendingMessageRef = false;
        originalMessageSnapshotRef = null;
        
        setIsLoading(true);
        abortControllerRef = new AbortController();
        pendingMessageIdRef = aiMessageIdToRegenerate;

        const placeholderAiMessage: ChatMessage = { 
            ...originalAiMessage,
            content: '', 
            timestamp: new Date(), 
            isStreaming: true, 
            role: ChatMessageRole.MODEL,
            cachedAudioBuffers: null, 
            groundingMetadata: undefined 
        };

        await updateCurrentChatSession(session => {
            if (!session) return null;
            const newMessages = session.messages.map(msg => 
                msg.id === aiMessageIdToRegenerate ? placeholderAiMessage : msg
            );
            return { ...session, messages: newMessages };
        });

        const finalUserMessageInputForAPI: UserMessageInput = { text: userMessage.content, attachments: userMessage.attachments || [] };
        const baseSettingsForAPICall = { ...currentChatSession.settings };
        let settingsOverrideForAPICall: Partial<GeminiSettings & { _characterIdForAPICall?: string }> = {};
        if (currentChatSession.isCharacterModeActive && originalAiMessage.characterName) {
            const character = (currentChatSession.aiCharacters || []).find(c => c.name === originalAiMessage.characterName);
            if (character) {
                settingsOverrideForAPICall.systemInstruction = character.systemInstruction;
                settingsOverrideForAPICall.userPersonaInstruction = undefined;
                settingsOverrideForAPICall._characterIdForAPICall = character.id;
            }
        }

        await getFullChatResponse(
            keyToUse.value, 
            currentChatSession.id, 
            finalUserMessageInputForAPI, 
            currentChatSession.model, 
            baseSettingsForAPICall,
            historyForGeminiSDK,
            async (responseData: FullResponseData) => {
                if (requestCancelledByUserRef && pendingMessageIdRef === aiMessageIdToRegenerate) return;
                onFullResponseCalledForPendingMessageRef = true;
                if (generationStartTimeRef) await setMessageGenerationTimes(prev => ({...prev, [aiMessageIdToRegenerate]: (Date.now() - (generationStartTimeRef || 0)) / 1000}));
                
                const newAiMessage: ChatMessage = { 
                    ...placeholderAiMessage, 
                    content: responseData.text, 
                    groundingMetadata: responseData.groundingMetadata, 
                    isStreaming: false, 
                    timestamp: new Date(), 
                };
                
                await updateCurrentChatSession(session => session ? ({...session, messages: session.messages.map(msg => msg.id === aiMessageIdToRegenerate ? newAiMessage : msg)}) : null);
                
                const { triggerAutoPlayForNewMessage } = useAudioStore.getState();
                await triggerAutoPlayForNewMessage(newAiMessage);
            },
            async (errorMsg, isAbortError) => {
                if (requestCancelledByUserRef && pendingMessageIdRef === aiMessageIdToRegenerate) { setIsLoading(false); return; }
                onFullResponseCalledForPendingMessageRef = false;
                const finalErrorMessage = isAbortError ? `Response aborted.` : `Response failed: ${errorMsg}`;
                await updateCurrentChatSession(session => session ? ({ ...session, messages: session.messages.map(msg => msg.id === aiMessageIdToRegenerate ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: finalErrorMessage } : msg)}) : null);
                if (!requestCancelledByUserRef && pendingMessageIdRef === aiMessageIdToRegenerate) { setIsLoading(false); }
            },
            async () => {
                const userDidCancel = requestCancelledByUserRef;
                const currentPendingMsgIdForComplete = pendingMessageIdRef;
                if (userDidCancel && currentPendingMsgIdForComplete === aiMessageIdToRegenerate) {}
                else if (currentPendingMsgIdForComplete === aiMessageIdToRegenerate) {
                    setIsLoading(false);
                    if (!onFullResponseCalledForPendingMessageRef) {
                        await updateCurrentChatSession(session => {
                            if (!session) return null;
                            const messageInState = session.messages.find(m => m.id === aiMessageIdToRegenerate);
                            if (messageInState && messageInState.isStreaming && messageInState.role !== ChatMessageRole.ERROR) {
                                return { ...session, messages: session.messages.map(msg => msg.id === aiMessageIdToRegenerate ? { ...msg, isStreaming: false, role: ChatMessageRole.ERROR, content: "Response processing failed or stream ended unexpectedly.", timestamp: new Date() } : msg ), lastUpdatedAt: new Date() };
                            }
                            return { ...session, lastUpdatedAt: new Date() };
                        });
                    } else {
                        await updateCurrentChatSession(session => session ? { ...session, lastUpdatedAt: new Date() } : null);
                    }
                    pendingMessageIdRef = null;
                }
                if (abortControllerRef && currentPendingMsgIdForComplete === aiMessageIdToRegenerate) abortControllerRef = null;
                if (currentPendingMsgIdForComplete === aiMessageIdToRegenerate) requestCancelledByUserRef = false;
                onFullResponseCalledForPendingMessageRef = false;
            },
            logApiRequestDirectly, 
            abortControllerRef.signal, 
            settingsOverrideForAPICall,
            currentChatSession.aiCharacters, 
            currentChatSession.githubRepoContext?.contextText
        );
    };

    const handleRegenerateResponseForUserMessage = async (userMessageId: string) => {
        const { currentChatSession } = useActiveChatStore.getState();
        if (!currentChatSession || get().isLoading) return;

        const userMessageIndex = currentChatSession.messages.findIndex(m => m.id === userMessageId);
        if (userMessageIndex === -1 || userMessageIndex + 1 >= currentChatSession.messages.length) return;

        const aiMessageToRegenerate = currentChatSession.messages[userMessageIndex + 1];
        if (aiMessageToRegenerate.role !== ChatMessageRole.MODEL && aiMessageToRegenerate.role !== ChatMessageRole.ERROR) return;

        await handleRegenerateAIMessage(aiMessageToRegenerate.id);
    };

    const handleEditPanelSubmit = async (action: EditMessagePanelAction, newContent: string, editingMessageDetail: EditMessagePanelDetails) => {
        const { updateCurrentChatSession, currentChatSession } = useActiveChatStore.getState();
        const { messageId } = editingMessageDetail;
        if(!currentChatSession) return;
        
        const messageIndex = currentChatSession.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return;

        if (action === EditMessagePanelAction.SAVE_AND_SUBMIT) {
            const updatedUserMessage = { ...currentChatSession.messages[messageIndex], content: newContent, cachedAudioBuffers: null };
            const historyBeforeEdit = currentChatSession.messages.slice(0, messageIndex);
            
            await updateCurrentChatSession(session => session ? ({...session, messages: [...historyBeforeEdit, updatedUserMessage]}) : null);
            
            const sessionAfterUpdate = useActiveChatStore.getState().currentChatSession;
            if(sessionAfterUpdate) {
                await get().handleSendMessage(newContent, updatedUserMessage.attachments, historyBeforeEdit);
            }

        } else if (action === EditMessagePanelAction.CONTINUE_PREFIX) {
            const originalMessage = { ...currentChatSession.messages[messageIndex], content: newContent, isStreaming: false, cachedAudioBuffers: null };
            const historyContext = getHistoryUpToMessage(currentChatSession.messages, messageIndex);
            
            pendingMessageIdRef = messageId;
            originalMessageSnapshotRef = originalMessage;

            await updateCurrentChatSession(session => session ? ({...session, messages: session.messages.map(m => m.id === messageId ? {...originalMessage, isStreaming: true} : m)}) : null);

            await get().handleSendMessage(
                newContent, [], historyContext, undefined, true
            );
        } else if (action === EditMessagePanelAction.SAVE_LOCALLY) {
            await updateCurrentChatSession(session => {
                if (!session) return null;
                const newMessages = session.messages.map(msg => 
                    msg.id === messageId ? { ...msg, content: newContent, cachedAudioBuffers: null } : msg
                );
                return { ...session, messages: newMessages };
            });
        }
    };

    return {
        isLoading: false, currentGenerationTimeDisplay: "0.0s", lastMessageHadAttachments: false,
        logApiRequest: logApiRequestDirectly,
        handleCancelGeneration,
        handleSendMessage,
        handleContinueFlow,
        handleRegenerateAIMessage,
        handleRegenerateResponseForUserMessage,
        handleEditPanelSubmit,
    };
});

import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, memo } from 'react';
import { useModalStore } from '../store/useModalStore.ts';
import { useGlobalUiStore } from '../store/useGlobalUiStore.ts';
import { useSelectionStore } from '../store/useSelectionStore.ts';
import { ChatMessageRole, AICharacter } from '../types.ts';
import MessageItem from './MessageItem.tsx';
import { LOAD_MORE_MESSAGES_COUNT } from '../constants.ts';
import { Bars3Icon, FlowRightIcon, StopIcon, XCircleIcon, UsersIcon, PlusIcon, ArrowsUpDownIcon, CheckIcon, InfoIcon, SendIcon, ClipboardDocumentCheckIcon } from './Icons.tsx';
import AutoSendControls from './AutoSendControls.tsx';
import ManualSaveButton from './ManualSaveButton.tsx';
import { useAttachmentStore } from '../store/useAttachmentStore.ts';
import useAutoResizeTextarea from '../hooks/useAutoResizeTextarea.ts';
import { getModelDisplayName } from '../services/utils.ts';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useToastStore } from '../store/useToastStore.ts';
import { useActiveChatStore } from '../store/useActiveChatStore.ts';
import { useGeminiApiStore } from '../store/useGeminiApiStore.ts'; 
import { useAutoSendStore } from '../store/useAutoSendStore.ts';
import { useCharacterStore } from '../store/useCharacterStore.ts';
import { useMessageStore } from '../store/useMessageStore.ts';
import { useDataStore } from '../store/useDataStore.ts';
import AttachmentControls from './AttachmentControls.tsx';

interface ChatViewProps {
    onEnterReadMode: (content: string) => void;
}

export interface ChatViewHandles {
    scrollToMessage: (messageId: string) => void;
}

const ChatView = memo(forwardRef<ChatViewHandles, ChatViewProps>(({
    onEnterReadMode,
}, ref) => {
    const { currentChatSession } = useActiveChatStore();
    const { visibleMessages, totalMessagesInSession, canLoadMore, loadMoreMessages, loadAllMessages } = useMessageStore();
    
    const { isLoading, currentGenerationTimeDisplay, handleSendMessage, handleContinueFlow, handleCancelGeneration } = useGeminiApiStore();
    const {
        isAutoSendingActive, autoSendText, setAutoSendText, autoSendRepetitionsInput,
        setAutoSendRepetitionsInput, autoSendRemaining, startAutoSend, stopAutoSend,
        canStartAutoSend, isWaitingForErrorRetry, errorRetryCountdown,
        decrementRemaining, setErrorRetry
    } = useAutoSendStore();

    const { handleManualSave, saveSingleSession } = useDataStore();
    const { reorderCharacters } = useCharacterStore();
    
    const { openCharacterManagementModal } = useModalStore();
    const showToast = useToastStore(state => state.showToast);
    const { isSidebarOpen, toggleSidebar } = useGlobalUiStore();
    const { isSelectionModeActive, toggleSelectionMode } = useSelectionStore();

    const [inputMessage, setInputMessage] = useState('');
    const [expansionState, setExpansionState] = useState<Record<string, { content?: boolean; thoughts?: boolean }>>({});
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageListRef = useRef<HTMLDivElement>(null);
    const textareaRef = useAutoResizeTextarea<HTMLTextAreaElement>(inputMessage);
    const [showLoadButtonsUI, setShowLoadButtonsUI] = useState(false);

    const isCharacterMode = currentChatSession?.isCharacterModeActive || false;
    const [characters, setCharactersState] = useState<AICharacter[]>(currentChatSession?.aiCharacters || []);
    const [isReorderingActive, setIsReorderingActive] = useState(false);
    const draggedCharRef = useRef<AICharacter | null>(null);
    const characterButtonContainerRef = useRef<HTMLDivElement | null>(null);
    const [isInfoInputModeActive, setIsInfoInputModeActive] = useState(false);
    const errorRetryIntervalRef = useRef<number | null>(null);

    const {
        getValidAttachmentsToSend,
        isAnyFileStillProcessing,
        resetSelectedFiles,
        handlePaste,
    } = useAttachmentStore();

    const virtualizer = useVirtualizer({
        count: visibleMessages.length,
        getScrollElement: () => messageListRef.current,
        estimateSize: () => 150,
        overscan: 5,
        measureElement: (element) => (element as HTMLElement).offsetHeight,
    });

    const toggleExpansion = useCallback((messageId: string, type: 'content' | 'thoughts') => {
        setExpansionState(prev => ({ ...prev, [messageId]: { ...prev[messageId], [type]: !prev[messageId]?.[type] } }));
    }, []);

    const handleLoadAll = useCallback(() => {
        loadAllMessages();
        setShowLoadButtonsUI(false);
    }, [loadAllMessages]);

    useImperativeHandle(ref, () => ({
        scrollToMessage: (messageId: string) => {
            const index = visibleMessages.findIndex(m => m.id === messageId);
    
            const highlightElement = (targetId: string) => {
                setTimeout(() => {
                    const element = messageListRef.current?.querySelector(`#message-item-${targetId}`);
                    if (element) {
                        element.classList.add('ring-2', 'ring-blue-400', 'transition-all', 'duration-1000', 'ease-out');
                        setTimeout(() => element.classList.remove('ring-2', 'ring-blue-400', 'transition-all', 'duration-1000', 'ease-out'), 2500);
                    }
                }, 300);
            };
    
            if (index > -1) {
                virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
                highlightElement(messageId);
            } else {
                if (currentChatSession && visibleMessages.length < totalMessagesInSession) {
                    const fullIndex = currentChatSession.messages.findIndex(m => m.id === messageId);
                    if (fullIndex > -1) {
                        handleLoadAll();
                        setTimeout(() => {
                             const finalIndex = useActiveChatStore.getState().currentChatSession?.messages.findIndex(m => m.id === messageId) ?? -1;
                             if(finalIndex > -1) {
                                virtualizer.scrollToIndex(finalIndex, { align: 'center', behavior: 'smooth' });
                                highlightElement(messageId);
                             }
                        }, 500);
                    }
                }
            }
        }
    }), [currentChatSession, visibleMessages, totalMessagesInSession, handleLoadAll, virtualizer]);


    useEffect(() => {
        setCharactersState(currentChatSession?.aiCharacters || []);
        if (!currentChatSession?.isCharacterModeActive && isInfoInputModeActive) {
            setIsInfoInputModeActive(false);
        }
    }, [currentChatSession?.aiCharacters, currentChatSession?.isCharacterModeActive, isInfoInputModeActive]);

    const isPreparingAutoSend = autoSendText.trim() !== '' && parseInt(autoSendRepetitionsInput, 10) > 0 && !isAutoSendingActive;

    const handleSendMessageClick = useCallback(async (characterId?: string, textOverride?: string) => {
        const currentInputMessageValue = textOverride ?? inputMessage;
        const attachmentsToSend = getValidAttachmentsToSend();
        let temporaryContextFlag = false;

        if (isLoading || !currentChatSession) return;
        if (isAutoSendingActive && textOverride === undefined) return;

        if (isAnyFileStillProcessing()) {
            showToast("Some files are still being processed. Please wait.", "error");
            return;
        }

        if (isCharacterMode && characterId) {
            if (isInfoInputModeActive) { temporaryContextFlag = !!currentInputMessageValue.trim(); }
        } else if (!isCharacterMode) {
            if (currentInputMessageValue.trim() === '' && attachmentsToSend.length === 0) return;
        } else { return; }

        if (textOverride === undefined) {
            setInputMessage('');
            resetSelectedFiles();
        }
        if (isInfoInputModeActive && temporaryContextFlag) setIsInfoInputModeActive(false);

        await handleSendMessage(currentInputMessageValue, attachmentsToSend, undefined, characterId, temporaryContextFlag);
    }, [inputMessage, getValidAttachmentsToSend, isLoading, currentChatSession, isAutoSendingActive, isAnyFileStillProcessing, showToast, isCharacterMode, isInfoInputModeActive, handleSendMessage, resetSelectedFiles]);

    const handleStartAutoSend = useCallback(async (text: string, repetitions: number, characterId?: string) => {
        if (!canStartAutoSend() || isLoading) return;
        
        startAutoSend(text, repetitions);

        let currentRepetitions = repetitions;
        let isFirstMessage = true;

        while (currentRepetitions > 0) {
            const { isAutoSendingActive: isStillActive } = useAutoSendStore.getState();
            if (!isStillActive) break;

            if (!isFirstMessage) {
                decrementRemaining();
            }

            try {
                await handleSendMessageClick(characterId, text);
                const { currentChatSession: updatedSession } = useActiveChatStore.getState();
                if (updatedSession) {
                    saveSingleSession(updatedSession);
                    const lastMessage = updatedSession.messages[updatedSession.messages.length - 1];
                    if (lastMessage?.role === ChatMessageRole.ERROR) {
                        showToast("Auto-send stopped due to an error.", "error");
                        stopAutoSend();
                        break;
                    }
                }
            } catch (error) {
                console.error("Error during auto-send message:", error);
                showToast("Auto-send stopped due to an unexpected error.", "error");
                stopAutoSend();
                break;
            }
            
            isFirstMessage = false;
            currentRepetitions--;

            if (useAutoSendStore.getState().isAutoSendingActive && currentRepetitions > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Final cleanup
        if (useAutoSendStore.getState().isAutoSendingActive) {
            stopAutoSend();
        }

    }, [canStartAutoSend, isLoading, startAutoSend, handleSendMessageClick, decrementRemaining, stopAutoSend, saveSingleSession, showToast]);

    useEffect(() => {
        // This useEffect is now only for cleaning up the error retry interval,
        // the main loop logic has been moved to handleStartAutoSend.
        return () => {
            if (errorRetryIntervalRef.current) {
                clearInterval(errorRetryIntervalRef.current);
            }
        };
    }, []);

    const handleContinueFlowClick = useCallback(async () => {
        if (isLoading || !currentChatSession || currentChatSession.messages.length === 0 || isCharacterMode || isAutoSendingActive) return;
        setInputMessage('');
        resetSelectedFiles();
        await handleContinueFlow();
    }, [isLoading, currentChatSession, isCharacterMode, isAutoSendingActive, handleContinueFlow, resetSelectedFiles]);

    const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isCharacterMode && !isAutoSendingActive) handleSendMessageClick();
        }
    }, [isCharacterMode, isAutoSendingActive, handleSendMessageClick]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => { setInputMessage(e.target.value); }, []);

    const handleScroll = useCallback(() => {
        if (messageListRef.current) {
            const { scrollTop } = messageListRef.current;
            if (scrollTop < 5 && canLoadMore) setShowLoadButtonsUI(true);
            else setShowLoadButtonsUI(false);
        }
    }, [canLoadMore]);

    const handleLoadMore = useCallback(() => {
        loadMoreMessages();
        setShowLoadButtonsUI(false);
    }, [loadMoreMessages]);

    const toggleInfoInputMode = useCallback(() => {
        setIsInfoInputModeActive(prev => {
            if (!prev) {
                setInputMessage('');
                resetSelectedFiles();
                if (textareaRef.current) textareaRef.current.focus();
            }
            return !prev;
        });
    }, [resetSelectedFiles]);

    const handleDragStart = useCallback((e: React.DragEvent<HTMLButtonElement>, char: AICharacter) => {
        if (!isReorderingActive) return;
        draggedCharRef.current = char;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', char.id);
        e.currentTarget.classList.add('opacity-50', 'ring-2', 'ring-blue-500');
    }, [isReorderingActive]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => {
        e.preventDefault();
        if (!isReorderingActive || !draggedCharRef.current) return;
        e.dataTransfer.dropEffect = 'move';
    }, [isReorderingActive]);

    const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => {
        e.preventDefault();
        if (!isReorderingActive || !draggedCharRef.current || !currentChatSession) return;
        const targetCharId = (e.target as HTMLElement).closest('button[data-char-id]')?.getAttribute('data-char-id');
        if (!targetCharId) return;
        const draggedChar = draggedCharRef.current;
        const currentChars = [...characters];
        const draggedIndex = currentChars.findIndex(c => c.id === draggedChar.id);
        const targetIndex = currentChars.findIndex(c => c.id === targetCharId);
        if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) return;
        const [removed] = currentChars.splice(draggedIndex, 1);
        currentChars.splice(targetIndex, 0, removed);
        setCharactersState(currentChars);
        await reorderCharacters(currentChars);
        draggedCharRef.current = null;
    }, [isReorderingActive, currentChatSession, characters, reorderCharacters]);

    const handleDragEnd = useCallback((e: React.DragEvent<HTMLButtonElement>) => { if (!isReorderingActive) return; e.currentTarget.classList.remove('opacity-50', 'ring-2', 'ring-blue-500'); }, [isReorderingActive]);
    const toggleReordering = useCallback(() => setIsReorderingActive(prev => !prev), []);
    
    const handleMainCancelButtonClick = useCallback(() => {
        if (isAutoSendingActive) {
            stopAutoSend();
        }
        if (isLoading) {
            handleCancelGeneration();
        }
        if (errorRetryIntervalRef.current) {
            clearInterval(errorRetryIntervalRef.current);
            errorRetryIntervalRef.current = null;
            setErrorRetry(false);
        }
    }, [isAutoSendingActive, stopAutoSend, isLoading, handleCancelGeneration, setErrorRetry]);

    const amountToLoad = Math.min(LOAD_MORE_MESSAGES_COUNT, totalMessagesInSession - visibleMessages.length);
    const hasValidInputForMainSend = inputMessage.trim() !== '' || getValidAttachmentsToSend().length > 0;
    
    const loadingMessageText = isLoading ? (isAutoSendingActive ? `Auto-sending: ${autoSendRemaining} left... (${currentGenerationTimeDisplay})` : `Gemini is thinking... (${currentGenerationTimeDisplay})`) : "";
    let placeholderText = isCharacterMode ? (isInfoInputModeActive ? "Enter one-time contextual info for the character..." : "Type message (optional), then select character...") : "Type your message here... (Shift+Enter for new line, or paste files)";

    return (
        <div className="flex flex-col h-full bg-transparent">
            <header className="p-3 sm:p-4 border-b border-[var(--aurora-border)] flex items-center space-x-3 sticky top-0 bg-transparent z-20">
                <button onClick={toggleSidebar} className="p-1.5 text-[var(--aurora-text-secondary)] hover:text-[var(--aurora-text-primary)] bg-white/5 rounded-md focus:outline-none focus:ring-2 ring-[var(--aurora-accent-primary)] transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]" title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"} aria-label={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}><Bars3Icon className="w-5 h-5" /></button>
                <div className="flex-grow overflow-hidden">
                    <h1 className="text-lg sm:text-xl font-semibold text-[var(--aurora-text-primary)] truncate flex items-center">{currentChatSession ? currentChatSession.title : "Gemini Chat Interface"}{isCharacterMode && <UsersIcon className="w-5 h-5 ml-2 text-purple-400 flex-shrink-0" />}</h1>
                    <div className="flex items-center space-x-2">
                        {currentChatSession && <p className="text-xs text-[var(--aurora-text-secondary)] truncate" title={getModelDisplayName(currentChatSession.model)}>Model: {getModelDisplayName(currentChatSession.model)}</p>}
                        {currentChatSession && <ManualSaveButton onManualSave={handleManualSave} disabled={!currentChatSession || isLoading} />}
                        {currentChatSession && (<button onClick={toggleSelectionMode} className={`p-1.5 rounded-md transition-all focus:outline-none focus:ring-2 ring-[var(--aurora-accent-primary)] ${isSelectionModeActive ? 'bg-[var(--aurora-accent-primary)] text-white hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)]' : 'text-[var(--aurora-text-secondary)] hover:text-white hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]'}`} title={isSelectionModeActive ? "Done Selecting" : "Select Multiple Messages"} aria-label={isSelectionModeActive ? "Exit multiple selection mode" : "Enter multiple selection mode"}>{isSelectionModeActive ? <XCircleIcon className="w-5 h-5" /> : <ClipboardDocumentCheckIcon className="w-5 h-5" />}</button>)}
                    </div>
                </div>
                {isCharacterMode && currentChatSession && (
                    <div className="ml-auto flex items-center space-x-2">
                        <button onClick={toggleReordering} className={`p-1.5 sm:px-3 sm:py-1.5 text-xs font-medium rounded-md transition-all flex items-center ${isReorderingActive ? 'bg-green-600 text-white hover:shadow-[0_0_12px_2px_rgba(34,197,94,0.6)]' : 'bg-white/5 text-[var(--aurora-text-secondary)] hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]'}`} title={isReorderingActive ? "Done Reordering" : "Edit Character Order"}>{isReorderingActive ? <CheckIcon className="w-4 h-4 sm:mr-1.5" /> : <ArrowsUpDownIcon className="w-4 h-4 sm:mr-1.5" />}<span className="hidden sm:inline">{isReorderingActive ? "Done" : "Edit Order"}</span></button>
                        <button onClick={openCharacterManagementModal} className="flex items-center p-1.5 sm:px-3 sm:py-1.5 text-xs font-medium text-purple-300 bg-purple-600 bg-opacity-30 rounded-md transition-all hover:shadow-[0_0_12px_2px_rgba(156,51,245,0.6)]" title="Manage AI Characters" disabled={isReorderingActive}><PlusIcon className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Manage Characters</span></button>
                    </div>
                )}
            </header>

            <div ref={messageListRef} onScroll={handleScroll} className={`flex-1 p-4 sm:p-6 overflow-y-auto relative ${isSelectionModeActive ? 'pb-20' : ''}`} role="log" aria-live="polite">
                {currentChatSession && canLoadMore && (
                    <div className="sticky top-2 w-full z-10 flex flex-col items-center space-y-2 my-2 h-20 justify-center">
                        <div className={`transition-opacity duration-300 ${showLoadButtonsUI ? 'opacity-100' : 'opacity-0'}`}>{amountToLoad > 0 && <button onClick={handleLoadMore} className="px-4 py-2 text-xs bg-[var(--aurora-accent-primary)] text-white rounded-full shadow-lg transition-all transform hover:scale-105 hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)] mb-2">Show {amountToLoad} More</button>}<button onClick={handleLoadAll} className="px-4 py-2 text-xs bg-white/10 text-white rounded-full shadow-lg transition-all transform hover:scale-105 hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]">Show All History ({totalMessagesInSession - visibleMessages.length} more)</button></div>
                    </div>
                )}
                {currentChatSession ? (
                    visibleMessages.length > 0 ? (
                        <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                            {virtualizer.getVirtualItems().map((virtualItem) => {
                                const msg = visibleMessages[virtualItem.index];
                                if (!msg) return null;
                                const fullMessageList = currentChatSession!.messages;
                                const currentMessageIndexInFullList = fullMessageList.findIndex(m => m.id === msg.id);
                                const nextMessageInFullList = (currentMessageIndexInFullList !== -1 && currentMessageIndexInFullList < fullMessageList.length - 1) ? fullMessageList[currentMessageIndexInFullList + 1] : null;
                                const canRegenerateFollowingAI = msg.role === ChatMessageRole.USER && nextMessageInFullList !== null && (nextMessageInFullList.role === ChatMessageRole.MODEL || nextMessageInFullList.role === ChatMessageRole.ERROR) && !isCharacterMode;
                                return (
                                    <div className="virtual-item-container" key={virtualItem.key} ref={virtualizer.measureElement} data-index={virtualItem.index} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualItem.start}px)` }}>
                                        <MessageItem message={msg} canRegenerateFollowingAI={canRegenerateFollowingAI} chatScrollContainerRef={messageListRef} onEnterReadMode={onEnterReadMode} isContentExpanded={!!expansionState[msg.id]?.content} isThoughtsExpanded={!!expansionState[msg.id]?.thoughts} onToggleExpansion={toggleExpansion} />
                                    </div>
                                );
                            })}
                        </div>
                    ) : ( <div className="text-center text-gray-500 italic mt-10">{isCharacterMode && characters.length === 0 ? "Add some characters and start the scene!" : (isCharacterMode ? "Select a character to speak." : "Start the conversation!")}</div>)
                ) : ( <div className="text-center text-gray-500 italic mt-10">Select a chat from the history or start a new one.</div>)}
                <div ref={messagesEndRef} />
            </div>
            
            <div className="sticky bottom-0 z-20 bg-transparent flex flex-col">
                <AttachmentControls />
                {isCharacterMode && characters.length > 0 && (
                    <div ref={characterButtonContainerRef} className="p-2 sm:p-3 border-t border-[var(--aurora-border)] bg-transparent" onDragOver={handleDragOver} onDrop={handleDrop}>
                        <p className="text-xs text-gray-400 mb-2">{isReorderingActive ? "Drag to reorder characters, then click 'Done'." : (isInfoInputModeActive ? "Input is for one-time info. Select character to speak:" : (isPreparingAutoSend ? "Auto-send ready. Select character to start:" : "Select a character to speak (can be empty input):"))}</p>
                        <div className="flex flex-wrap gap-2">
                            {characters.map((char) => (<button key={char.id} data-char-id={char.id} onClick={() => !isReorderingActive && (isPreparingAutoSend ? handleStartAutoSend(autoSendText, parseInt(autoSendRepetitionsInput, 10) || 1, char.id) : handleSendMessageClick(char.id))} disabled={!currentChatSession || isAnyFileStillProcessing() || (isAutoSendingActive && !isPreparingAutoSend) || (isReorderingActive && !!draggedCharRef.current && draggedCharRef.current.id === char.id)} draggable={isReorderingActive} onDragStart={(e) => handleDragStart(e, char)} onDragEnd={handleDragEnd} className={`px-3 py-1.5 text-sm bg-[var(--aurora-accent-secondary)] text-white rounded-md disabled:opacity-50 transition-all duration-150 ease-in-out hover:shadow-[0_0_12px_2px_rgba(156,51,245,0.6)] ${isReorderingActive ? 'cursor-grab hover:ring-2 hover:ring-purple-400' : 'disabled:cursor-not-allowed'} ${draggedCharRef.current?.id === char.id ? 'opacity-50 ring-2 ring-blue-500' : ''} ${(isPreparingAutoSend && !isAutoSendingActive && !isLoading) ? 'ring-2 ring-green-500 hover:ring-green-400' : ''}`} title={isReorderingActive ? `Drag to reorder ${char.name}` : (isPreparingAutoSend && !isAutoSendingActive && !isLoading ? `Start auto-sending as ${char.name}` : `Speak as ${char.name}`)}>{char.name}</button>))}
                        </div>
                    </div>
                )}
                {(currentChatSession?.settings?.showAutoSendControls) && (<AutoSendControls isAutoSendingActive={isAutoSendingActive} autoSendText={autoSendText} setAutoSendText={setAutoSendText} autoSendRepetitionsInput={autoSendRepetitionsInput} setAutoSendRepetitionsInput={setAutoSendRepetitionsInput} autoSendRemaining={autoSendRemaining} onStartAutoSend={() => handleStartAutoSend(autoSendText, parseInt(autoSendRepetitionsInput, 10) || 1)} onStopAutoSend={handleMainCancelButtonClick} canStart={canStartAutoSend()} isChatViewLoading={isLoading} currentChatSessionExists={!!currentChatSession} isCharacterMode={isCharacterMode} isPreparingAutoSend={isPreparingAutoSend} isWaitingForErrorRetry={isWaitingForErrorRetry} errorRetryCountdown={errorRetryCountdown} />)}
                <div className="p-3 sm:p-4 border-t border-[var(--aurora-border)] bg-transparent">
                    {isLoading && <p className="text-xs text-center text-blue-400 mb-2 animate-pulse">{loadingMessageText}</p>}
                    <div className="flex items-end aurora-panel rounded-lg p-1 focus-within:ring-2 focus-within:ring-[var(--aurora-accent-primary)] transition-shadow">
                        <AttachmentControls renderButtonOnly isInfoInputModeActive={isInfoInputModeActive} />
                        {isCharacterMode && (<button onClick={toggleInfoInputMode} disabled={isLoading || !currentChatSession || isAutoSendingActive || isSelectionModeActive} className={`p-2.5 sm:p-3 m-1 text-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-shadow focus:outline-none ${isInfoInputModeActive ? 'bg-yellow-500/20 text-yellow-300 hover:shadow-[0_0_12px_2px_rgba(234,179,8,0.6)]' : 'hover:text-white hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]'}`} title={isInfoInputModeActive ? "Disable One-Time Info Input" : "Enable One-Time Info Input"} aria-label={isInfoInputModeActive ? "Disable One-Time Info Input" : "Enable One-Time Info Input"} aria-pressed={isInfoInputModeActive}><InfoIcon className="w-5 h-5" /></button>)}
                        <textarea ref={textareaRef} rows={1} className="flex-grow p-2.5 sm:p-3 bg-transparent text-gray-200 focus:outline-none resize-none placeholder-gray-400 hide-scrollbar" placeholder={placeholderText} value={inputMessage} onChange={handleInputChange} onKeyPress={handleKeyPress} onPaste={(e) => handlePaste(e, isInfoInputModeActive)} disabled={!currentChatSession || isAutoSendingActive || isSelectionModeActive} aria-label="Chat input" />
                        {!isCharacterMode && (<button onClick={handleContinueFlowClick} disabled={isLoading || !currentChatSession || (currentChatSession && currentChatSession.messages.length === 0) || isAnyFileStillProcessing() || isCharacterMode || isAutoSendingActive || isSelectionModeActive} className="p-2.5 sm:p-3 m-1 text-white bg-teal-600/50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-shadow hover:shadow-[0_0_12px_2px_rgba(13,148,136,0.6)] focus:outline-none" title="Continue Flow" aria-label="Continue flow"><FlowRightIcon className="w-5 h-5" /></button>)}
                        {(isLoading || isAutoSendingActive) ? (<button onClick={handleMainCancelButtonClick} className="p-2.5 sm:p-3 m-1 text-white bg-red-600/80 rounded-md transition-shadow hover:shadow-[0_0_12px_2px_rgba(239,68,68,0.6)] focus:outline-none" aria-label={isAutoSendingActive ? "Stop automated sending" : "Cancel generation"} title={isAutoSendingActive ? "Stop automated sending" : "Cancel generation"}><StopIcon className="w-5 h-5" /></button>) : (<button onClick={() => handleSendMessageClick()} disabled={!hasValidInputForMainSend || !currentChatSession || isAnyFileStillProcessing() || isCharacterMode || isAutoSendingActive || isSelectionModeActive} className={`p-2.5 sm:p-3 m-1 text-white bg-[var(--aurora-accent-primary)] rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-shadow hover:shadow-[0_0_12px_2px_rgba(90,98,245,0.6)] focus:outline-none ${isCharacterMode ? 'hidden' : ''}`} aria-label="Send message" title="Send message"><SendIcon className="w-5 h-5" /></button>)}
                    </div>
                </div>
            </div>
        </div>
    );
}));

export default ChatView;

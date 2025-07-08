// src/components/AppContent.tsx
import React, { useRef, useCallback, useState, memo } from 'react';
import { useSessionStore } from '../stores/sessionStore.ts';
import { useChatStore } from '../stores/chatStore.ts';
import { useUIStore } from '../stores/uiStore.ts';
import { useAudioContext } from '../contexts/AudioContext.tsx';
import { useApiKeyStore } from '../stores/apiKeyStore.ts';

// Regular imports instead of lazy loading
import Sidebar from './Sidebar.tsx';
import ChatView from './ChatView.tsx';
import ReadModeView from './ReadModeView.tsx';
import SettingsPanel from './SettingsPanel.tsx';
import EditMessagePanel from './EditMessagePanel.tsx';
import CharacterManagementModal from './CharacterManagementModal.tsx';
import CharacterContextualInfoModal from './CharacterContextualInfoModal.tsx';
import DebugTerminalPanel from './DebugTerminalPanel.tsx';
import ConfirmationModal from './ConfirmationModal.tsx';
import ToastNotification from './ToastNotification.tsx';
import TtsSettingsModal from './TtsSettingsModal.tsx';
import AdvancedAudioPlayer from './AdvancedAudioPlayer.tsx';
import ExportConfigurationModal from './ExportConfigurationModal.tsx';
import FilenameInputModal from './FilenameInputModal.tsx';
import ChatAttachmentsModal from './ChatAttachmentsModal.tsx';
import MultiSelectActionBar from './MultiSelectActionBar.tsx';
import ApiKeyModal from './ApiKeyModal.tsx';
import GitHubImportModal from './GitHubImportModal.tsx';

const AppContent: React.FC = memo(() => {
  const { isLoadingData, currentChatSession } = useSessionStore(state => ({
    isLoadingData: state.isLoadingData,
    currentChatSession: state.chatHistory.find(s => s.id === state.currentChatId)
  }));
  const { deleteMessageAndSubsequent, setGithubRepo } = useChatStore(s => s.actions);
  const ui = useUIStore();
  const uiActions = useUIStore(state => state.actions);
  const audio = useAudioContext();
  const { deleteApiKey } = useApiKeyStore(state => state.actions);
  const chatViewRef = useRef<any>(null);

  const [isReadModeOpen, setIsReadModeOpen] = useState(false);
  const [readModeContent, setReadModeContent] = useState('');

  const handleEnterReadMode = useCallback((content: string) => {
    setReadModeContent(content);
    setIsReadModeOpen(true);
  }, []);

  const handleCloseReadMode = useCallback(() => {
    setIsReadModeOpen(false);
    setReadModeContent('');
  }, []);

  const handleGoToMessage = useCallback(() => {
    if (audio.audioPlayerState.currentMessageId && chatViewRef.current) {
      const baseMessageId = audio.audioPlayerState.currentMessageId.split('_part_')[0];
      chatViewRef.current.scrollToMessage(baseMessageId);
    }
  }, [audio.audioPlayerState.currentMessageId]);

  const getFullTextForAudioBar = useCallback(() => {
    if (!audio.audioPlayerState.currentMessageId || !currentChatSession) return audio.audioPlayerState.currentPlayingText || "Playing audio...";
    const baseId = audio.audioPlayerState.currentMessageId.split('_part_')[0];
    const message = currentChatSession.messages.find(m => m.id === baseId);
    return message ? message.content : (audio.audioPlayerState.currentPlayingText || "Playing audio...");
  }, [audio.audioPlayerState, currentChatSession]);

  const handleGoToAttachmentInChat = useCallback((messageId: string) => {
    uiActions.closeChatAttachmentsModal();
    if (chatViewRef.current) {
      chatViewRef.current.scrollToMessage(messageId);
    }
  }, [uiActions]);

  const handleConfirmDeletion = useCallback(() => {
    if (ui.deleteTarget) {
      if (ui.deleteTarget.messageId === 'api-key') {
        deleteApiKey(ui.deleteTarget.sessionId);
        uiActions.showToast("API Key deleted.", "success");
      } else {
        deleteMessageAndSubsequent(ui.deleteTarget.sessionId, ui.deleteTarget.messageId);
        uiActions.showToast("Message and history deleted.", "success");
      }
    }
    uiActions.cancelDeleteConfirmation();
  }, [ui.deleteTarget, uiActions, deleteApiKey, deleteMessageAndSubsequent]);

  const handleConfirmAudioReset = useCallback(() => {
    if (ui.resetAudioTarget) {
      audio.handleResetAudioCache(ui.resetAudioTarget.sessionId, ui.resetAudioTarget.messageId);
    }
    uiActions.cancelResetAudioCacheConfirmation();
  }, [ui.resetAudioTarget, uiActions, audio]);

  const isAudioBarVisible = !!(audio.audioPlayerState.currentMessageId || audio.audioPlayerState.isLoading || audio.audioPlayerState.isPlaying || audio.audioPlayerState.currentPlayingText) && !isReadModeOpen;
  
  if (isLoadingData) {
    return <div className="flex justify-center items-center h-screen bg-transparent text-white text-lg">Loading Chat Sessions...</div>;
  }

  return (
    <div className="flex h-screen antialiased text-[var(--aurora-text-primary)] bg-transparent overflow-hidden">
      <div className={`fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 ease-in-out ${ui.isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-72`}>
        <Sidebar />
      </div>

      {ui.isSidebarOpen && <div className="fixed inset-0 z-20 bg-black bg-opacity-50" onClick={uiActions.closeSidebar} aria-hidden="true" />}
      
      <main className={`relative z-10 flex-1 flex flex-col overflow-y-auto transition-all duration-300 ease-in-out ${ui.isSidebarOpen ? 'md:ml-72' : 'ml-0'} ${isAudioBarVisible ? 'pt-[76px]' : ''}`}>
        <ChatView ref={chatViewRef} onEnterReadMode={handleEnterReadMode} />
      </main>
      
      <div className='absolute'>
        {isAudioBarVisible && (
            <div className={`fixed top-0 left-0 right-0 z-30 transition-all duration-300 ease-in-out ${ui.isSidebarOpen ? 'md:left-72' : 'left-0'}`}>
              <AdvancedAudioPlayer
                audioPlayerState={audio.audioPlayerState}
                onCloseView={audio.handleClosePlayerViewOnly} 
                onSeekRelative={audio.seekRelative}
                onSeekToAbsolute={audio.seekToAbsolute}
                onTogglePlayPause={audio.togglePlayPause}
                currentMessageText={getFullTextForAudioBar()}
                onGoToMessage={handleGoToMessage}
                onIncreaseSpeed={audio.increaseSpeed} 
                onDecreaseSpeed={audio.decreaseSpeed} 
              />
            </div>
        )}

        <ReadModeView 
          isOpen={isReadModeOpen} 
          content={readModeContent} 
          onClose={handleCloseReadMode}
          onGoToMessage={handleGoToMessage} 
        />
        
        <SettingsPanel />
        <ApiKeyModal />
        <GitHubImportModal
            isOpen={ui.isGitHubImportModalOpen}
            onClose={uiActions.closeGitHubImportModal}
            onImport={setGithubRepo}
        />
        <ExportConfigurationModal />
        <TtsSettingsModal />
        <EditMessagePanel />
        <CharacterManagementModal />
        <CharacterContextualInfoModal />
        <DebugTerminalPanel />
        {ui.isSelectionModeActive && <MultiSelectActionBar />}
        <ChatAttachmentsModal
            isOpen={ui.isChatAttachmentsModalOpen}
            attachments={ui.attachmentsForModal}
            chatTitle={currentChatSession?.title || "Current Chat"}
            onClose={uiActions.closeChatAttachmentsModal}
            onGoToMessage={handleGoToAttachmentInChat}
        />

        {ui.isFilenameInputModalOpen && ui.filenameInputModalProps && (
          <FilenameInputModal
            isOpen={ui.isFilenameInputModalOpen}
            defaultFilename={ui.filenameInputModalProps.defaultFilename}
            promptMessage={ui.filenameInputModalProps.promptMessage}
            onSubmit={uiActions.submitFilenameInputModal}
            onClose={uiActions.closeFilenameInputModal}
          />
        )}

        <ConfirmationModal
          isOpen={ui.isDeleteConfirmationOpen}
          title="Confirm Deletion"
          message={ui.deleteTarget?.messageId === 'api-key' ? 'Are you sure you want to permanently delete this API key?' : <>Are you sure you want to delete this message and all <strong className="text-red-400">subsequent messages</strong> in this chat? <br/>This action cannot be undone.</>}
          confirmText="Yes, Delete" cancelText="No, Cancel"
          onConfirm={handleConfirmDeletion}
          onCancel={uiActions.cancelDeleteConfirmation}
          isDestructive={true}
        />
        <ConfirmationModal
          isOpen={ui.isResetAudioConfirmationOpen}
          title="Confirm Audio Reset"
          message="Are you sure you want to reset the audio cache for this message? This action cannot be undone."
          confirmText="Yes, Reset Audio" cancelText="No, Cancel"
          onConfirm={handleConfirmAudioReset}
          onCancel={uiActions.cancelResetAudioCacheConfirmation}
          isDestructive={true}
        />
        {ui.toastInfo && <ToastNotification message={ui.toastInfo.message} type={ui.toastInfo.type} onClose={() => uiActions.setToastInfo(null)} duration={ui.toastInfo.duration} />}
      </div>
    </div>
  );
});

export default AppContent;

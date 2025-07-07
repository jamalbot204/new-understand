import { lazy, Suspense } from 'react';
import { useUIStore } from '../stores/uiStore';
import GitHubImportModal from './GitHubImportModal.tsx';
import FilenameInputModal from './FilenameInputModal.tsx';
import { useChatActions } from '../contexts/ChatContext.tsx';

// Lazy load all modal components that don't need props passed from here
const ApiKeyModal = lazy(() => import('./ApiKeyModal.tsx'));
const SettingsPanel = lazy(() => import('./SettingsPanel.tsx'));
const ExportConfigurationModal = lazy(() => import('./ExportConfigurationModal.tsx'));
const TtsSettingsModal = lazy(() => import('./TtsSettingsModal.tsx'));
const EditMessagePanel = lazy(() => import('./EditMessagePanel.tsx'));
const CharacterManagementModal = lazy(() => import('./CharacterManagementModal.tsx'));
const CharacterContextualInfoModal = lazy(() => import('./CharacterContextualInfoModal.tsx'));
const DebugTerminalPanel = lazy(() => import('./DebugTerminalPanel.tsx'));
const ConfirmationModal = lazy(() => import('./ConfirmationModal.tsx'));
const ChatAttachmentsModal = lazy(() => import('./ChatAttachmentsModal.tsx'));

// This component listens to the store and renders the active modal.
// It keeps AppContent clean.
const ModalManager = () => {
    // Select only the state needed to decide which modals to show and what props they need
    const {
        isApiKeyModalOpen,
        isSettingsPanelOpen,
        isGitHubImportModalOpen,
        isExportConfigModalOpen,
        isTtsSettingsModalOpen,
        isEditPanelOpen,
        isCharacterManagementModalOpen,
        isContextualInfoModalOpen,
        isDebugTerminalOpen,
        isDeleteConfirmationOpen,
        isResetAudioConfirmationOpen,
        isFilenameInputModalOpen,
        isChatAttachmentsModalOpen,
        filenameInputModalProps,
        closeGitHubImportModal,
        submitFilenameInputModal,
        closeFilenameInputModal,
    } = useUIStore(state => ({
        isApiKeyModalOpen: state.isApiKeyModalOpen,
        isSettingsPanelOpen: state.isSettingsPanelOpen,
        isGitHubImportModalOpen: state.isGitHubImportModalOpen,
        isExportConfigModalOpen: state.isExportConfigModalOpen,
        isTtsSettingsModalOpen: state.isTtsSettingsModalOpen,
        isEditPanelOpen: state.isEditPanelOpen,
        isCharacterManagementModalOpen: state.isCharacterManagementModalOpen,
        isContextualInfoModalOpen: state.isContextualInfoModalOpen,
        isDebugTerminalOpen: state.isDebugTerminalOpen,
        isDeleteConfirmationOpen: state.isDeleteConfirmationOpen,
        isResetAudioConfirmationOpen: state.isResetAudioConfirmationOpen,
        isFilenameInputModalOpen: state.isFilenameInputModalOpen,
        isChatAttachmentsModalOpen: state.isChatAttachmentsModalOpen,
        filenameInputModalProps: state.filenameInputModalProps,
        closeGitHubImportModal: state.closeGitHubImportModal,
        submitFilenameInputModal: state.submitFilenameInputModal,
        closeFilenameInputModal: state.closeFilenameInputModal,
    }));
    
    // We still need useChatActions for the GitHubImportModal's onImport prop
    const { handleSetGithubRepo } = useChatActions();

    return (
        <Suspense fallback={null}>
            {isApiKeyModalOpen && <ApiKeyModal />}
            {isSettingsPanelOpen && <SettingsPanel />}
            
            {/* These modals still need props, so we handle them directly */}
            {isGitHubImportModalOpen && (
              <GitHubImportModal 
                isOpen={isGitHubImportModalOpen} 
                onClose={closeGitHubImportModal} 
                onImport={handleSetGithubRepo} 
              />
            )}
            
            {isFilenameInputModalOpen && filenameInputModalProps && (
              <FilenameInputModal 
                isOpen={isFilenameInputModalOpen} 
                defaultFilename={filenameInputModalProps.defaultFilename} 
                promptMessage={filenameInputModalProps.promptMessage} 
                onSubmit={submitFilenameInputModal} 
                onClose={closeFilenameInputModal} 
              />
            )}

            {/* These modals are now self-sufficient and don't need props from here */}
            {isExportConfigModalOpen && <ExportConfigurationModal />}
            {isTtsSettingsModalOpen && <TtsSettingsModal />}
            {isEditPanelOpen && <EditMessagePanel />}
            {isCharacterManagementModalOpen && <CharacterManagementModal />}
            {isContextualInfoModalOpen && <CharacterContextualInfoModal />}
            {isDebugTerminalOpen && <DebugTerminalPanel />}
            {isChatAttachmentsModalOpen && <ChatAttachmentsModal />}
            
            {/* Confirmation modals are rendered based on their type */}
            {isDeleteConfirmationOpen && <ConfirmationModal type="deleteMessage" />}
            {isResetAudioConfirmationOpen && <ConfirmationModal type="resetAudio" />}
        </Suspense>
    );
};

export default ModalManager;
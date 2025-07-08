// src/stores/uiStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import * as layoutService from '../services/layoutService.ts';
import { AICharacter, ChatSession, AttachmentWithContext, EditMessagePanelDetails } from '../types.ts';

export interface ToastInfo {
  message: string;
  type: 'success' | 'error';
  duration?: number;
}

export interface FilenameInputModalTriggerProps {
  defaultFilename: string;
  promptMessage: string;
  onSubmit: (filename: string) => void;
}

interface UIState {
  // Sidebar
  isSidebarOpen: boolean;
  layoutDirection: 'ltr' | 'rtl';

  // Toasts
  toastInfo: ToastInfo | null;

  // Modals
  isSettingsPanelOpen: boolean;
  isTtsSettingsModalOpen: boolean;
  isEditPanelOpen: boolean;
  editingMessageDetail: EditMessagePanelDetails | null;
  isCharacterManagementModalOpen: boolean;
  isContextualInfoModalOpen: boolean;
  editingCharacterForContextualInfo: AICharacter | null;
  isDebugTerminalOpen: boolean;
  isExportConfigModalOpen: boolean;
  isDeleteConfirmationOpen: boolean;
  deleteTarget: { sessionId: string; messageId: string } | null;
  isResetAudioConfirmationOpen: boolean;
  resetAudioTarget: { sessionId: string; messageId: string } | null;
  isFilenameInputModalOpen: boolean;
  filenameInputModalProps: FilenameInputModalTriggerProps | null;
  isChatAttachmentsModalOpen: boolean;
  attachmentsForModal: AttachmentWithContext[];
  isApiKeyModalOpen: boolean;
  isGitHubImportModalOpen: boolean;

  // Selection Mode
  isSelectionModeActive: boolean;
  selectedMessageIds: Set<string>;

  // Actions
  actions: {
    // Sidebar Actions
    setIsSidebarOpen: (isOpen: boolean | ((prevState: boolean) => boolean)) => void;
    closeSidebar: () => void;
    handleToggleSidebar: () => void;
    handleToggleLayoutDirection: () => void;
    initializeLayout: () => void;

    // Toast Actions
    setToastInfo: (info: ToastInfo | null) => void;
    showToast: (message: string, type?: 'success' | 'error', duration?: number) => void;

    // Modal Actions
    openSettingsPanel: () => void;
    closeSettingsPanel: () => void;
    openTtsSettingsModal: () => void;
    closeTtsSettingsModal: () => void;
    openEditPanel: (details: EditMessagePanelDetails) => void;
    closeEditPanel: () => void;
    openCharacterManagementModal: () => void;
    closeCharacterManagementModal: () => void;
    openCharacterContextualInfoModal: (character: AICharacter) => void;
    closeCharacterContextualInfoModal: () => void;
    openDebugTerminal: () => void;
    closeDebugTerminal: () => void;
    openExportConfigurationModal: () => void;
    closeExportConfigurationModal: () => void;
    requestDeleteConfirmation: (sessionId: string, messageId: string) => void;
    cancelDeleteConfirmation: () => void;
    requestResetAudioCacheConfirmation: (sessionId: string, messageId: string) => void;
    cancelResetAudioCacheConfirmation: () => void;
    openFilenameInputModal: (props: FilenameInputModalTriggerProps) => void;
    closeFilenameInputModal: () => void;
    submitFilenameInputModal: (filename: string) => void;
    openChatAttachmentsModal: (session: ChatSession | null) => void;
    closeChatAttachmentsModal: () => void;
    openApiKeyModal: () => void;
    closeApiKeyModal: () => void;
    openGitHubImportModal: () => void;
    closeGitHubImportModal: () => void;

    // Selection Mode Actions
    toggleSelectionMode: () => void;
    toggleMessageSelection: (messageId: string) => void;
    clearSelection: () => void;
    selectAllVisible: (visibleMessageIds: string[]) => void;
  };
}

const getInitialSidebarState = (): boolean => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('geminiChatSidebarOpen');
    if (stored) return JSON.parse(stored);
    return window.matchMedia('(min-width: 768px)').matches;
  }
  return false;
};

export const useUIStore = create<UIState>()(
  devtools((set, get) => ({
    isSidebarOpen: getInitialSidebarState(),
    layoutDirection: layoutService.getLayoutDirection(),
    toastInfo: null,
    isSettingsPanelOpen: false,
    isTtsSettingsModalOpen: false,
    isEditPanelOpen: false,
    editingMessageDetail: null,
    isCharacterManagementModalOpen: false,
    isContextualInfoModalOpen: false,
    editingCharacterForContextualInfo: null,
    isDebugTerminalOpen: false,
    isExportConfigModalOpen: false,
    isDeleteConfirmationOpen: false,
    deleteTarget: null,
    isResetAudioConfirmationOpen: false,
    resetAudioTarget: null,
    isFilenameInputModalOpen: false,
    filenameInputModalProps: null,
    isChatAttachmentsModalOpen: false,
    attachmentsForModal: [],
    isApiKeyModalOpen: false,
    isGitHubImportModalOpen: false,
    isSelectionModeActive: false,
    selectedMessageIds: new Set(),

    actions: {
      setIsSidebarOpen: (isOpen) => {
        set(state => ({ isSidebarOpen: typeof isOpen === 'function' ? isOpen(state.isSidebarOpen) : isOpen }));
        localStorage.setItem('geminiChatSidebarOpen', JSON.stringify(get().isSidebarOpen));
      },
      closeSidebar: () => get().actions.setIsSidebarOpen(false),
      handleToggleSidebar: () => get().actions.setIsSidebarOpen(prev => !prev),
      handleToggleLayoutDirection: () => {
        layoutService.toggleLayoutDirection();
        set({ layoutDirection: layoutService.getLayoutDirection() });
      },
      initializeLayout: () => {
        layoutService.initializeLayout();
        set({ layoutDirection: layoutService.getLayoutDirection() });
      },
      setToastInfo: (info) => set({ toastInfo: info }),
      showToast: (message, type = 'success', duration = 2000) => set({ toastInfo: { message, type, duration } }),
      openSettingsPanel: () => {
        set({ isSettingsPanelOpen: true });
        get().actions.closeSidebar();
      },
      closeSettingsPanel: () => set({ isSettingsPanelOpen: false }),
      openTtsSettingsModal: () => {
        set({ isTtsSettingsModalOpen: true });
        get().actions.closeSidebar();
      },
      closeTtsSettingsModal: () => set({ isTtsSettingsModalOpen: false }),
      openEditPanel: (details) => {
        set({ editingMessageDetail: details, isEditPanelOpen: true, isSettingsPanelOpen: false });
        get().actions.closeSidebar();
      },
      closeEditPanel: () => set({ isEditPanelOpen: false, editingMessageDetail: null }),
      openCharacterManagementModal: () => {
        set({ isCharacterManagementModalOpen: true });
        get().actions.closeSidebar();
      },
      closeCharacterManagementModal: () => set({ isCharacterManagementModalOpen: false }),
      openCharacterContextualInfoModal: (character) => set({ editingCharacterForContextualInfo: character, isContextualInfoModalOpen: true }),
      closeCharacterContextualInfoModal: () => set({ isContextualInfoModalOpen: false, editingCharacterForContextualInfo: null }),
      openDebugTerminal: () => {
        set({ isDebugTerminalOpen: true });
        get().actions.closeSidebar();
      },
      closeDebugTerminal: () => set({ isDebugTerminalOpen: false }),
      openExportConfigurationModal: () => {
        set({ isExportConfigModalOpen: true });
        get().actions.closeSidebar();
      },
      closeExportConfigurationModal: () => set({ isExportConfigModalOpen: false }),
      requestDeleteConfirmation: (sessionId, messageId) => set({ deleteTarget: { sessionId, messageId }, isDeleteConfirmationOpen: true }),
      cancelDeleteConfirmation: () => set({ isDeleteConfirmationOpen: false, deleteTarget: null }),
      requestResetAudioCacheConfirmation: (sessionId, messageId) => set({ resetAudioTarget: { sessionId, messageId }, isResetAudioConfirmationOpen: true }),
      cancelResetAudioCacheConfirmation: () => set({ isResetAudioConfirmationOpen: false, resetAudioTarget: null }),
      openFilenameInputModal: (props) => {
        set({ filenameInputModalProps: props, isFilenameInputModalOpen: true });
        get().actions.closeSidebar();
      },
      closeFilenameInputModal: () => set({ isFilenameInputModalOpen: false, filenameInputModalProps: null }),
      submitFilenameInputModal: (filename) => {
        get().filenameInputModalProps?.onSubmit(filename);
        get().actions.closeFilenameInputModal();
      },
      openChatAttachmentsModal: (session) => {
        if (!session || !session.messages || session.messages.length === 0) {
          get().actions.showToast("No chat session active or session has no messages.", "error");
          return;
        }
        const allAttachments = session.messages
          .flatMap(msg => (msg.attachments || []).map(att => ({
            attachment: att, messageId: msg.id, messageTimestamp: msg.timestamp, messageRole: msg.role,
            messageContentSnippet: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
          })))
          .filter(item => item.attachment);
        if (allAttachments.length === 0) {
          get().actions.showToast("No attachments found in this chat.", "success");
          return;
        }
        allAttachments.sort((a, b) => new Date(b.messageTimestamp).getTime() - new Date(a.messageTimestamp).getTime());
        set({ attachmentsForModal: allAttachments, isChatAttachmentsModalOpen: true, isSettingsPanelOpen: false });
        get().actions.closeSidebar();
      },
      closeChatAttachmentsModal: () => set({ isChatAttachmentsModalOpen: false, attachmentsForModal: [] }),
      openApiKeyModal: () => {
        set({ isApiKeyModalOpen: true });
        get().actions.closeSidebar();
      },
      closeApiKeyModal: () => set({ isApiKeyModalOpen: false }),
      openGitHubImportModal: () => {
        set({ isGitHubImportModalOpen: true });
        get().actions.closeSidebar();
      },
      closeGitHubImportModal: () => set({ isGitHubImportModalOpen: false }),
      clearSelection: () => set({ selectedMessageIds: new Set() }),
      toggleSelectionMode: () => {
        const isNowActive = !get().isSelectionModeActive;
        if (!isNowActive) {
          get().actions.clearSelection();
        }
        set({ isSelectionModeActive: isNowActive });
      },
      toggleMessageSelection: (messageId) => {
        set(state => {
          const newSet = new Set(state.selectedMessageIds);
          if (newSet.has(messageId)) {
            newSet.delete(messageId);
          } else {
            newSet.add(messageId);
          }
          return { selectedMessageIds: newSet };
        });
      },
      selectAllVisible: (visibleMessageIds) => set({ selectedMessageIds: new Set(visibleMessageIds) }),
    },
  }), { name: 'ui-store' })
);

// Initialize layout on load
useUIStore.getState().actions.initializeLayout();
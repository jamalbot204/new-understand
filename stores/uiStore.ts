import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { EditMessagePanelDetails, AICharacter, ChatSession, AttachmentWithContext, ToastInfo, FilenameInputModalTriggerProps } from '../types';

// Define the shape of our state and actions
interface UIState {
  isSidebarOpen: boolean;
  layoutDirection: 'ltr' | 'rtl';
  toastInfo: ToastInfo | null;
  
  // Modal States
  isSettingsPanelOpen: boolean;
  isTtsSettingsModalOpen: boolean;
  isEditPanelOpen: boolean;
  isCharacterManagementModalOpen: boolean;
  isContextualInfoModalOpen: boolean;
  isDebugTerminalOpen: boolean;
  isExportConfigModalOpen: boolean;
  isDeleteConfirmationOpen: boolean;
  isResetAudioConfirmationOpen: boolean;
  isFilenameInputModalOpen: boolean;
  isChatAttachmentsModalOpen: boolean;
  isApiKeyModalOpen: boolean;
  isGitHubImportModalOpen: boolean;

  // Data for Modals
  editingMessageDetail: EditMessagePanelDetails | null;
  editingCharacterForContextualInfo: AICharacter | null;
  deleteTarget: { sessionId: string; messageId: string } | null;
  resetAudioTarget: { sessionId: string; messageId: string } | null;
  filenameInputModalProps: FilenameInputModalTriggerProps | null;
  attachmentsForModal: AttachmentWithContext[];

  // Multi-select State
  isSelectionModeActive: boolean;
  selectedMessageIds: Set<string>;
}

interface UIActions {
  // UI Actions
  toggleSidebar: () => void;
  closeSidebar: () => void;
  toggleLayoutDirection: () => void;
  showToast: (message: string, type?: 'success' | 'error', duration?: number) => void;
  setToastInfo: (info: ToastInfo | null) => void;

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

  // Multi-select Actions
  toggleSelectionMode: () => void;
  toggleMessageSelection: (messageId: string) => void;
  clearSelection: () => void;
  selectAllVisible: (visibleMessageIds: string[]) => void;
}

// Create the store
export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set, get) => ({
      // Initial State
      isSidebarOpen: window.matchMedia('(min-width: 768px)').matches,
      layoutDirection: 'ltr',
      toastInfo: null,
      isSettingsPanelOpen: false,
      isTtsSettingsModalOpen: false,
      isEditPanelOpen: false,
      isCharacterManagementModalOpen: false,
      isContextualInfoModalOpen: false,
      isDebugTerminalOpen: false,
      isExportConfigModalOpen: false,
      isDeleteConfirmationOpen: false,
      isResetAudioConfirmationOpen: false,
      isFilenameInputModalOpen: false,
      isChatAttachmentsModalOpen: false,
      isApiKeyModalOpen: false,
      isGitHubImportModalOpen: false,
      editingMessageDetail: null,
      editingCharacterForContextualInfo: null,
      deleteTarget: null,
      resetAudioTarget: null,
      filenameInputModalProps: null,
      attachmentsForModal: [],
      isSelectionModeActive: false,
      selectedMessageIds: new Set(),

      // Actions
      toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
      closeSidebar: () => set({ isSidebarOpen: false }),
      toggleLayoutDirection: () => set(state => ({ layoutDirection: state.layoutDirection === 'ltr' ? 'rtl' : 'ltr' })),
      showToast: (message, type = 'success', duration = 2000) => set({ toastInfo: { message, type, duration } }),
      setToastInfo: (info) => set({ toastInfo: info }),

      // Modal Actions
      openSettingsPanel: () => set({ isSettingsPanelOpen: true, isSidebarOpen: false }),
      closeSettingsPanel: () => set({ isSettingsPanelOpen: false }),
      openTtsSettingsModal: () => set({ isTtsSettingsModalOpen: true, isSidebarOpen: false }),
      closeTtsSettingsModal: () => set({ isTtsSettingsModalOpen: false }),
      openEditPanel: (details) => set({
        isEditPanelOpen: true,
        editingMessageDetail: details,
        isSettingsPanelOpen: false,
        isSidebarOpen: false,
      }),
      closeEditPanel: () => set({ isEditPanelOpen: false, editingMessageDetail: null }),
      openCharacterManagementModal: () => set({ isCharacterManagementModalOpen: true, isSidebarOpen: false }),
      closeCharacterManagementModal: () => set({ isCharacterManagementModalOpen: false }),
      openCharacterContextualInfoModal: (character) => set({
        isContextualInfoModalOpen: true,
        editingCharacterForContextualInfo: character,
      }),
      closeCharacterContextualInfoModal: () => set({
        isContextualInfoModalOpen: false,
        editingCharacterForContextualInfo: null,
      }),
      openDebugTerminal: () => set({ isDebugTerminalOpen: true, isSidebarOpen: false }),
      closeDebugTerminal: () => set({ isDebugTerminalOpen: false }),
      openExportConfigurationModal: () => set({ isExportConfigModalOpen: true, isSidebarOpen: false }),
      closeExportConfigurationModal: () => set({ isExportConfigModalOpen: false }),
      requestDeleteConfirmation: (sessionId, messageId) => set({ deleteTarget: { sessionId, messageId }, isDeleteConfirmationOpen: true }),
      cancelDeleteConfirmation: () => set({ isDeleteConfirmationOpen: false, deleteTarget: null }),
      requestResetAudioCacheConfirmation: (sessionId, messageId) => set({ resetAudioTarget: { sessionId, messageId }, isResetAudioConfirmationOpen: true }),
      cancelResetAudioCacheConfirmation: () => set({ isResetAudioConfirmationOpen: false, resetAudioTarget: null }),
      openFilenameInputModal: (props) => set({ filenameInputModalProps: props, isFilenameInputModalOpen: true, isSidebarOpen: false }),
      closeFilenameInputModal: () => set({ isFilenameInputModalOpen: false, filenameInputModalProps: null }),
      submitFilenameInputModal: (filename) => {
        get().filenameInputModalProps?.onSubmit(filename);
        set({ isFilenameInputModalOpen: false, filenameInputModalProps: null });
      },
      openChatAttachmentsModal: (session) => {
        if (!session || !session.messages) {
          get().showToast("No chat session active or session has no messages.", "error");
          return;
        }
        const allAttachments = session.messages.flatMap(msg =>
          (msg.attachments || []).map(att => ({
            attachment: att,
            messageId: msg.id,
            messageTimestamp: msg.timestamp,
            messageRole: msg.role,
            messageContentSnippet: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
          }))
        ).filter(item => item.attachment);

        if (allAttachments.length === 0) {
          get().showToast("No attachments found in this chat.", "success");
          return;
        }
        allAttachments.sort((a, b) => new Date(b.messageTimestamp).getTime() - new Date(a.messageTimestamp).getTime());
        set({
          attachmentsForModal: allAttachments,
          isChatAttachmentsModalOpen: true,
          isSidebarOpen: false,
          isSettingsPanelOpen: false
        });
      },
      closeChatAttachmentsModal: () => set({ isChatAttachmentsModalOpen: false, attachmentsForModal: [] }),
      openApiKeyModal: () => set({ isApiKeyModalOpen: true, isSidebarOpen: false }),
      closeApiKeyModal: () => set({ isApiKeyModalOpen: false }),
      openGitHubImportModal: () => set({ isGitHubImportModalOpen: true, isSidebarOpen: false }),
      closeGitHubImportModal: () => set({ isGitHubImportModalOpen: false }),
      
      // Multi-select Actions
      clearSelection: () => set({ selectedMessageIds: new Set() }),
      toggleSelectionMode: () => set(state => {
        const isNowActive = !state.isSelectionModeActive;
        if (!isNowActive) {
          return { isSelectionModeActive: false, selectedMessageIds: new Set() };
        }
        return { isSelectionModeActive: true };
      }),
      toggleMessageSelection: (messageId) => set(state => {
        const newSet = new Set(state.selectedMessageIds);
        if (newSet.has(messageId)) {
          newSet.delete(messageId);
        } else {
          newSet.add(messageId);
        }
        return { selectedMessageIds: newSet };
      }),
      selectAllVisible: (visibleMessageIds) => set({ selectedMessageIds: new Set(visibleMessageIds) }),
    }),
    {
      name: 'gemini-chat-ui-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      // Only persist a subset of the state
      partialize: (state) => ({
        isSidebarOpen: state.isSidebarOpen,
        layoutDirection: state.layoutDirection,
      }),
    }
  )
);
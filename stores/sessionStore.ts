// stores/sessionStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ChatSession } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';
import { DEFAULT_MODEL_ID, DEFAULT_SETTINGS, INITIAL_MESSAGES_COUNT } from '../constants.ts';
import { useAppConfigStore } from './appConfigStore.ts';

interface SessionState {
  chatHistory: ChatSession[];
  currentChatId: string | null;
  isLoadingData: boolean;
  editingTitleInfo: { id: string | null; value: string };
  actions: {
    loadSessions: () => Promise<void>;
    updateChatSession: (sessionId: string, updater: (session: ChatSession) => ChatSession | null) => Promise<void>;
    handleNewChat: () => Promise<string | undefined>;
    handleSelectChat: (id: string) => Promise<void>;
    handleDeleteChat: (id: string) => Promise<void>;
    handleDuplicateChat: (sessionId: string) => Promise<void>;
    handleStartEditChatTitle: (sessionId: string, currentTitle: string) => void;
    handleSaveChatTitle: () => Promise<void>;
    handleCancelEditChatTitle: () => void;
    handleEditTitleInputChange: (newTitle: string) => void;
    _setChatHistoryAndActiveId: (history: ChatSession[], activeId?: string | null) => void;
  };
}

export const useSessionStore = create<SessionState>()(
  devtools(
    (set, get) => ({
      chatHistory: [],
      currentChatId: null,
      isLoadingData: true,
      editingTitleInfo: { id: null, value: '' },
      actions: {
        loadSessions: async () => {
          set({ isLoadingData: true });
          try {
            const sessions = (await dbService.getAllChatSessions()) || [];
            const activeChatId = await dbService.getAppMetadata<string | null>(METADATA_KEYS.ACTIVE_CHAT_ID);
            
            set({ chatHistory: sessions });
            
            if (sessions.length > 0) {
              const validActiveId = activeChatId && sessions.find(s => s.id === activeChatId) ? activeChatId : sessions[0].id;
              await get().actions.handleSelectChat(validActiveId);
            } else {
              set({ currentChatId: null });
            }
          } catch (error) {
            console.error("Failed to load sessions from storage:", error);
          } finally {
            set({ isLoadingData: false });
          }
        },
        updateChatSession: async (sessionId, updater) => {
          let updatedSession: ChatSession | null = null;
          const newHistory = get().chatHistory.map(session => {
            if (session.id === sessionId) {
              const result = updater(session);
              if (result) {
                updatedSession = { ...result, lastUpdatedAt: new Date() };
                return updatedSession;
              }
            }
            return session;
          }).sort((a,b) => new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime());

          if (updatedSession) {
            set({ chatHistory: newHistory });
            await dbService.addOrUpdateChatSession(updatedSession);
          }
        },
        handleNewChat: async () => {
            const newSessionId = `chat-${Date.now()}`;
            // ... (logic from useChatSessions to get defaults)
            const newSession: ChatSession = {
              id: newSessionId,
              title: 'New Chat',
              messages: [],
              createdAt: new Date(),
              lastUpdatedAt: new Date(),
              model: DEFAULT_MODEL_ID,
              settings: DEFAULT_SETTINGS,
              isCharacterModeActive: false,
              aiCharacters: [],
              apiRequestLogs: [],
              githubRepoContext: null,
            };

            const newHistory = [newSession, ...get().chatHistory];
            set({ chatHistory: newHistory });
            await dbService.addOrUpdateChatSession(newSession);
            await get().actions.handleSelectChat(newSessionId);
            return newSessionId;
        },
        handleSelectChat: async (id: string) => {
          set({ currentChatId: id });
          await dbService.setAppMetadata(METADATA_KEYS.ACTIVE_CHAT_ID, id);
          
          const { setMessagesToDisplayConfig } = useAppConfigStore.getState().actions;
          const chat = get().chatHistory.find(c => c.id === id);
          if (chat) {
              const maxInitial = chat.settings?.maxInitialMessagesDisplayed || DEFAULT_SETTINGS.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT;
              await setMessagesToDisplayConfig(prev => ({
                  ...prev,
                  [id]: Math.min(chat.messages.length, maxInitial)
              }));
          }
        },
        handleDeleteChat: async (id: string) => {
            const { currentChatId, chatHistory } = get();
            const newHistory = chatHistory.filter(s => s.id !== id);
            set({ chatHistory: newHistory });
            await dbService.deleteChatSession(id);
            
            // ... logic to reset configs
            useAppConfigStore.getState().actions;
            // ...

            if (currentChatId === id) {
                const nextActiveId = newHistory.length > 0 ? newHistory[0].id : null;
                set({ currentChatId: nextActiveId });
                await dbService.setAppMetadata(METADATA_KEYS.ACTIVE_CHAT_ID, nextActiveId);
            }
        },
        handleDuplicateChat: async (_sessionId: string) => { /* ... logic from useSidebarActions ... */ },
        handleStartEditChatTitle: (sessionId, currentTitle) => set({ editingTitleInfo: { id: sessionId, value: currentTitle } }),
        handleSaveChatTitle: async () => {
            const { id, value } = get().editingTitleInfo;
            if (id && value.trim()) {
                await get().actions.updateChatSession(id, session => session ? { ...session, title: value.trim() } : null);
            }
            get().actions.handleCancelEditChatTitle();
        },
        handleCancelEditChatTitle: () => set({ editingTitleInfo: { id: null, value: '' } }),
        handleEditTitleInputChange: (newTitle) => set(state => ({ editingTitleInfo: { ...state.editingTitleInfo, value: newTitle }})),
        _setChatHistoryAndActiveId: (history, activeId) => {
            set({ chatHistory: history });
            if (activeId !== undefined) {
                get().actions.handleSelectChat(activeId as string);
            }
        }
      },
    }),
    { name: 'session-store' }
  )
);

// Initial Load
useSessionStore.getState().actions.loadSessions();
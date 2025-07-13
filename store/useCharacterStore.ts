import { create } from 'zustand';
import { useActiveChatStore } from './useActiveChatStore.ts';
import { useToastStore } from './useToastStore.ts';
import { AICharacter, GeminiSettings } from '../types.ts';
import { clearCachedChat as geminiServiceClearCachedChat } from '../services/geminiService.ts';

interface CharacterStoreState {
  // Actions
  toggleCharacterMode: () => Promise<void>;
  addCharacter: (name: string, systemInstruction: string) => Promise<void>;
  editCharacter: (id: string, name: string, systemInstruction: string) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  reorderCharacters: (newCharacters: AICharacter[]) => Promise<void>;
  saveContextualInfo: (characterId: string, newInfo: string) => Promise<void>;
}

export const useCharacterStore = create<CharacterStoreState>(() => ({
  toggleCharacterMode: async () => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    if (!currentChatSession) return;

    if (currentChatSession.isCharacterModeActive && currentChatSession.aiCharacters && currentChatSession.aiCharacters.length > 0) {
        currentChatSession.aiCharacters.forEach(character => {
            const settingsForThisCharacterCache: GeminiSettings & { _characterIdForCacheKey?: string } = {
                ...currentChatSession.settings,
                systemInstruction: character.systemInstruction,
                _characterIdForCacheKey: character.id,
            };
            geminiServiceClearCachedChat(currentChatSession.id, currentChatSession.model, settingsForThisCharacterCache);
        });
    } else if (!currentChatSession.isCharacterModeActive) {
        const settingsForNonCharCache = { ...currentChatSession.settings };
        delete (settingsForNonCharCache as any)._characterIdForCacheKey;
        geminiServiceClearCachedChat(currentChatSession.id, currentChatSession.model, settingsForNonCharCache);
    }

    await updateCurrentChatSession(session => session ? ({
        ...session,
        isCharacterModeActive: !session.isCharacterModeActive,
        aiCharacters: session.aiCharacters || [], 
    }) : null);
  },

  addCharacter: async (name, systemInstruction) => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    if (!currentChatSession) return;
    const newCharacter: AICharacter = {
      id: `char-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name,
      systemInstruction,
      contextualInfo: '',
    };
    await updateCurrentChatSession(session => session ? ({
      ...session,
      aiCharacters: [...(session.aiCharacters || []), newCharacter],
    }) : null);
    useToastStore.getState().showToast("Character added!", "success");
  },

  editCharacter: async (id, name, systemInstruction) => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    if (!currentChatSession) return;

    const characterBeingEdited = currentChatSession.aiCharacters?.find(c => c.id === id);
    if (characterBeingEdited) {
        const settingsForThisCharacterCache: GeminiSettings & { _characterIdForCacheKey?: string } = {
            ...currentChatSession.settings,
            systemInstruction: characterBeingEdited.systemInstruction,
            _characterIdForCacheKey: characterBeingEdited.id,
        };
        geminiServiceClearCachedChat(currentChatSession.id, currentChatSession.model, settingsForThisCharacterCache);
    }

    await updateCurrentChatSession(session => session ? ({
      ...session,
      aiCharacters: (session.aiCharacters || []).map(char => 
        char.id === id ? { ...char, name, systemInstruction } : char
      ),
    }) : null);
    useToastStore.getState().showToast("Character updated!", "success");
  },

  deleteCharacter: async (id) => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    if (!currentChatSession) return;

    const characterBeingDeleted = currentChatSession.aiCharacters?.find(c => c.id === id);
    if (characterBeingDeleted) {
        const settingsForThisCharacterCache: GeminiSettings & { _characterIdForCacheKey?: string } = {
            ...currentChatSession.settings,
            systemInstruction: characterBeingDeleted.systemInstruction,
            _characterIdForCacheKey: characterBeingDeleted.id,
        };
        geminiServiceClearCachedChat(currentChatSession.id, currentChatSession.model, settingsForThisCharacterCache);
    }

    await updateCurrentChatSession(session => session ? ({
      ...session,
      aiCharacters: (session.aiCharacters || []).filter(char => char.id !== id),
    }) : null);
    useToastStore.getState().showToast("Character deleted!", "success");
  },

  reorderCharacters: async (newCharacters) => {
    const { currentChatSession, updateCurrentChatSession } = useActiveChatStore.getState();
    if (!currentChatSession) return;
    if (currentChatSession.isCharacterModeActive && currentChatSession.aiCharacters && currentChatSession.aiCharacters.length > 0) {
      currentChatSession.aiCharacters.forEach(character => {
        const settingsForThisCharacterCache: GeminiSettings & { _characterIdForCacheKey?: string } = {
          ...currentChatSession.settings,
          systemInstruction: character.systemInstruction,
          _characterIdForCacheKey: character.id,
        };
        geminiServiceClearCachedChat(currentChatSession.id, currentChatSession.model, settingsForThisCharacterCache);
      });
    }

    await updateCurrentChatSession(session => session ? ({
      ...session,
      aiCharacters: newCharacters,
    }) : null);
  },

  saveContextualInfo: async (characterId, newInfo) => {
    const { updateCurrentChatSession } = useActiveChatStore.getState();
    await updateCurrentChatSession(session => {
      if (!session || !session.aiCharacters) return session;
      return {
        ...session,
        aiCharacters: session.aiCharacters.map(char =>
          char.id === characterId ? { ...char, contextualInfo: newInfo } : char
        ),
      };
    });
    useToastStore.getState().showToast("Contextual info saved!", "success");
  },
}));

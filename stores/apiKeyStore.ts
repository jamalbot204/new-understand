// src/stores/apiKeyStore.ts
import { create } from 'zustand';
import { ApiKey } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';

interface ApiKeyState {
  apiKeys: ApiKey[];
  activeApiKey: ApiKey | null;
  isKeyVisible: boolean;
  isLoading: boolean;
  isRotationEnabled: boolean;
  actions: {
    loadKeysAndSettings: () => Promise<void>;
    addApiKey: () => void;
    updateApiKey: (id: string, name: string, value: string) => void;
    deleteApiKey: (id: string) => void;
    toggleKeyVisibility: () => void;
    moveKey: (id: string, direction: 'up' | 'down') => void;
    moveKeyToEdge: (id: string, edge: 'top' | 'bottom') => void;
    rotateActiveKey: () => Promise<void>;
    toggleRotation: () => Promise<void>;
  };
}

export const useApiKeyStore = create<ApiKeyState>((set, get) => ({
  apiKeys: [],
  activeApiKey: null,
  isKeyVisible: false,
  isLoading: true,
  isRotationEnabled: true,
  actions: {
    loadKeysAndSettings: async () => {
      set({ isLoading: true });
      try {
        const storedKeys = await dbService.getAppMetadata<ApiKey[]>(METADATA_KEYS.API_KEYS);
        const keys = storedKeys || [];
        const storedRotationSetting = await dbService.getAppMetadata<boolean>(METADATA_KEYS.API_KEY_ROTATION);
        
        set({
          apiKeys: keys,
          activeApiKey: keys.length > 0 ? keys[0] : null,
          isRotationEnabled: storedRotationSetting !== false,
          isLoading: false,
        });
      } catch (error) {
        console.error("Failed to load API keys or settings from storage:", error);
        set({ apiKeys: [], activeApiKey: null, isRotationEnabled: true, isLoading: false });
      }
    },
    addApiKey: () => {
      const newKey: ApiKey = {
        id: `apikey-${Date.now()}`,
        name: `Key ${get().apiKeys.length + 1}`,
        value: '',
      };
      const newKeys = [...get().apiKeys, newKey];
      set({ apiKeys: newKeys, activeApiKey: newKeys.length > 0 ? newKeys[0] : null });
      dbService.setAppMetadata(METADATA_KEYS.API_KEYS, newKeys);
    },
    updateApiKey: (id, name, value) => {
      const newKeys = get().apiKeys.map(key =>
        key.id === id ? { ...key, name, value } : key
      );
      set({ apiKeys: newKeys, activeApiKey: newKeys.length > 0 ? newKeys[0] : null });
      dbService.setAppMetadata(METADATA_KEYS.API_KEYS, newKeys);
    },
    deleteApiKey: (id) => {
      const newKeys = get().apiKeys.filter(key => key.id !== id);
      set({ apiKeys: newKeys, activeApiKey: newKeys.length > 0 ? newKeys[0] : null });
      dbService.setAppMetadata(METADATA_KEYS.API_KEYS, newKeys);
    },
    moveKey: (id, direction) => {
      const index = get().apiKeys.findIndex(key => key.id === id);
      if (index === -1) return;

      const newKeys = [...get().apiKeys];
      const newIndex = direction === 'up' ? index - 1 : index + 1;

      if (newIndex < 0 || newIndex >= newKeys.length) return;

      [newKeys[index], newKeys[newIndex]] = [newKeys[newIndex], newKeys[index]];
      
      set({ apiKeys: newKeys, activeApiKey: newKeys.length > 0 ? newKeys[0] : null });
      dbService.setAppMetadata(METADATA_KEYS.API_KEYS, newKeys);
    },
    moveKeyToEdge: (id, edge) => {
      const index = get().apiKeys.findIndex(key => key.id === id);
      const apiKeys = get().apiKeys;
      if (index === -1 || (edge === 'top' && index === 0) || (edge === 'bottom' && index === apiKeys.length - 1)) return;

      const newKeys = [...apiKeys];
      const [item] = newKeys.splice(index, 1);

      if (edge === 'top') {
        newKeys.unshift(item);
      } else {
        newKeys.push(item);
      }
      
      set({ apiKeys: newKeys, activeApiKey: newKeys.length > 0 ? newKeys[0] : null });
      dbService.setAppMetadata(METADATA_KEYS.API_KEYS, newKeys);
    },
    toggleKeyVisibility: () => set(state => ({ isKeyVisible: !state.isKeyVisible })),
    toggleRotation: async () => {
      const newRotationState = !get().isRotationEnabled;
      set({ isRotationEnabled: newRotationState });
      await dbService.setAppMetadata(METADATA_KEYS.API_KEY_ROTATION, newRotationState);
    },
    rotateActiveKey: async () => {
      const { isRotationEnabled, apiKeys } = get();
      if (!isRotationEnabled || apiKeys.length < 2) return;
      
      const newKeys = [...apiKeys.slice(1), apiKeys[0]];
      set({ apiKeys: newKeys, activeApiKey: newKeys[0] });
      await dbService.setAppMetadata(METADATA_KEYS.API_KEYS, newKeys);
    },
  },
}));

// Initialize the store by loading data from the database.
useApiKeyStore.getState().actions.loadKeysAndSettings();
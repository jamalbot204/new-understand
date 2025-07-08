// stores/appConfigStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { ExportConfiguration } from '../types.ts';
import * as dbService from '../services/dbService.ts';
import { METADATA_KEYS } from '../services/dbService.ts';
import { DEFAULT_EXPORT_CONFIGURATION } from '../constants.ts';

interface AppConfigState {
  messagesToDisplayConfig: Record<string, number>;
  currentExportConfig: ExportConfiguration;
  messageGenerationTimes: Record<string, number>;
  actions: {
    loadAllConfigs: () => Promise<void>;
    setMessagesToDisplayConfig: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
    setCurrentExportConfig: (newConfig: ExportConfiguration) => Promise<void>;
    setMessageGenerationTimes: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
    loadMoreDisplayMessages: (sessionId: string, count: number) => Promise<void>;
    loadAllDisplayMessages: (sessionId: string, totalCount: number) => Promise<void>;
    _dangerouslyWipeAndInitialize: () => Promise<void>;
  };
}

export const useAppConfigStore = create<AppConfigState>()(
  devtools(
    (set, get) => ({
      messagesToDisplayConfig: {},
      currentExportConfig: DEFAULT_EXPORT_CONFIGURATION,
      messageGenerationTimes: {},
      actions: {
        loadAllConfigs: async () => {
          try {
            const displayConfig = await dbService.getAppMetadata<Record<string, number>>(METADATA_KEYS.MESSAGES_TO_DISPLAY_CONFIG);
            const exportConfig = await dbService.getAppMetadata<ExportConfiguration>(METADATA_KEYS.EXPORT_CONFIGURATION);
            const genTimes = await dbService.getAppMetadata<Record<string, number>>(METADATA_KEYS.MESSAGE_GENERATION_TIMES);
            set({
              messagesToDisplayConfig: displayConfig || {},
              currentExportConfig: exportConfig || DEFAULT_EXPORT_CONFIGURATION,
              messageGenerationTimes: genTimes || {},
            });
          } catch (error) {
            console.error("Failed to load app configs from storage:", error);
          }
        },
        setMessagesToDisplayConfig: async (updater) => {
          const newConfig = typeof updater === 'function' ? updater(get().messagesToDisplayConfig) : updater;
          set({ messagesToDisplayConfig: newConfig });
          await dbService.setAppMetadata(METADATA_KEYS.MESSAGES_TO_DISPLAY_CONFIG, newConfig);
        },
        setCurrentExportConfig: async (newConfig) => {
          set({ currentExportConfig: newConfig });
          await dbService.setAppMetadata(METADATA_KEYS.EXPORT_CONFIGURATION, newConfig);
        },
        setMessageGenerationTimes: async (updater) => {
          const newTimes = typeof updater === 'function' ? updater(get().messageGenerationTimes) : updater;
          set({ messageGenerationTimes: newTimes });
          await dbService.setAppMetadata(METADATA_KEYS.MESSAGE_GENERATION_TIMES, newTimes);
        },
        loadMoreDisplayMessages: async (sessionId, count) => {
            const { messagesToDisplayConfig, actions } = get();
            const currentCount = messagesToDisplayConfig[sessionId] || 0;
            await actions.setMessagesToDisplayConfig({ ...messagesToDisplayConfig, [sessionId]: currentCount + count });
        },
        loadAllDisplayMessages: async (sessionId, totalCount) => {
            const { messagesToDisplayConfig, actions } = get();
            await actions.setMessagesToDisplayConfig({ ...messagesToDisplayConfig, [sessionId]: totalCount });
        },
        _dangerouslyWipeAndInitialize: async () => {
          set({
            messagesToDisplayConfig: {},
            currentExportConfig: DEFAULT_EXPORT_CONFIGURATION,
            messageGenerationTimes: {},
          });
        }
      },
    }),
    { name: 'app-config-store' }
  )
);

// Initial load
useAppConfigStore.getState().actions.loadAllConfigs();
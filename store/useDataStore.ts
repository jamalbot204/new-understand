import { create } from 'zustand';
import { ChatSession, ExportConfiguration, Attachment, ChatMessage, ApiRequestLog, ApiKey, UserDefinedDefaults, GeminiSettings, AICharacter } from '../types.ts';
import * as dbService from '../services/dbService';
import { METADATA_KEYS } from '../services/dbService.ts';
import { DEFAULT_EXPORT_CONFIGURATION, INITIAL_MESSAGES_COUNT, DEFAULT_SETTINGS, DEFAULT_SAFETY_SETTINGS, DEFAULT_TTS_SETTINGS } from '../constants.ts';
import { useToastStore } from './useToastStore.ts';
import { useActiveChatStore } from './useActiveChatStore';
import { useChatListStore } from './useChatListStore.ts';

interface DataStoreState {
  messagesToDisplayConfig: Record<string, number>;
  currentExportConfig: ExportConfiguration;
  messageGenerationTimes: Record<string, number>;

  // Actions
  init: () => Promise<void>;
  cleanupOnChatDelete: (chatId: string) => Promise<void>;

  // Persistence Actions
  setMessagesToDisplayConfig: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
  setCurrentExportConfig: (newConfig: ExportConfiguration) => Promise<void>;
  setMessageGenerationTimes: (updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => Promise<void>;
  handleManualSave: (isSilent?: boolean) => Promise<void>;
  
  // Import/Export Actions
  handleExportChats: (chatIdsToExport: string[], exportConfig: ExportConfiguration) => Promise<void>;
  handleImportAll: () => Promise<void>;

  // New Granular Persistence API
  updateTitle: (chatId: string, newTitle: string) => Promise<void>;
  updateMessages: (chatId: string, newMessages: ChatMessage[]) => Promise<void>;
  updateSettings: (chatId: string, newSettings: GeminiSettings) => Promise<void>;
  updateModel: (chatId: string, newModel: string) => Promise<void>;
  updateCharacters: (chatId: string, newCharacters: AICharacter[]) => Promise<void>;
  updateGithubContext: (chatId: string, newContext: ChatSession['githubRepoContext']) => Promise<void>;
}

const transformImportedData = async (importedRawData: any): Promise<{
    sessions: ChatSession[],
    generationTimes: Record<string, number>,
    displayConfig: Record<string,number>,
    activeChatId?: string | null,
    exportConfiguration?: ExportConfiguration,
    apiKeys?: ApiKey[],
  }> => {
    const importedGenerationTimes: Record<string, number> =
      (importedRawData?.data?.messageGenerationTimes && typeof importedRawData.data.messageGenerationTimes === 'object')
      ? importedRawData.data.messageGenerationTimes : {};

    const importedDisplayConfig: Record<string, number> = 
      (importedRawData?.data?.messagesToDisplayConfig && typeof importedRawData.data.messagesToDisplayConfig === 'object')
      ? importedRawData.data.messagesToDisplayConfig : {};
      
    const importedExportConfig: ExportConfiguration | undefined = 
        (importedRawData?.data?.exportConfigurationUsed && typeof importedRawData.data.exportConfigurationUsed === 'object') // Check new key first
        ? { ...DEFAULT_EXPORT_CONFIGURATION, ...importedRawData.data.exportConfigurationUsed }
        : (importedRawData?.data?.exportConfiguration && typeof importedRawData.data.exportConfiguration === 'object') // Fallback for older exports
        ? { ...DEFAULT_EXPORT_CONFIGURATION, ...importedRawData.data.exportConfiguration }
        : undefined;

    const importedApiKeys: ApiKey[] | undefined =
        (importedRawData?.data?.apiKeys && Array.isArray(importedRawData.data.apiKeys))
        ? importedRawData.data.apiKeys : undefined;


    let importedActiveChatId: string | null | undefined = undefined;
    if (importedRawData?.data?.appState && Array.isArray(importedRawData.data.appState)) {
        const activeChatState = importedRawData.data.appState.find((s: any) => s.key === 'activeChatId');
        if (activeChatState) {
            importedActiveChatId = activeChatState.value;
        }
    } else if (importedRawData?.data?.lastActiveChatId) { // Support older single key format
        importedActiveChatId = importedRawData.data.lastActiveChatId;
    }


    if (importedRawData?.data?.chats) { 
        const audioWritePromises: Promise<void>[] = [];
        
        const sessions: ChatSession[] = importedRawData.data.chats.map((s: any) => ({
            ...s,
            createdAt: new Date(s.createdAt),
            lastUpdatedAt: new Date(s.lastUpdatedAt),
            messages: s.messages.map((m: any) => {
                const importedMessage: Partial<ChatMessage> & { cachedAudioBuffers?: any } = {
                    ...m,
                    timestamp: new Date(m.timestamp),
                    groundingMetadata: m.groundingMetadata || undefined,
                    characterName: m.characterName || undefined, 
                };

                // Import attachments
                if (m.attachments) {
                    importedMessage.attachments = m.attachments.map((att: any) => {
                        const importedAttachment: Attachment = {
                            id: att.id || `imported-att-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                            type: att.type || (att.mimeType?.startsWith('image/') ? 'image' : 'video'),
                            mimeType: att.mimeType,
                            name: att.name,
                            size: att.size,
                            fileUri: att.fileUri,
                            fileApiName: att.fileApiName,
                            base64Data: att.base64Data,
                            dataUrl: att.dataUrl,
                            uploadState: undefined,
                            statusMessage: undefined,
                            error: undefined,
                            isLoading: false,
                        };
                        if (importedAttachment.fileUri && importedAttachment.fileApiName) {
                            importedAttachment.uploadState = 'completed_cloud_upload';
                            importedAttachment.statusMessage = 'Cloud file (from import)';
                        } else if (importedAttachment.base64Data && importedAttachment.mimeType) {
                            if (!importedAttachment.dataUrl) {
                               importedAttachment.dataUrl = `data:${importedAttachment.mimeType};base64,${importedAttachment.base64Data}`;
                            }
                            importedAttachment.uploadState = 'completed';
                            importedAttachment.statusMessage = 'Local data (from import)';
                        } else {
                            importedAttachment.uploadState = 'error_client_read'; 
                            importedAttachment.statusMessage = 'Imported file data incomplete or missing.';
                            importedAttachment.error = 'Incomplete file data from import.';
                        }
                        return importedAttachment;
                    });
                } else {
                    importedMessage.attachments = undefined;
                }
                
                // Import cached message audio (both old and new formats)
                const audioBase64Array = m.exportedMessageAudioBase64 || [];
                let audioBuffers: (ArrayBuffer | null)[] = [];
                if (m.cachedAudioBuffers && Array.isArray(m.cachedAudioBuffers)) { // Old format
                    audioBuffers = m.cachedAudioBuffers.map(b => b ? b : null);
                } else if (audioBase64Array.length > 0) { // New format
                    audioBuffers = audioBase64Array.map((base64String: string | null) => {
                         if (typeof base64String === 'string') {
                            try {
                                const binary_string = window.atob(base64String);
                                const len = binary_string.length;
                                const bytes = new Uint8Array(len);
                                for (let i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); }
                                return bytes.buffer;
                            } catch (e) {
                                console.error("Failed to decode base64 audio string during import:", m.id, e);
                                return null;
                            }
                        }
                        return null;
                    });
                }

                if (audioBuffers.length > 0) {
                    const validBuffers = audioBuffers.filter(b => b !== null);
                    if (validBuffers.length > 0) {
                        importedMessage.cachedAudioSegmentCount = validBuffers.length;
                        validBuffers.forEach((buffer, index) => {
                            if(buffer) audioWritePromises.push(dbService.setAudioBuffer(`${m.id}_part_${index}`, buffer));
                        });
                    }
                }
                
                delete importedMessage.exportedMessageAudioBase64; // Clean up temporary field
                delete importedMessage.cachedAudioBuffers; // Clean up old field

                return importedMessage as ChatMessage;
            }),
            settings: {
                ...DEFAULT_SETTINGS, 
                ...s.settings,      
                safetySettings: s.settings?.safetySettings?.length ? s.settings.safetySettings : [...DEFAULT_SAFETY_SETTINGS],
                ttsSettings: s.settings?.ttsSettings || { ...DEFAULT_TTS_SETTINGS }, // Handle TTS settings on import
                aiSeesTimestamps: s.settings?.aiSeesTimestamps === undefined ? DEFAULT_SETTINGS.aiSeesTimestamps : s.settings.aiSeesTimestamps,
                useGoogleSearch: s.settings?.useGoogleSearch === undefined ? DEFAULT_SETTINGS.useGoogleSearch : s.settings.useGoogleSearch,
                urlContext: s.settings?.urlContext || DEFAULT_SETTINGS.urlContext || [],
                maxInitialMessagesDisplayed: s.settings?.maxInitialMessagesDisplayed || DEFAULT_SETTINGS.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT,
                debugApiRequests: s.settings?.debugApiRequests === undefined ? DEFAULT_SETTINGS.debugApiRequests : s.settings.debugApiRequests,
            },
            isCharacterModeActive: s.isCharacterModeActive || false, 
            aiCharacters: (s.aiCharacters || []).map((char: any) => ({ ...char, contextualInfo: char.contextualInfo || ''})),
            apiRequestLogs: (s.apiRequestLogs || []).map((log: any) => ({
                ...log,
                timestamp: new Date(log.timestamp)
            })),                   
        }));

        await Promise.all(audioWritePromises);

        return { 
            sessions, 
            generationTimes: importedGenerationTimes, 
            displayConfig: importedDisplayConfig,
            activeChatId: importedActiveChatId,
            exportConfiguration: importedExportConfig,
            apiKeys: importedApiKeys,
        };
    }

    if (typeof importedRawData !== 'object' || importedRawData === null ) {
      console.error("Imported JSON structure is invalid.");
      return { sessions: [], generationTimes: {}, displayConfig: {}, activeChatId: null };
    }
    console.warn("Attempting to import legacy data format. Some features or data might be missing or transformed.")
    return { 
        sessions: [], 
        generationTimes: importedGenerationTimes, 
        displayConfig: importedDisplayConfig, 
        activeChatId: importedActiveChatId,
        exportConfiguration: importedExportConfig,
        apiKeys: importedApiKeys,
    };
  };

export const useDataStore = create<DataStoreState>((set, get) => ({
  messagesToDisplayConfig: {},
  currentExportConfig: DEFAULT_EXPORT_CONFIGURATION,
  messageGenerationTimes: {},

  init: async () => {
    try {
        const storedConfig = await dbService.getAppMetadata<Record<string, number>>(METADATA_KEYS.MESSAGES_TO_DISPLAY_CONFIG);
        if (storedConfig) {
            set({ messagesToDisplayConfig: storedConfig });
        }

        const storedExportConfig = await dbService.getAppMetadata<ExportConfiguration>(METADATA_KEYS.EXPORT_CONFIGURATION);
        set({ currentExportConfig: storedExportConfig || DEFAULT_EXPORT_CONFIGURATION });
        
        const storedGenTimes = await dbService.getAppMetadata<Record<string, number>>(METADATA_KEYS.MESSAGE_GENERATION_TIMES);
        if (storedGenTimes) {
            set({ messageGenerationTimes: storedGenTimes });
        }
    } catch (error) {
        console.error("Failed to load persisted app data:", error);
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

  cleanupOnChatDelete: async (chatId) => {
    const { messageGenerationTimes, messagesToDisplayConfig } = get();
    const chatHistory = useChatListStore.getState().chatHistory;
    if (!chatHistory) return;

    const chatToDelete = chatHistory.find(s => s.id === chatId);

    const newDisplayConfig = { ...messagesToDisplayConfig };
    delete newDisplayConfig[chatId];
    set({ messagesToDisplayConfig: newDisplayConfig });
    await dbService.setAppMetadata(METADATA_KEYS.MESSAGES_TO_DISPLAY_CONFIG, newDisplayConfig);

    if (chatToDelete) {
        const newGenTimes = { ...messageGenerationTimes };
        chatToDelete.messages.forEach(msg => delete newGenTimes[msg.id]);
        set({ messageGenerationTimes: newGenTimes });
        await dbService.setAppMetadata(METADATA_KEYS.MESSAGE_GENERATION_TIMES, newGenTimes);
    }
  },

  handleManualSave: async (isSilent: boolean = false) => {
    const chatHistory = useChatListStore.getState().chatHistory;
    const currentChatId = useActiveChatStore.getState().currentChatId;
    const showToast = useToastStore.getState().showToast;

    const { messageGenerationTimes, messagesToDisplayConfig, currentExportConfig } = get();

    try {
      for (const session of chatHistory) {
        await dbService.addOrUpdateChatSession(session);
      }
      if (currentChatId) {
        await dbService.setAppMetadata(METADATA_KEYS.ACTIVE_CHAT_ID, currentChatId);
      }
      await dbService.setAppMetadata(METADATA_KEYS.MESSAGE_GENERATION_TIMES, messageGenerationTimes);
      await dbService.setAppMetadata(METADATA_KEYS.MESSAGES_TO_DISPLAY_CONFIG, messagesToDisplayConfig);
      await dbService.setAppMetadata(METADATA_KEYS.EXPORT_CONFIGURATION, currentExportConfig);
      
    } catch (error) {
      console.error("Save operation failed:", error);
      if (!isSilent) {
        showToast("Failed to save app state.", "error");
      }
      // Re-throw to allow callers (like the manual save button) to handle it.
      throw error;
    }
  },
  
  handleExportChats: async (chatIdsToExport, exportConfig) => {
    const chatHistory = useChatListStore.getState().chatHistory;
    const currentChatId = useActiveChatStore.getState().currentChatId;
    const showToast = useToastStore.getState().showToast;

    if (chatIdsToExport.length === 0) {
        showToast("No chats selected for export.", "error");
        return;
    }

    const sessionsToProcess = chatHistory.filter(s => chatIdsToExport.includes(s.id));

    if (sessionsToProcess.length === 0) {
        showToast("Selected chats could not be found.", "error");
        return;
    }
    
    let sessionsForExport: Partial<ChatSession>[] = [];
    if (exportConfig.includeChatSessionsAndMessages) {
        sessionsForExport = await Promise.all(sessionsToProcess.map(async session => {
             const sessionWithUpToDateTTS: ChatSession = { ...session, settings: { ...session.settings, ttsSettings: session.settings.ttsSettings || { ...DEFAULT_TTS_SETTINGS } }, apiRequestLogs: session.apiRequestLogs || [] };
            let processedSession: Partial<ChatSession> = { ...sessionWithUpToDateTTS };
            
            if (!exportConfig.includeApiLogs) delete processedSession.apiRequestLogs;
            else processedSession.apiRequestLogs = (sessionWithUpToDateTTS.apiRequestLogs || []).map(log => ({ ...log, timestamp: new Date(log.timestamp) })) as ApiRequestLog[];

            processedSession.messages = await Promise.all(sessionWithUpToDateTTS.messages.map(async message => {
                let processedMessage: Partial<ChatMessage> = { ...message };
                if (exportConfig.includeCachedMessageAudio && message.cachedAudioSegmentCount && message.cachedAudioSegmentCount > 0) {
                    const audioFetchPromises: Promise<ArrayBuffer | undefined>[] = [];
                    for(let i = 0; i < message.cachedAudioSegmentCount; i++) {
                        audioFetchPromises.push(dbService.getAudioBuffer(`${message.id}_part_${i}`));
                    }
                    const audioBuffers = await Promise.all(audioFetchPromises);
                    const validAudioStrings = audioBuffers
                        .map(b => b ? window.btoa(new Uint8Array(b).reduce((data, byte) => data + String.fromCharCode(byte), '')) : null)
                        .filter(s => s !== null) as string[];

                    if(validAudioStrings.length > 0) processedMessage.exportedMessageAudioBase64 = validAudioStrings;
                }
                
                delete processedMessage.cachedAudioSegmentCount;
                if (!exportConfig.includeMessageContent) delete processedMessage.content;
                if (!exportConfig.includeMessageTimestamps) delete processedMessage.timestamp;
                if (!exportConfig.includeMessageRoleAndCharacterNames) { delete processedMessage.role; delete processedMessage.characterName; }
                if (!exportConfig.includeGroundingMetadata) delete processedMessage.groundingMetadata;
                if (message.attachments) {
                    if (!exportConfig.includeMessageAttachmentsMetadata) delete processedMessage.attachments;
                    else {
                        processedMessage.attachments = message.attachments.map(att => {
                            const attachmentToExport: Partial<Attachment> = { id: att.id, type: att.type, mimeType: att.mimeType, name: att.name, size: att.size, fileUri: att.fileUri, fileApiName: att.fileApiName };
                            if (exportConfig.includeFullAttachmentFileData) {
                                if (att.base64Data) attachmentToExport.base64Data = att.base64Data; 
                                if (att.dataUrl) attachmentToExport.dataUrl = att.dataUrl; 
                            }
                            return attachmentToExport as Attachment;
                        });
                    }
                }
                return processedMessage as ChatMessage;
            }));

            if (!exportConfig.includeChatSpecificSettings) { delete processedSession.settings; delete processedSession.model; }
            else { processedSession.settings = { ...(processedSession.settings || DEFAULT_SETTINGS), ttsSettings: processedSession.settings?.ttsSettings || { ...DEFAULT_TTS_SETTINGS } }; }
            if (!exportConfig.includeAiCharacterDefinitions) delete processedSession.aiCharacters;
            return processedSession;
        }));
    }

    const appStateForExport: {key: string, value: any}[] = [];
    if(exportConfig.includeLastActiveChatId) {
        appStateForExport.push({ key: "activeId", value: currentChatId || null });
    }
    
    const { messageGenerationTimes, messagesToDisplayConfig } = get();
    let genTimesForExport: Record<string, number> | undefined;
    if(exportConfig.includeMessageGenerationTimes) genTimesForExport = messageGenerationTimes;

    let dispConfigForExport: Record<string, number> | undefined;
    if(exportConfig.includeUiConfiguration) dispConfigForExport = messagesToDisplayConfig;
    
    let globalDefaultsForExport: any | undefined;
    if(exportConfig.includeUserDefinedGlobalDefaults) globalDefaultsForExport = await dbService.getAppMetadata<any>(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS);

    let apiKeysForExport: any | undefined;
    if (exportConfig.includeApiKeys) apiKeysForExport = await dbService.getAppMetadata<any>(METADATA_KEYS.API_KEYS);

    const exportData: any = { version: 20, exportedAt: new Date().toISOString(), data: {} };
    if (exportConfig.includeChatSessionsAndMessages && sessionsForExport.length > 0) exportData.data.chats = sessionsForExport;
    if (appStateForExport.length > 0) exportData.data.appState = appStateForExport;
    if (genTimesForExport) exportData.data.messageGenerationTimes = genTimesForExport;
    if (dispConfigForExport) exportData.data.messagesToDisplayConfig = dispConfigForExport;
    if (globalDefaultsForExport) exportData.data.userDefinedGlobalDefaults = globalDefaultsForExport;
    if (apiKeysForExport) exportData.data.apiKeys = apiKeysForExport;
    exportData.data.exportConfigurationUsed = exportConfig;

    const jsonString = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportData, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
    const fileNameSuffix = chatIdsToExport.length === 1 ? `_chat-${chatIdsToExport[0].substring(0,8)}` : `_selected-chats`;
    link.download = `gemini-chat-export-${timestamp}${fileNameSuffix}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  handleImportAll: async () => {
    const showToast = useToastStore.getState().showToast;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    const cleanupInputElement = () => {
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      try {
        if (file) {
          const text = await file.text();
          let importedRawData;
          try {
            importedRawData = JSON.parse(text);
          } catch (jsonError: any) {
            showToast(`Import Failed: Not a valid JSON file.`, "error");
            return;
          }

          const { sessions, generationTimes, displayConfig, activeChatId, exportConfiguration, apiKeys } = await transformImportedData(importedRawData);

          if (sessions.length === 0 && !Object.keys(generationTimes).length && !activeChatId && !Object.keys(displayConfig).length) {
            showToast("Could not import: File empty or format unrecognized.", "error");
            return;
          }

          for (const session of sessions) await dbService.addOrUpdateChatSession(session);
          const currentGenTimes = await dbService.getAppMetadata<Record<string, number>>(METADATA_KEYS.MESSAGE_GENERATION_TIMES) || {};
          await get().setMessageGenerationTimes({ ...currentGenTimes, ...generationTimes });

          if (importedRawData?.data?.userDefinedGlobalDefaults) await dbService.setAppMetadata<UserDefinedDefaults>(METADATA_KEYS.USER_DEFINED_GLOBAL_DEFAULTS, importedRawData.data.userDefinedGlobalDefaults);
          if (exportConfiguration) await get().setCurrentExportConfig(exportConfiguration);
          if (apiKeys) await dbService.setAppMetadata<ApiKey[]>(METADATA_KEYS.API_KEYS, apiKeys);

          // Reload data into stores
          await useChatListStore.getState().loadChatHistory();
          const allSessionsAfterImport = useChatListStore.getState().chatHistory;

          const newDisplayConfigFromImport: Record<string, number> = {};
          allSessionsAfterImport.forEach(session => {
            newDisplayConfigFromImport[session.id] = displayConfig[session.id] !== undefined ? Math.min(session.messages.length, displayConfig[session.id]) : Math.min(session.messages.length, session.settings?.maxInitialMessagesDisplayed || INITIAL_MESSAGES_COUNT);
          });
          await get().setMessagesToDisplayConfig(newDisplayConfigFromImport);

          const newActiveId = activeChatId && allSessionsAfterImport.find(s => s.id === activeChatId) ? activeChatId : (allSessionsAfterImport[0]?.id || null);
          await useActiveChatStore.getState().selectChat(newActiveId);

          let toastMessage = `Import successful! ${sessions.length} session(s) processed.`;
          if (apiKeys?.length) {
            toastMessage += ` ${apiKeys.length} API key(s) processed. App will refresh.`;
            showToast(toastMessage, "success", 2500);
            setTimeout(() => window.location.reload(), 2500);
          } else {
            showToast(toastMessage, "success");
          }
        }
      } catch (err: any) {
        showToast(`Import Failed: ${err.message || "Unknown error."}`, "error");
      } finally {
        cleanupInputElement();
      }
    };
    
    document.body.appendChild(input);
    input.click();
  },

  // New Granular Persistence API
  updateTitle: async (chatId, newTitle) => {
    try {
      await dbService.updateChatTitleInDB(chatId, newTitle);
    } catch (e) {
      console.error("Failed to update title in DB", e);
      useToastStore.getState().showToast("Failed to save title change.", "error");
    }
  },
  updateMessages: async (chatId, newMessages) => {
    try {
      await dbService.updateMessagesInDB(chatId, newMessages);
    } catch (e) {
      console.error("Failed to update messages in DB", e);
      useToastStore.getState().showToast("Failed to save message changes.", "error");
    }
  },
  updateSettings: async (chatId, newSettings) => {
    try {
      await dbService.updateSettingsInDB(chatId, newSettings);
    } catch (e) {
      console.error("Failed to update settings in DB", e);
      useToastStore.getState().showToast("Failed to save settings.", "error");
    }
  },
  updateModel: async (chatId, newModel) => {
    try {
      await dbService.updateModelInDB(chatId, newModel);
    } catch (e) {
      console.error("Failed to update model in DB", e);
      useToastStore.getState().showToast("Failed to save model change.", "error");
    }
  },
  updateCharacters: async (chatId, newCharacters) => {
    try {
      await dbService.updateCharactersInDB(chatId, newCharacters);
    } catch (e) {
      console.error("Failed to update characters in DB", e);
      useToastStore.getState().showToast("Failed to save character changes.", "error");
    }
  },
  updateGithubContext: async (chatId, newContext) => {
    try {
      await dbService.updateGithubContextInDB(chatId, newContext);
    } catch (e) {
      console.error("Failed to update GitHub context in DB", e);
      useToastStore.getState().showToast("Failed to save GitHub context.", "error");
    }
  },
}));

// Initialize store by loading data
useDataStore.getState().init();

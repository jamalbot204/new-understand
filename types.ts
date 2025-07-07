// types.ts

import React from 'react';
import { Content, Part as GeminiPart, SafetySetting as GeminiSafetySettingSDK, Tool } from "@google/genai";

// This type was previously in EditMessagePanel.tsx, moving it here to be globally accessible.
export enum EditMessagePanelAction {
  CANCEL = 'cancel',
  SAVE_LOCALLY = 'save_locally',
  SAVE_AND_SUBMIT = 'save_and_submit',
  CONTINUE_PREFIX = 'continue_prefix',
}

// This type was previously in EditMessagePanel.tsx, moving it here to be globally accessible.
export interface EditMessagePanelDetails {
  sessionId: string;
  messageId: string;
  originalContent: string;
  role: ChatMessageRole;
  attachments?: Attachment[];
}

// This type was previously in useAppUI.ts, moving it here.
export interface ToastInfo {
  message: string;
  type: 'success' | 'error';
  duration?: number;
}

// This type was previously in useAppModals.ts, moving it here.
export interface FilenameInputModalTriggerProps {
  defaultFilename: string;
  promptMessage: string;
  onSubmit: (filename: string) => void;
}


export enum ChatMessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
  ERROR = 'error'
}

export interface GroundingChunk {
  web: {
    uri: string;
    title: string;
  };
}

export type AttachmentUploadState =
  | 'idle'
  | 'reading_client'
  | 'uploading_to_cloud'
  | 'processing_on_server'
  | 'completed_cloud_upload'
  | 'completed'
  | 'error_client_read'
  | 'error_cloud_upload';

export interface Attachment {
  id: string; 
  type: 'image' | 'video';
  mimeType: string;
  name: string;
  base64Data?: string;
  dataUrl?: string;
  size: number;
  
  fileUri?: string;
  fileApiName?: string;
  uploadState?: AttachmentUploadState; 
  statusMessage?: string;
  progress?: number;

  error?: string;
  isLoading?: boolean;

  isReUploading?: boolean;
  reUploadError?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  attachments?: Attachment[]; 
  groundingMetadata?: { 
    groundingChunks?: GroundingChunk[];
  };
  characterName?: string; 
  cachedAudioBuffers?: (ArrayBuffer | null)[] | null;
  exportedMessageAudioBase64?: (string | null)[]; 
}

export enum HarmCategory {
  HARM_CATEGORY_UNSPECIFIED = "HARM_CATEGORY_UNSPECIFIED",
  HARM_CATEGORY_HARASSMENT = "HARM_CATEGORY_HARASSMENT",
  HARM_CATEGORY_HATE_SPEECH = "HARM_CATEGORY_HATE_SPEECH",
  HARM_CATEGORY_SEXUALLY_EXPLICIT = "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  HARM_CATEGORY_DANGEROUS_CONTENT = "HARM_CATEGORY_DANGEROUS_CONTENT",
}

export enum HarmBlockThreshold {
  HARM_BLOCK_THRESHOLD_UNSPECIFIED = "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
  BLOCK_LOW_AND_ABOVE = "BLOCK_LOW_AND_ABOVE", 
  BLOCK_MEDIUM_AND_ABOVE = "BLOCK_MEDIUM_AND_ABOVE", 
  BLOCK_ONLY_HIGH = "BLOCK_ONLY_HIGH", 
  BLOCK_NONE = "BLOCK_NONE", 
}

export interface SafetySetting {
  category: HarmCategory;
  threshold: HarmBlockThreshold;
}

export type TTSModelId = 'gemini-2.5-flash-preview-tts' | 'gemini-2.5-pro-preview-tts';
export type TTSVoiceId = string;

export interface TTSSettings {
  model: TTSModelId;
  voice: TTSVoiceId;
  autoPlayNewMessages?: boolean;
  systemInstruction?: string; 
  maxWordsPerSegment?: number;
}

export interface ApiKey {
  id: string;
  name: string;
  value: string;
}

export interface GeminiSettings {
  systemInstruction?: string;
  userPersonaInstruction?: string; 
  temperature?: number;
  topP?: number;
  topK?: number;
  safetySettings?: SafetySetting[];
  contextWindowMessages?: number; 
  aiSeesTimestamps?: boolean; 
  useGoogleSearch?: boolean; 
  urlContext?: string[]; 
  maxInitialMessagesDisplayed?: number; 
  debugApiRequests?: boolean; 
  ttsSettings: TTSSettings; 
  showAutoSendControls?: boolean; 
  showReadModeButton?: boolean; 
  thinkingBudget?: number;
  _characterIdForCacheKey?: string; 
  _characterIdForAPICall?: string;  
  _characterNameForLog?: string; 
}

export interface AICharacter {
  id: string;
  name: string;
  systemInstruction: string; 
  contextualInfo?: string; 
}

export enum AppMode {
  NORMAL_CHAT = 'normal_chat',
  CHARACTER_CHAT = 'character_chat',
}

export interface GeminiHistoryEntry {
  role: "user" | "model";
  parts: GeminiPart[]; 
}

export interface LoggedGeminiGenerationConfig {
  systemInstruction?: string | Content; 
  temperature?: number;
  topP?: number;
  topK?: number;
  safetySettings?: GeminiSafetySettingSDK[]; 
  tools?: Tool[]; 
  thinkingConfig?: { thinkingBudget?: number }; 
  responseMimeType?: string;
  seed?: number;
}

export interface ApiRequestPayload {
  model?: string; 
  history?: GeminiHistoryEntry[];
  contents?: Content[] | GeminiPart[] | string;
  config?: Partial<LoggedGeminiGenerationConfig>;
  file?: { name: string, type: string, size: number, data?: string };
  fileName?: string;
  fileApiResponse?: any;
  apiKeyUsed?: string;
}

export interface ApiRequestLog {
  id: string;
  timestamp: Date;
  requestType: 'chat.create' | 'chat.sendMessage' | 'models.generateContent' | 'files.uploadFile' | 'files.getFile' | 'files.delete' | 'tts.generateSpeech'; 
  payload: ApiRequestPayload; 
  characterName?: string;
  apiSessionId?: string; 
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  model: string; 
  settings: GeminiSettings; 
  lastUpdatedAt: Date;
  isCharacterModeActive?: boolean; 
  aiCharacters?: AICharacter[];    
  apiRequestLogs?: ApiRequestLog[];
  githubRepoContext?: {
    url: string;
    contextText: string;
  } | null;
}

export interface UserDefinedDefaults {
    model: string;
    settings: GeminiSettings; 
}

export interface FileUploadResult {
    fileUri?: string; 
    fileApiName?: string; 
    mimeType: string;
    originalFileName: string;
    size: number;
    error?: string; 
}

export interface FullResponseData {
    text: string;
    groundingMetadata?: { groundingChunks?: GroundingChunk[] };
}

export interface UserMessageInput {
    text: string;
    attachments?: Attachment[]; 
}

export type LogApiRequestCallback = (logDetails: Omit<ApiRequestLog, 'id' | 'timestamp'>) => void;

export interface AudioPlayerState {
  isLoading: boolean; 
  isPlaying: boolean;
  currentMessageId: string | null; 
  error: string | null; 
  currentTime?: number; 
  duration?: number;    
  currentPlayingText?: string | null; 
  playbackRate: number; 
}

export interface UseGeminiReturn {
  isLoading: boolean;
  currentGenerationTimeDisplay: string;
  lastMessageHadAttachments: boolean;
  logApiRequest: LogApiRequestCallback;
  handleSendMessage: (
    promptContent: string,
    attachments?: Attachment[],
    historyContextOverride?: ChatMessage[],
    characterIdForAPICall?: string,
    isTemporaryContext?: boolean
  ) => Promise<void>;
  handleContinueFlow: () => Promise<void>;
  handleCancelGeneration: () => Promise<void>;
  handleRegenerateAIMessage: (sessionId: string, aiMessageIdToRegenerate: string) => Promise<void>;
  handleRegenerateResponseForUserMessage: (sessionId: string, userMessageId: string) => Promise<void>;
  handleEditPanelSubmit: (action: EditMessagePanelAction, newContent: string, editingMessageDetail: EditMessagePanelDetails) => Promise<void>;
}

export interface GeminiFileResource {
    name: string; 
    displayName?: string;
    mimeType: string;
    sizeBytes?: string; 
    createTime?: string; 
    updateTime?: string; 
    expirationTime?: string; 
    sha256Hash?: string;
    uri: string; 
    state: 'PROCESSING' | 'ACTIVE' | 'FAILED' | 'STATE_UNSPECIFIED';
    error?: { code: number; message: string; details: any[] }; 
}

export type UseAudioPlayerCacheCallback = (uniqueSegmentId: string, audioBuffer: ArrayBuffer) => Promise<void>;

export interface MessageItemProps {
  message: ChatMessage;
  canRegenerateFollowingAI?: boolean;
  chatScrollContainerRef?: React.RefObject<HTMLDivElement>;
  highlightTerm?: string;
  onEnterReadMode: (content: string) => void;
  isContentExpanded?: boolean;
  isThoughtsExpanded?: boolean;
  onToggleExpansion: (messageId: string, type: 'content' | 'thoughts') => void;
}

export interface UseAudioPlayerOptions {
  apiKey: string;
  logApiRequest?: LogApiRequestCallback;
  onCacheAudio?: UseAudioPlayerCacheCallback;
  onAutoplayNextSegment?: (baseMessageId: string, justFinishedPartIndex: number) => void;
  onFetchStart?: (uniqueSegmentId: string) => void;
  onFetchEnd?: (uniqueSegmentId: string, error?: Error) => void;
}
export interface UseAudioPlayerReturn {
  audioPlayerState: AudioPlayerState;
  playText: (
    textSegment: string,
    uniqueSegmentId: string,
    ttsSettings: TTSSettings,
    cachedBufferForSegment?: ArrayBuffer | null
  ) => Promise<void>;
  stopPlayback: () => void; 
  clearPlayerViewAndStopAudio: () => void; 
  seekRelative: (offsetSeconds: number) => Promise<void>;
  seekToAbsolute: (timeInSeconds: number) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  pausePlayback: () => void;
  resumePlayback: () => Promise<void>;
  cancelCurrentSegmentAudioLoad: (uniqueSegmentId: string) => void;
  isApiFetchingThisSegment: (uniqueSegmentId: string) => boolean;
  getSegmentFetchError: (uniqueSegmentId: string) => string | undefined; 
  increaseSpeed: () => void; 
  decreaseSpeed: () => void; 
}

export interface UseAutoPlayOptions {
    currentChatSession: ChatSession | null;
    playFunction: (originalFullText: string, baseMessageId: string, partIndexToPlay?: number) => Promise<void>;
}

export interface ExportConfiguration {
  includeChatSessionsAndMessages: boolean;
  includeMessageContent: boolean;
  includeMessageTimestamps: boolean;
  includeMessageRoleAndCharacterNames: boolean;
  includeMessageAttachmentsMetadata: boolean; 
  includeFullAttachmentFileData: boolean;    
  includeCachedMessageAudio: boolean;       
  includeGroundingMetadata: boolean;
  includeChatSpecificSettings: boolean; 
  includeAiCharacterDefinitions: boolean; 
  includeApiLogs: boolean;
  includeLastActiveChatId: boolean;
  includeMessageGenerationTimes: boolean;
  includeUiConfiguration: boolean; 
  includeUserDefinedGlobalDefaults: boolean;
  includeApiKeys: boolean;
}

export interface ExportConfigurationModalProps {
  isOpen: boolean;
  currentConfig: ExportConfiguration;
  allChatSessions: ChatSession[]; 
  onClose: () => void;
  onSaveConfig: (newConfig: ExportConfiguration) => void; 
  onExportSelected: (config: ExportConfiguration, selectedChatIds: string[]) => void; 
}

export interface AttachmentWithContext {
  attachment: Attachment;
  messageId: string;
  messageTimestamp: Date;
  messageRole: ChatMessageRole;
  messageContentSnippet?: string;
}

export interface UseAutoSendReturn {
  isAutoSendingActive: boolean;
  autoSendText: string;
  setAutoSendText: React.Dispatch<React.SetStateAction<string>>;
  autoSendRepetitionsInput: string;
  setAutoSendRepetitionsInput: React.Dispatch<React.SetStateAction<string>>;
  autoSendRemaining: number;
  startAutoSend: (text: string, repetitions: number, targetCharacterId?: string) => void;
  stopAutoSend: () => Promise<void>;
  canStartAutoSend: (text: string, repetitionsInput: string) => boolean;
  isPreparingAutoSend: boolean;
  isWaitingForErrorRetry: boolean; 
  errorRetryCountdown: number;
}
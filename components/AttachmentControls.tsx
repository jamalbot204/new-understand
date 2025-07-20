import React, { memo, useRef } from 'react';
import { useAttachmentStore } from '../store/useAttachmentStore';
import { PaperClipIcon, XCircleIcon, DocumentIcon, PlayCircleIcon, CloudArrowUpIcon, ServerIcon } from './Icons';
import { useActiveChatStore } from '../store/useActiveChatStore';
import { useAutoSendStore } from '../store/useAutoSendStore';
import { useSelectionStore } from '../store/useSelectionStore';

interface AttachmentControlsProps {
    renderButtonOnly?: boolean;
    isInfoInputModeActive?: boolean;
}

const AttachmentControls = ({ renderButtonOnly = false, isInfoInputModeActive = false }: AttachmentControlsProps) => {
    const {
        selectedFiles,
        handleFileSelection,
        handlePaste,
        removeSelectedFile,
        getFileProgressDisplay,
        getDisplayFileType,
    } = useAttachmentStore();
    const { currentChatSession } = useActiveChatStore();
    const { isAutoSendingActive } = useAutoSendStore();
    const { isSelectionModeActive } = useSelectionStore();

    const fileInputRef = useRef<HTMLInputElement>(null);

    const onFileSelect = (files: FileList | null) => {
        handleFileSelection(files, isInfoInputModeActive);
    };

    const onPaste = (event: React.ClipboardEvent) => {
        handlePaste(event as React.ClipboardEvent<HTMLTextAreaElement>, isInfoInputModeActive);
    };

    if (renderButtonOnly) {
        return (
            <div onPaste={onPaste}>
                <input type="file" multiple ref={fileInputRef} onChange={(e) => onFileSelect(e.target.files)} className="hidden" accept="image/*,video/*,.pdf,text/*,application/json" />
                <button onClick={() => fileInputRef.current?.click()} disabled={!currentChatSession || isInfoInputModeActive || isAutoSendingActive || isSelectionModeActive} className="p-2.5 sm:p-3 m-1 text-gray-300 hover:text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-shadow hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)] focus:outline-none" title="Attach files" aria-label="Attach files">
                    <PaperClipIcon className="w-5 h-5" />
                </button>
            </div>
        );
    }

    return (
        <>
            {selectedFiles.length > 0 && (
                <div className="p-2 sm:p-3 border-t border-[var(--aurora-border)] bg-transparent">
                    <div className="flex flex-wrap gap-3">
                        {selectedFiles.map(file => (
                            <div key={file.id} className="relative group p-2.5 aurora-panel rounded-lg shadow flex items-center w-full sm:w-auto sm:max-w-xs md:max-w-sm lg:max-w-md" style={{ minWidth: '200px' }}>
                                <div className="flex-shrink-0 w-10 h-10 bg-black/20 rounded-full flex items-center justify-center overflow-hidden mr-3">
                                    {(file.uploadState === 'reading_client' || (file.uploadState === 'uploading_to_cloud' && !file.progress) || file.uploadState === 'processing_on_server') && file.isLoading && !(file.dataUrl && (file.type === 'image' || file.type === 'video')) ? (
                                        file.uploadState === 'uploading_to_cloud' ? <CloudArrowUpIcon className="w-5 h-5 text-blue-400 animate-pulse" /> :
                                        file.uploadState === 'processing_on_server' ? <ServerIcon className="w-5 h-5 text-blue-400 animate-pulse" /> :
                                        <DocumentIcon className="w-5 h-5 text-gray-400 animate-pulse" />
                                    ) : (file.uploadState === 'error_client_read' || file.uploadState === 'error_cloud_upload') && file.error ? (
                                        <DocumentIcon className="w-6 h-6 text-red-400" />
                                    ) : file.dataUrl && file.mimeType.startsWith('image/') && file.type === 'image' ? (
                                        <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                                    ) : file.dataUrl && file.mimeType.startsWith('video/') && file.type === 'video' ? (
                                        <PlayCircleIcon className="w-6 h-6 text-gray-300" />
                                    ) : (
                                        <DocumentIcon className="w-6 h-6 text-gray-300" />
                                    )}
                                </div>
                                <div className="flex-grow flex flex-col min-w-0 mr-2">
                                    <p className="text-sm font-medium text-gray-200 truncate" title={file.name}>{getDisplayFileType(file)}</p>
                                    <p className="text-xs text-gray-400 truncate" title={file.statusMessage || getFileProgressDisplay(file)}>{getFileProgressDisplay(file)}</p>
                                    {(file.uploadState === 'uploading_to_cloud' && file.progress !== undefined && file.progress > 0) && (
                                        <div className="w-full bg-black/20 rounded-full h-1 mt-1">
                                            <div className="bg-blue-500 h-1 rounded-full transition-all duration-150 ease-linear" style={{ width: `${file.progress || 0}%` }}></div>
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => removeSelectedFile(file.id)} className="absolute -top-1 -right-1 p-0.5 bg-[var(--aurora-border)] text-gray-300 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-500" title="Remove file">
                                    <XCircleIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
};

export default memo(AttachmentControls);

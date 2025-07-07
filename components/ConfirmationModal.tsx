import React, { memo } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useChatActions } from '../contexts/ChatContext.tsx';
import { useApiKeyContext } from '../contexts/ApiKeyContext.tsx';
import { CloseIcon } from './Icons.tsx';

interface ConfirmationModalProps {
  type: 'deleteMessage' | 'resetAudio';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = memo(({ type }) => {
  // Select all necessary state and actions from the Zustand store
  const {
    isDeleteConfirmationOpen,
    isResetAudioConfirmationOpen,
    deleteTarget,
    resetAudioTarget,
    cancelDeleteConfirmation,
    cancelResetAudioCacheConfirmation,
    showToast,
  } = useUIStore(state => ({
    isDeleteConfirmationOpen: state.isDeleteConfirmationOpen,
    isResetAudioConfirmationOpen: state.isResetAudioConfirmationOpen,
    deleteTarget: state.deleteTarget,
    resetAudioTarget: state.resetAudioTarget,
    cancelDeleteConfirmation: state.cancelDeleteConfirmation,
    cancelResetAudioCacheConfirmation: state.cancelResetAudioCacheConfirmation,
    showToast: state.showToast,
  }));

  const { handleDeleteMessageAndSubsequent, performActualAudioCacheReset } = useChatActions();
  const { deleteApiKey } = useApiKeyContext();

  // Determine visibility and actions based on the 'type' prop
  const isOpen = type === 'deleteMessage' ? isDeleteConfirmationOpen : isResetAudioConfirmationOpen;
  const onCancel = type === 'deleteMessage' ? cancelDeleteConfirmation : cancelResetAudioCacheConfirmation;

  const onConfirm = () => {
    if (type === 'deleteMessage' && deleteTarget) {
      if (deleteTarget.messageId === 'api-key') {
        deleteApiKey(deleteTarget.sessionId);
        showToast("API Key deleted.", "success");
      } else {
        handleDeleteMessageAndSubsequent(deleteTarget.sessionId, deleteTarget.messageId);
        showToast("Message and history deleted.", "success");
      }
      cancelDeleteConfirmation();
    } else if (type === 'resetAudio' && resetAudioTarget) {
      performActualAudioCacheReset(resetAudioTarget.sessionId, resetAudioTarget.messageId);
      // The toast for this action is shown in performActualAudioCacheReset
      cancelResetAudioCacheConfirmation();
    }
  };

  if (!isOpen) {
    return null;
  }

  // Determine modal content based on the 'type' prop
  const title = type === 'deleteMessage' ? 'Confirm Deletion' : 'Confirm Audio Reset';
  const confirmText = type === 'deleteMessage' ? 'Yes, Delete' : 'Yes, Reset Audio';
  const message = type === 'deleteMessage'
    ? (deleteTarget?.messageId === 'api-key'
        ? 'Are you sure you want to permanently delete this API key?'
        : <>Are you sure you want to delete this message and all <strong className="text-red-400">subsequent messages</strong> in this chat? <br/>This action cannot be undone.</>)
    : 'Are you sure you want to reset the audio cache for this message? This action cannot be undone.';

  const confirmButtonBaseClass = "px-4 py-2.5 text-sm font-medium rounded-md transition-shadow flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black";
  const confirmButtonClass = `${confirmButtonBaseClass} text-white bg-red-600/80 focus:ring-red-500 hover:shadow-[0_0_12px_2px_rgba(239,68,68,0.6)]`;
  const cancelButtonClass = `${confirmButtonBaseClass} text-gray-300 bg-white/5 focus:ring-gray-500 hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]`;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
      onClick={onCancel}
    >
      <div className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col text-gray-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 id="confirmation-modal-title" className="text-xl font-semibold text-gray-100">{title}</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 p-1 rounded-full transition-shadow hover:text-gray-100 hover:shadow-[0_0_10px_1px_rgba(255,255,255,0.2)]"
            aria-label="Close confirmation"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="text-sm text-gray-300 mb-6 whitespace-pre-line">{message}</div>
        <div className="mt-auto flex justify-end space-x-3">
          <button onClick={onCancel} type="button" className={cancelButtonClass}>Cancel</button>
          <button onClick={onConfirm} type="button" className={confirmButtonClass}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
});

export default ConfirmationModal;
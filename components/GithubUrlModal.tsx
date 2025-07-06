// components/GithubUrlModal.tsx
    import React, { useState, useCallback, memo } from 'react';
    import { CloseIcon, GitHubIcon } from './Icons.tsx';

    interface GithubUrlModalProps {
      isOpen: boolean;
      onClose: () => void;
      onSubmit: (url: string) => void;
    }

    const GithubUrlModal: React.FC<GithubUrlModalProps> = memo(({ isOpen, onClose, onSubmit }) => {
      const [url, setUrl] = useState('');

      const handleSubmit = useCallback(() => {
        if (url.trim()) {
          onSubmit(url.trim());
        }
      }, [url, onSubmit]);

      if (!isOpen) return null;

      return (
        <div 
            className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-md"
            onClick={onClose}
        >
          <div 
            className="aurora-panel p-6 rounded-lg shadow-2xl w-full sm:max-w-md text-gray-200" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-100 flex items-center">
                <GitHubIcon className="w-5 h-5 mr-2" />
                Import from GitHub
              </h2>
              <button onClick={onClose} className="p-1 text-gray-400 rounded-full hover:text-gray-100">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-3">
              Enter the full URL of a public GitHub repository.
            </p>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="w-full p-2.5 aurora-input mb-6"
            />
            <div className="flex justify-end space-x-3">
              <button onClick={onClose} type="button" className="px-4 py-2 text-sm text-gray-300 bg-white/5 rounded-md">
                Cancel
              </button>
              <button onClick={handleSubmit} type="submit" className="px-4 py-2 text-sm text-white bg-[var(--aurora-accent-primary)] rounded-md">
                Import
              </button>
            </div>
          </div>
        </div>
      );
    });

    export default GithubUrlModal;
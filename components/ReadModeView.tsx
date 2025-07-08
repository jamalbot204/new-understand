import React, { useEffect, memo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CloseIcon } from './Icons.tsx';
import AdvancedAudioPlayer from './AdvancedAudioPlayer.tsx';
import { useAudioContext } from '../contexts/AudioContext.tsx';
import { useSessionStore } from '../stores/sessionStore.ts';

// Import and register only the necessary languages
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';

SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('jsx', jsx);

interface ReadModeViewProps {
  isOpen: boolean;
  content: string;
  onClose: () => void;
  onGoToMessage?: () => void;
}

// Re-using the CodeBlock component logic for consistent styling
const CodeBlock: React.FC<React.PropsWithChildren<{ inline?: boolean; className?: string }>> = memo(({
  inline,
  className,
  children,
}) => {
  const codeString = String(children).replace(/\n$/, '');
  const match = /language-([\w.-]+)/.exec(className || '');
  const lang = match ? match[1] : '';

  if (inline) {
    return (
      <code className="bg-black/30 text-indigo-300 rounded px-1 py-0.5 font-mono text-sm border border-white/10">
        {children}
      </code>
    );
  }

  return (
    <div className="relative my-2 rounded-md overflow-hidden border border-white/10 bg-[#0A0910]">
      <div className="flex justify-between items-center px-4 py-1.5 bg-black/20">
        <span className="text-xs text-gray-300 font-mono">{lang || 'code'}</span>
      </div>
      {lang ? (
        <SyntaxHighlighter
          style={atomDark}
          language={lang}
          PreTag="div"
          customStyle={{ margin: 0, padding: '1rem', fontSize: '0.9em', backgroundColor: 'transparent' }}
        >
          {codeString}
        </SyntaxHighlighter>
      ) : (
        <pre className="bg-transparent text-gray-200 p-4 text-sm font-mono overflow-x-auto m-0">
          <code>{codeString}</code>
        </pre>
      )}
    </div>
  );
});

const ReadModeView: React.FC<ReadModeViewProps> = memo(({ isOpen, content, onClose, onGoToMessage }) => {
  const audio = useAudioContext();
  const currentChatSession = useSessionStore(state => state.chatHistory.find(s => s.id === state.currentChatId));

  const handleGoToMessageFromReadMode = useCallback(() => {
    if (onGoToMessage) {
      onClose(); // Close the modal
      // Add a small delay to ensure the modal is gone before scrolling
      setTimeout(() => onGoToMessage(), 100); 
    }
  }, [onGoToMessage, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const isAudioBarVisible = !!(audio.audioPlayerState.currentMessageId || audio.audioPlayerState.isLoading || audio.audioPlayerState.isPlaying || audio.audioPlayerState.currentPlayingText);
  
  const getFullTextForAudioBar = () => {
    if (!audio.audioPlayerState.currentMessageId || !currentChatSession) return audio.audioPlayerState.currentPlayingText || "Playing audio...";
    const baseId = audio.audioPlayerState.currentMessageId.split('_part_')[0];
    const message = currentChatSession.messages.find(m => m.id === baseId);
    return message ? message.content : (audio.audioPlayerState.currentPlayingText || "Playing audio...");
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 flex flex-col p-4 sm:p-8 md:p-12 pt-24"
      onClick={onClose} // Close on clicking the background
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={(e) => {
          e.stopPropagation(); // Prevent background click when clicking the button
          onClose();
        }}
        className="absolute top-4 right-4 text-gray-400 p-2 rounded-full z-10 transition-shadow hover:text-white hover:shadow-[0_0_12px_2px_rgba(255,255,255,0.2)]"
        aria-label="Close Read Mode"
      >
        <CloseIcon className="w-7 h-7" />
      </button>

      {isAudioBarVisible && (
        <div 
            className="flex-shrink-0 w-full max-w-4xl mx-auto pb-4"
            onClick={(e) => e.stopPropagation()} // Stop click from bubbling to the background
        >
          <AdvancedAudioPlayer
            audioPlayerState={audio.audioPlayerState}
            onCloseView={audio.handleClosePlayerViewOnly}
            onSeekRelative={audio.seekRelative}
            onSeekToAbsolute={audio.seekToAbsolute}
            onTogglePlayPause={audio.togglePlayPause}
            currentMessageText={getFullTextForAudioBar()}
            onGoToMessage={handleGoToMessageFromReadMode}
            onIncreaseSpeed={audio.increaseSpeed}
            onDecreaseSpeed={audio.decreaseSpeed}
          />
        </div>
      )}

      <div
        className="flex-grow w-full max-w-4xl mx-auto overflow-y-auto hide-scrollbar"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the content area
      >
        <div className="aurora-panel p-6 sm:p-8 rounded-lg markdown-content">
             <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock, p: 'div' }}>
                {content}
            </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});

export default ReadModeView;
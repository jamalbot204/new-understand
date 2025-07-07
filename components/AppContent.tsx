import React, { useRef, useCallback, useState, memo, lazy, Suspense } from 'react';
import { useChatState } from '../contexts/ChatContext.tsx';
import { useUIStore } from '../stores/uiStore';
import { useAudioContext } from '../contexts/AudioContext.tsx';

const Sidebar = lazy(() => import('./Sidebar.tsx'));
const ChatView = lazy(() => import('./ChatView.tsx'));
const ReadModeView = lazy(() => import('./ReadModeView.tsx'));
const ToastNotification = lazy(() => import('./ToastNotification.tsx'));
const AdvancedAudioPlayer = lazy(() => import('./AdvancedAudioPlayer.tsx'));
const MultiSelectActionBar = lazy(() => import('./MultiSelectActionBar.tsx'));
const ModalManager = lazy(() => import('./ModalManager.tsx'));

const AppContent: React.FC = memo(() => {
  const { isLoadingData, currentChatSession } = useChatState();
  const { isSidebarOpen, closeSidebar, isSelectionModeActive, toastInfo, setToastInfo } = useUIStore(state => ({
    isSidebarOpen: state.isSidebarOpen,
    closeSidebar: state.closeSidebar,
    isSelectionModeActive: state.isSelectionModeActive,
    toastInfo: state.toastInfo,
    setToastInfo: state.setToastInfo,
  }));
  const audio = useAudioContext();
  const chatViewRef = useRef<any>(null);

  const [isReadModeOpen, setIsReadModeOpen] = useState(false);
  const [readModeContent, setReadModeContent] = useState('');

  const handleEnterReadMode = useCallback((content: string) => {
    setReadModeContent(content);
    setIsReadModeOpen(true);
  }, []);

  const handleCloseReadMode = useCallback(() => {
    setIsReadModeOpen(false);
    setReadModeContent('');
  }, []);

  const handleGoToMessage = useCallback(() => {
    if (audio.audioPlayerState.currentMessageId && chatViewRef.current) {
      const baseMessageId = audio.audioPlayerState.currentMessageId.split('_part_')[0];
      chatViewRef.current.scrollToMessage(baseMessageId);
    }
  }, [audio.audioPlayerState.currentMessageId]);

  const getFullTextForAudioBar = useCallback(() => {
    if (!audio.audioPlayerState.currentMessageId || !currentChatSession) return audio.audioPlayerState.currentPlayingText || "Playing audio...";
    const baseId = audio.audioPlayerState.currentMessageId.split('_part_')[0];
    const message = currentChatSession.messages.find(m => m.id === baseId);
    return message ? message.content : (audio.audioPlayerState.currentPlayingText || "Playing audio...");
  }, [audio.audioPlayerState, currentChatSession]);

  const isAudioBarVisible = !!(audio.audioPlayerState.currentMessageId || audio.audioPlayerState.isLoading || audio.audioPlayerState.isPlaying || audio.audioPlayerState.currentPlayingText) && !isReadModeOpen;
  
  if (isLoadingData) {
    return <div className="flex justify-center items-center h-screen bg-transparent text-white text-lg">Loading Chat Sessions...</div>;
  }

  return (
    <div className="flex h-screen antialiased text-[var(--aurora-text-primary)] bg-transparent overflow-hidden">
      <Suspense fallback={<div>Loading UI...</div>}>
        <div className={`fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-72`}>
          <Sidebar />
        </div>

        {isSidebarOpen && <div className="fixed inset-0 z-20 bg-black bg-opacity-50 md:hidden" onClick={closeSidebar} aria-hidden="true" />}
        
        <main className={`relative z-10 flex-1 flex flex-col overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:ml-72' : 'ml-0'} ${isAudioBarVisible ? 'pt-[76px]' : ''}`}>
          <ChatView ref={chatViewRef} onEnterReadMode={handleEnterReadMode} />
        </main>
        
        <div className='absolute'>
          {isAudioBarVisible && (
              <div className={`fixed top-0 left-0 right-0 z-30 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:left-72' : 'left-0'}`}>
                <AdvancedAudioPlayer
                  audioPlayerState={audio.audioPlayerState}
                  onCloseView={audio.handleClosePlayerViewOnly} 
                  onSeekRelative={audio.seekRelative}
                  onSeekToAbsolute={audio.seekToAbsolute}
                  onTogglePlayPause={audio.togglePlayPause}
                  currentMessageText={getFullTextForAudioBar()}
                  onGoToMessage={handleGoToMessage}
                  onIncreaseSpeed={audio.increaseSpeed} 
                  onDecreaseSpeed={audio.decreaseSpeed} 
                />
              </div>
          )}

          <ReadModeView isOpen={isReadModeOpen} content={readModeContent} onClose={handleCloseReadMode} onGoToMessage={handleGoToMessage} />
          
          <ModalManager />

          {isSelectionModeActive && <MultiSelectActionBar />}
          
          {toastInfo && <ToastNotification message={toastInfo.message} type={toastInfo.type} onClose={() => setToastInfo(null)} duration={toastInfo.duration} />}
        </div>
      </Suspense>
    </div>
  );
});

export default AppContent;
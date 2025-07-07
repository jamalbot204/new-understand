import React, { memo, Suspense, lazy } from 'react';
import { ChatProvider } from './contexts/ChatContext.tsx';
import { AudioProvider } from './contexts/AudioContext.tsx';
import { ApiKeyProvider } from './contexts/ApiKeyContext.tsx';

const AppContent = lazy(() => import('./components/AppContent.tsx'));

const App: React.FC = memo(() => {
  return (
    <ApiKeyProvider>
      <ChatProvider>
        <AudioProvider>
          <Suspense fallback={<div className="flex justify-center items-center h-screen bg-transparent text-white text-lg">Loading App...</div>}>
            <AppContent />
          </Suspense>
        </AudioProvider>
      </ChatProvider>
    </ApiKeyProvider>
  );
});

export default App;
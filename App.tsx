import React, { memo, Suspense, lazy } from 'react';
import { UIProvider } from './contexts/UIContext.tsx';
import { ChatProvider } from './contexts/ChatContext.tsx';
import { AudioProvider } from './contexts/AudioContext.tsx';
import { ApiKeyProvider } from './contexts/ApiKeyContext.tsx';

const AppContent = lazy(() => import('./components/AppContent.tsx'));

const App: React.FC = memo(() => {
  return (
    <ApiKeyProvider>
      <UIProvider>
        <ChatProvider>
          <AudioProvider>
            <Suspense fallback={<div>Loading...</div>}>
              <AppContent />
            </Suspense>
          </AudioProvider>
        </ChatProvider>
      </UIProvider>
    </ApiKeyProvider>
  );
});

export default App;
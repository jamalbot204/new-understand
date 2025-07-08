import React, { memo, Suspense, lazy } from 'react';
// The UIProvider is no longer needed and has been removed.
import { ChatProvider } from './contexts/ChatContext.tsx';
import { AudioProvider } from './contexts/AudioContext.tsx';
// The ApiKeyProvider is no longer needed and has been removed.

const AppContent = lazy(() => import('./components/AppContent.tsx'));

const App: React.FC = memo(() => {
  return (
    <ChatProvider>
      <AudioProvider>
        <Suspense fallback={<div>Loading...</div>}>
          <AppContent />
        </Suspense>
      </AudioProvider>
    </ChatProvider>
  );
});

export default App;
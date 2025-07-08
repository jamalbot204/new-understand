import React, { memo } from 'react';
import { useUIStore } from './stores/uiStore.ts'; 
import { AudioProvider } from './contexts/AudioContext.tsx';
import AppContent from './components/AppContent.tsx';


const App: React.FC = memo(() => {
  
  React.useEffect(() => {
    // Initialize stores that need to load data from DB.
    // This is a good place to trigger initial loads.
    useUIStore.getState().actions.initializeLayout();
  }, []);

  return (
    <AudioProvider>
      <AppContent />
    </AudioProvider>
  );
});

export default App;
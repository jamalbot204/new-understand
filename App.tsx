

import React, { memo } from 'react';
import AppContent from './components/AppContent.tsx';
import { AudioStoreBridge } from './components/AudioStoreBridge.tsx';
import { DataStoreBridge } from './components/DataStoreBridge.tsx';
import { AttachmentStoreBridge } from './components/AttachmentStoreBridge.tsx';
import { DummyAudio } from './components/DummyAudio.tsx';

const App: React.FC = memo(() => {
  return (
    <>
      <AudioStoreBridge />
      <DataStoreBridge />
      <AttachmentStoreBridge />
      <DummyAudio />
      <AppContent />
    </>
  );
});

export default App;
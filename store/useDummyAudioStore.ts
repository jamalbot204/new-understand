import { create } from 'zustand';

interface DummyAudioState {
  play: () => void;
  pause: () => void;
}

interface DummyAudioActions {
  setControls: (controls: { play: () => void; pause: () => void; }) => void;
}

export const useDummyAudioStore = create<DummyAudioState & DummyAudioActions>((set) => ({
  // Initial dummy functions to prevent errors before initialization.
  play: () => console.warn("Dummy audio 'play' control not yet initialized."),
  pause: () => console.warn("Dummy audio 'pause' control not yet initialized."),

  setControls: (controls) => {
    set({ play: controls.play, pause: controls.pause });
  },
}));

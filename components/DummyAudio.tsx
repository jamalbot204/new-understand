import React, { useRef, useEffect } from 'react';
import { useDummyAudioStore } from '../store/useDummyAudioStore';

// A tiny, silent WAV file encoded in base64. This is used to give the <audio> element a valid source.
const SILENT_AUDIO_SRC = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export const DummyAudio: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const setControls = useDummyAudioStore((state) => state.setControls);

  useEffect(() => {
    if (audioRef.current) {
      // The component provides its play/pause methods to the global store
      // so that other parts of the app can control it without direct coupling.
      const controls = {
        play: () => audioRef.current?.play().catch(e => {
          // Autoplay restrictions can sometimes cause this to fail.
          // We log it as a warning because the primary audio will still work.
          console.warn("Dummy audio play() command failed. This can happen due to browser autoplay policies.", e);
        }),
        pause: () => audioRef.current?.pause(),
      };
      setControls(controls);
    }
  }, [setControls]);

  return (
    <audio
      ref={audioRef}
      src={SILENT_AUDIO_SRC}
      loop
      style={{ display: 'none' }}
      aria-hidden="true"
    />
  );
};

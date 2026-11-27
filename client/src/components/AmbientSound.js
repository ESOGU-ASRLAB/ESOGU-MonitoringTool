import { useEffect, useRef } from 'react';

const TRACKS = [
  `${process.env.PUBLIC_URL}/assets/audio/car-engine.ogg`,
  `${process.env.PUBLIC_URL}/assets/audio/robot-arm.ogg`,
];
const VOLUME = 0.08;
const DUCKED_VOLUME = 0.03;

export default function AmbientSound({ play = true, ducked = false }) {
  const audioRefs = useRef([]);
  const volumeRef = useRef(VOLUME);
  volumeRef.current = ducked ? DUCKED_VOLUME : VOLUME;

  useEffect(() => {
    if (!play) return undefined;
    const audios = audioRefs.current.filter(Boolean);
    const tryPlay = () => audios.forEach((audio) => {
      audio.volume = volumeRef.current;
      const result = audio.play();
      result?.catch((error) => {
        if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') {
          console.error('Background ambience playback failed:', error);
        }
      });
    });
    tryPlay();
    const events = ['pointerdown', 'keydown', 'touchstart'];
    const onGesture = () => {
      tryPlay();
      events.forEach((event) => window.removeEventListener(event, onGesture));
    };
    events.forEach((event) => window.addEventListener(event, onGesture));

    return () => {
      events.forEach((event) => window.removeEventListener(event, onGesture));
      audios.forEach((audio) => audio.pause());
    };
  }, [play]);

  useEffect(() => {
    const volume = ducked ? DUCKED_VOLUME : VOLUME;
    audioRefs.current.forEach((audio) => {
      if (audio) audio.volume = volume;
    });
  }, [ducked, play]);

  return (
    <>
      {TRACKS.map((src, index) => (
        <audio
          key={src}
          ref={(audio) => { audioRefs.current[index] = audio; }}
          src={src}
          loop
          preload="none"
          aria-hidden="true"
        />
      ))}
    </>
  );
}

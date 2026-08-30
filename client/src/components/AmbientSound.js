import { useEffect, useRef } from 'react';

/*
 * Factory ambience: factory-noise.mp3 plays once, and the instant it ends
 * factory_2.mp3 takes over and loops from then on. Implemented with a single
 * <audio> element whose src is swapped on the 'ended' event, rather than two
 * elements crossfading, since the ask was a straight handoff ("bittiği anda
 * bu devreye girsin"), not an overlap.
 *
 * Browsers block audio autoplay until the page has seen a user gesture, so
 * the initial play() attempt is expected to reject silently on load -- the
 * fallback listener below starts it on the visitor's first click/keypress/
 * touch anywhere on the page instead, which is the standard workaround.
 */
const TRACK_1_URL = process.env.PUBLIC_URL + '/assets/noise/factory-noise.mp3';
const TRACK_2_URL = process.env.PUBLIC_URL + '/assets/noise/factory_2.mp3';
const VOLUME = 0.35;

export default function AmbientSound({ play = true }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !play) return;

    audio.volume = VOLUME;
    audio.src = TRACK_1_URL;
    audio.loop = false; // track 1 plays once; track 2 (below) is the one that loops

    const handOffToTrack2 = () => {
      audio.src = TRACK_2_URL;
      audio.loop = true;
      audio.play().catch(() => {});
    };
    audio.addEventListener('ended', handOffToTrack2);

    const tryPlay = () => audio.play().catch(() => {});
    tryPlay();

    const events = ['pointerdown', 'keydown', 'touchstart'];
    const onGesture = () => {
      tryPlay();
      events.forEach((e) => window.removeEventListener(e, onGesture));
    };
    events.forEach((e) => window.addEventListener(e, onGesture));

    return () => {
      audio.removeEventListener('ended', handOffToTrack2);
      events.forEach((e) => window.removeEventListener(e, onGesture));
      audio.pause();
    };
  }, [play]);

  return <audio ref={audioRef} preload="auto" />;
}

import clips from './narrationClips.json';
import { audioContext, unlockAudio } from '../vrAudio';

const cached = new Map();

function audioAvailable() {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
}

export function hasGuideClips(language) {
  return audioAvailable() && Boolean(clips[language]);
}

export function unlockGuideAudio() {
  if (audioAvailable()) unlockAudio();
}

export function loadGuideClip(language, sentence) {
  const file = clips[language]?.[sentence];
  if (!file || !audioAvailable()) return null;
  if (!cached.has(file)) {
    const promise = fetch(`${process.env.PUBLIC_URL}/assets/audio/guide/${file}`)
      .then((response) => {
        if (!response.ok) throw new Error('Narration clip unavailable');
        return response.arrayBuffer();
      })
      .then((bytes) => audioContext().decodeAudioData(bytes))
      .catch((error) => { cached.delete(file); throw error; });
    cached.set(file, promise);
  }
  return cached.get(file);
}

export function playGuideClip(buffer, rate, onEnd) {
  const context = audioContext();
  if (context.state !== 'running') throw new Error('Audio context is suspended');
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  source.connect(context.destination);
  source.onended = () => {
    source.disconnect();
    onEnd();
  };
  source.start();
  return () => {
    source.onended = null;
    source.stop();
    source.disconnect();
  };
}

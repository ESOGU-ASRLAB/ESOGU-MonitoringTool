import { useEffect, useRef, useState } from 'react';
import { hasGuideClips, loadGuideClip, playGuideClip } from './guideAudio';

export function splitNarration(text) {
  // Sentence-sized utterances avoid the long-utterance cutoff in some speech
  // engines. Do not depend on boundary events, which are not universal.
  return String(text).match(/[^.!?]+(?:[.!?]+|$)/g)?.map((line) => line.trim()).filter(Boolean) || [];
}

export function useNarration({ text, sessionKey, enabled, paused, muted, rate, voiceURI, language = 'en', onEnd, beforeSentence }) {
  const [sentence, setSentence] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState([]);
  const [speechError, setSpeechError] = useState('');
  const [fallback, setFallback] = useState(false);
  const [progress, setProgress] = useState(0);
  const cursor = useRef(0);
  const lines = useRef([]);
  const finished = useRef(onEnd);
  finished.current = onEnd;
  const canSpeak = useRef(beforeSentence);
  canSpeak.current = beforeSentence;
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  useEffect(() => {
    if (!speechSupported) return undefined;
    const synth = window.speechSynthesis;
    const read = () => setVoices(synth.getVoices());
    read();
    synth.addEventListener('voiceschanged', read);
    return () => synth.removeEventListener('voiceschanged', read);
  }, [speechSupported]);

  useEffect(() => {
    lines.current = splitNarration(text);
    cursor.current = 0;
    setSentence(0);
    setProgress(0);
    setFallback(false);
    setSpeechError('');
  }, [text, sessionKey]);

  useEffect(() => {
    if (muted) return;
    // Fetch the opening line while the camera heads to the first view.
    loadGuideClip(language, lines.current[0])?.catch(() => {});
  }, [text, sessionKey, language, muted]);

  useEffect(() => {
    if (!enabled || paused) { setSpeaking(false); return undefined; }
    const synth = speechSupported ? window.speechSynthesis : null;
    let alive = true;
    let timer;
    let watchdog;
    let utterance;
    let stopClip;
    const clear = () => { clearTimeout(timer); clearTimeout(watchdog); };
    const playLine = () => {
      if (!alive) return;
      const index = cursor.current;
      const line = lines.current[index];
      if (!line) { setSpeaking(false); setProgress(1); finished.current(); return; }
      setSentence(index);
      setProgress(index / lines.current.length);
      // Let the camera reach this sentence's subject before submitting any
      // audio, so even the first syllable belongs to the view on screen.
      if (canSpeak.current && !canSpeak.current(index)) { setSpeaking(false); return; }
      const duration = Math.max(2400, line.split(/\s+/).length * 430 / rate);
      let done = false;
      const advance = () => {
        if (!alive || done) return;
        done = true;
        clear();
        cursor.current = index + 1;
        setSpeaking(false);
        timer = setTimeout(playLine, 180);
      };
      if (muted || fallback) {
        setSpeaking(false);
        timer = setTimeout(advance, duration);
        return;
      }
      const speak = () => {
        if (!synth) {
          timer = setTimeout(advance, duration);
          return;
        }
        utterance = new window.SpeechSynthesisUtterance(line);
        utterance.lang = language === 'tr' ? 'tr-TR' : 'en-US';
        const available = synth.getVoices().filter((voice) => voice.lang.toLowerCase().split(/[-_]/)[0] === language);
        utterance.voice = available.find((voice) => voice.voiceURI === voiceURI)
          || available.find((voice) => /natural|neural|enhanced|premium|online/i.test(voice.name))
          || available.find((voice) => voice.lang === utterance.lang) || available[0] || null;
        utterance.rate = rate;
        utterance.onstart = () => {
          if (!alive) return;
          setSpeaking(true);
          clearTimeout(watchdog);
          // A broken speech engine must never strand the automatic tour.
          watchdog = setTimeout(() => {
            if (!alive || done) return;
            done = true;
            synth.cancel();
            setSpeechError(language === 'tr' ? 'Seslendirme yanıt vermedi. Tur altyazıyla devam ediyor.' : 'Audio stopped responding. Continuing with captions.');
            setFallback(true);
          }, Math.max(20000, duration * 3));
      };
      utterance.onend = advance;
      utterance.onerror = (event) => {
        if (!alive || done || event.error === 'canceled' || event.error === 'interrupted') return;
        clear();
        done = true;
        setSpeaking(false);
        setSpeechError(language === 'tr' ? 'Ses bu cihazda başlatılamadı. Tur altyazıyla devam ediyor.' : 'Audio could not start. Continuing with captions.');
        setFallback(true);
      };
      // Some engines emit neither start nor error when audio is blocked.
      watchdog = setTimeout(() => {
        if (!alive || done) return;
        done = true;
        synth.cancel();
        setSpeechError(language === 'tr' ? 'Ses izni veya uygun ses bulunamadı. Tur altyazıyla devam ediyor.' : 'Audio is unavailable. Continuing with captions.');
        setFallback(true);
      }, 6000);
      synth.resume();
      synth.speak(utterance);
      };
      const clip = loadGuideClip(language, line);
      if (!clip) { speak(); return; }
      let waiting = true;
      const fallbackToSpeech = () => {
        if (!alive || !waiting) return;
        waiting = false;
        clearTimeout(watchdog);
        speak();
      };
      watchdog = setTimeout(fallbackToSpeech, 2500);
      clip.then((buffer) => {
        if (!alive || !waiting) return;
        stopClip = playGuideClip(buffer, rate, () => {
          stopClip = null;
          advance();
        });
        waiting = false;
        clearTimeout(watchdog);
        setSpeaking(true);
        const next = lines.current[index + 1];
        if (next) loadGuideClip(language, next)?.catch(() => {});
      }).catch(fallbackToSpeech);
    };
    playLine();
    return () => {
      alive = false;
      clear();
      stopClip?.();
      if (utterance) {
        utterance.onstart = null; utterance.onend = null; utterance.onerror = null;
        synth?.cancel();
      }
    };
  }, [text, sessionKey, enabled, paused, muted, rate, voiceURI, language, speechSupported, fallback]);

  const recorded = hasGuideClips(language);
  return {
    sentence, caption: lines.current[sentence] || '', speaking, voices, supported: speechSupported || recorded, speechError,
    progress, hasLanguageVoice: recorded || voices.some((voice) => voice.lang.toLowerCase().split(/[-_]/)[0] === language),
  };
}

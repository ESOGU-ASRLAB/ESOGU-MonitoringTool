import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { TOPIC_BY_ID, TOPIC_SHOT_PLANS, TOUR_STOPS } from './guideContent';
import { GUIDE_DETAILS } from './guideShots';
import { getGuideTopic } from './guidePresentation';
import { GUIDE_UI, guideShotLabel } from './guideLanguage';
import { useNarration } from './useNarration';
import { useLanguage } from '../../LanguageContext';
import { unlockGuideAudio } from './guideAudio';
import { isMuted, onMuteChange } from '../vrAudio';

const defaults = { muted: false, rate: 1, voiceURI: '' };
const detailFor = (item) => GUIDE_DETAILS[item?.shot] ? item.shot : TOPIC_SHOT_PLANS[item?.id]?.find((entry) => GUIDE_DETAILS[entry.shot])?.shot;
function shotFor(item, sentence, view) {
  const stage = TOPIC_SHOT_PLANS[item?.id]?.filter((entry) => entry.sentence <= sentence).slice(-1)[0];
  let shot = stage?.shot || item?.shot;
  if (view === 'detail' && detailFor(item)) shot = detailFor(item);
  if (view === 'context') shot = GUIDE_DETAILS[shot]?.context || item?.shot;
  return shot;
}
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('asrlab-guide-settings')) || {};
    return {
      muted: typeof saved.muted === 'boolean' ? saved.muted : false,
      rate: [0.85, 1, 1.15, 1.3].includes(saved.rate) ? saved.rate : 1,
      voiceURI: typeof saved.voiceURI === 'string' ? saved.voiceURI : '',
    };
  } catch { return defaults; }
}

export default function useGuideTour({ inVR, prepareScene }) {
  const { language } = useLanguage();
  const headsetMuted = useSyncExternalStore(onMuteChange, isMuted);
  const [session, setSession] = useState(null);
  const [settings, setSettings] = useState(loadSettings);
  const effectiveSettings = useMemo(() => ({ ...settings, language }), [settings, language]);
  const [cameraView, setCameraView] = useState('auto');
  const [cameraReady, setCameraReady] = useState(false);
  const serial = useRef(0);
  const requestedShot = useRef(null);
  const arrivedShot = useRef(null);
  const current = useRef(session);
  current.current = session;
  const prepare = useRef(prepareScene);
  prepare.current = prepareScene;
  const item = getGuideTopic(session?.id, language);
  const ui = GUIDE_UI[language];
  const lastLanguage = useRef(language);

  const go = useCallback((id, mode = 'tour') => {
    if (!TOPIC_BY_ID[id]) return;
    unlockGuideAudio();
    prepare.current();
    serial.current += 1;
    setCameraView('auto');
    setCameraReady(false);
    arrivedShot.current = null;
    setSession({ id, mode, serial: serial.current, phase: 'moving', paused: false });
  }, []);
  const stop = useCallback(() => setSession(null), []);
  const advance = useCallback(() => {
    const active = current.current;
    if (!active) return;
    const next = TOUR_STOPS.indexOf(active.id) + 1;
    if (active.mode === 'tour' && next < TOUR_STOPS.length) go(TOUR_STOPS[next]);
    else setSession((value) => value && { ...value, phase: active.mode === 'tour' ? 'finishing' : 'complete' });
  }, [go]);
  const arrive = useCallback((requestSerial, shot) => {
    if (current.current?.serial !== requestSerial || (shot && shot !== requestedShot.current)) return;
    setCameraReady(true);
    arrivedShot.current = shot || requestedShot.current;
    setSession((value) => value?.serial === requestSerial ? { ...value, phase: value.phase === 'finishing' ? 'complete' : value.phase === 'moving' ? 'narrating' : value.phase } : value);
  }, []);
  const pause = useCallback(() => {
    setSession((value) => value && { ...value, paused: !value.paused });
  }, []);

  // A language change replays this topic, preserving the tour position and
  // pause state. A new serial invalidates any previous camera/audio callbacks.
  useEffect(() => {
    if (lastLanguage.current === language) return;
    lastLanguage.current = language;
    if (!current.current) return;
    serial.current += 1;
    arrivedShot.current = null;
    setCameraReady(false);
    setCameraView('auto');
    setSession((value) => value && { ...value, serial: serial.current, phase: 'moving' });
  }, [language]);

  const narration = useNarration({
    text: item?.narration || '', sessionKey: `${session?.serial}:${language}`,
    enabled: Boolean(session && session.phase === 'narrating' && cameraReady),
    paused: Boolean(session?.paused), ...effectiveSettings,
    muted: settings.muted || (inVR && headsetMuted), onEnd: advance,
    beforeSentence: (sentence) => arrivedShot.current === shotFor(item, sentence, cameraView),
  });
  const plan = TOPIC_SHOT_PLANS[item?.id];
  const stage = plan?.filter((entry) => entry.sentence <= narration.sentence).slice(-1)[0];
  const availableDetail = detailFor(item);
  const shot = session?.phase === 'finishing' ? 'tourEnd' : shotFor(item, narration.sentence, cameraView);
  const running = Boolean(session && session.phase !== 'complete');
  const sessionSerial = session?.serial;
  const request = useMemo(() => running ? { shot, serial: sessionSerial } : null, [running, shot, sessionSerial]);
  requestedShot.current = shot;
  useEffect(() => { setCameraReady(false); }, [shot, sessionSerial]);

  useEffect(() => {
    try { localStorage.setItem('asrlab-guide-settings', JSON.stringify(settings)); } catch { /* Storage is optional. */ }
  }, [settings]);
  // Each viewing mode starts its own tour from its own camera rig.
  useEffect(() => { stop(); }, [inVR, stop]);
  useEffect(() => {
    const hide = () => {
      if (!inVR && document.hidden) setSession((value) => value && value.phase !== 'complete' ? { ...value, paused: true } : value);
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [inVR]);

  return {
    session, item, narration, settings: effectiveSettings, setSettings, go, stop, pause, arrive,
    active: running, request, cameraView, setCameraView, cameraReady,
    contextLabel: GUIDE_DETAILS[shot]?.exhibit || shot === 'equipment' ? ui.exhibit : ui.cell,
    hasDetail: Boolean(availableDetail), closeUp: Boolean(GUIDE_DETAILS[shot]),
    shotLabel: guideShotLabel(shot, language, cameraView === 'context' ? (shot === 'equipment' ? 'Ekipman sergisi' : 'Hücrenin tamamı') : GUIDE_DETAILS[shot]?.label || stage?.label || 'Hücreye genel bakış'),
    start: () => go(TOUR_STOPS[0]),
    next: () => {
      if (!session) return;
      const index = TOUR_STOPS.indexOf(session.id);
      if (index < TOUR_STOPS.length - 1) go(TOUR_STOPS[index + 1], session.mode);
    },
    previous: () => {
      if (!session) return;
      const index = TOUR_STOPS.indexOf(session.id);
      if (index > 0) go(TOUR_STOPS[index - 1], session.mode);
    },
  };
}

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useGuideTour from './useGuideTour';
import { TOUR_STOPS } from './guideContent';
import { getGuideTopic } from './guidePresentation';
import { splitNarration } from './useNarration';
import { LanguageProvider, LANGUAGE_STORAGE_KEY, useLanguage } from '../../LanguageContext';

let root;
let container;
let guide;
let synth;
let utterances;
let prepareScene;

function Probe({ inVR = false }) {
  const { setLanguage } = useLanguage();
  guide = { ...useGuideTour({ inVR, prepareScene }), setLanguage };
  return null;
}

const renderProbe = (inVR = false) => act(() => root.render(<LanguageProvider><Probe inVR={inVR} /></LanguageProvider>));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  localStorage.clear();
  utterances = [];
  prepareScene = jest.fn();
  synth = {
    getVoices: () => [
      { voiceURI: 'de-local', lang: 'de-DE', name: 'Deutsch' },
      { voiceURI: 'tr-local', lang: 'tr-TR', name: 'Türkçe' },
      { voiceURI: 'en-local', lang: 'en-US', name: 'English' },
    ],
    addEventListener: jest.fn(), removeEventListener: jest.fn(),
    resume: jest.fn(), cancel: jest.fn(),
    speak: jest.fn((utterance) => { utterances.push(utterance); utterance.onstart?.(); }),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(text) { this.text = text; } }, configurable: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  renderProbe();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const arrive = () => act(() => guide.arrive(guide.session.serial, guide.request.shot));
const finishSentence = () => {
  act(() => { utterances[utterances.length - 1].onend?.(); jest.advanceTimersByTime(200); });
  if (guide.session?.phase === 'narrating' && !guide.cameraReady) arrive();
};

test('narration waits for camera arrival and ignores stale camera callbacks', () => {
  act(() => guide.start());
  expect(prepareScene).toHaveBeenCalledTimes(1);
  expect(guide.session.phase).toBe('moving');
  expect(synth.speak).not.toHaveBeenCalled();
  act(() => guide.arrive(-1));
  expect(guide.session.phase).toBe('moving');
  arrive();
  expect(guide.session.phase).toBe('narrating');
  expect(synth.speak).toHaveBeenCalledTimes(1);
  expect(guide.narration.caption).toContain('bus inspection area');
  expect(utterances[0].lang).toBe('en-US');
  expect(utterances[0].voice.voiceURI).toBe('en-local');
});

test('pause cancels speech and resumes at the current sentence, stop cancels pending work', () => {
  act(() => guide.start()); arrive();
  const text = utterances[0].text;
  act(() => guide.pause());
  expect(guide.session.paused).toBe(true);
  expect(synth.cancel).toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(100000));
  expect(synth.speak).toHaveBeenCalledTimes(1);
  act(() => guide.pause());
  expect(utterances[1].text).toBe(text);
  act(() => guide.stop());
  act(() => jest.advanceTimersByTime(100000));
  expect(guide.session).toBe(null);
  expect(synth.speak).toHaveBeenCalledTimes(2);
});

test('muted narration advances captions without invoking the speech engine', () => {
  act(() => { guide.setSettings((old) => ({ ...old, muted: true })); guide.start(); });
  arrive();
  const first = guide.narration.caption;
  act(() => jest.advanceTimersByTime(10000));
  expect(synth.speak).not.toHaveBeenCalled();
  expect(guide.narration.caption).not.toBe(first);
});

test('an unavailable speech engine falls back to captions and can still finish', () => {
  synth.speak.mockImplementation((utterance) => utterances.push(utterance));
  act(() => guide.go('vacuum', 'focus')); arrive();
  act(() => jest.advanceTimersByTime(6001));
  expect(guide.narration.speechError).toMatch(/captions/);
  for (let i = 0; i < 20 && guide.session.phase !== 'complete'; i += 1) {
    act(() => jest.advanceTimersByTime(20000));
    if (!guide.cameraReady && guide.request) arrive();
  }
  expect(guide.session.phase).toBe('complete');
});

test('the automatic tour visits every stop once and ends after the last narration', () => {
  act(() => guide.start());
  for (const id of TOUR_STOPS) {
    expect(guide.session.id).toBe(id);
    expect(guide.session.phase).toBe('moving');
    arrive();
    for (let i = 0; i < splitNarration(getGuideTopic(id).narration).length; i += 1) finishSentence();
  }
  expect(guide.session.phase).toBe('finishing');
  expect(guide.request.shot).toBe('tourEnd');
  arrive();
  expect(guide.session.phase).toBe('complete');
  expect(guide.active).toBe(false);
});

test('switching language replays the same topic with a matching voice and persists the choice', () => {
  act(() => guide.go('roof', 'focus')); arrive();
  const oldSerial = guide.session.serial;
  const oldUtterance = utterances[utterances.length - 1];
  act(() => { guide.setLanguage('tr'); guide.setSettings((old) => ({ ...old, voiceURI: 'de-local' })); });
  expect(guide.session.id).toBe('roof');
  expect(guide.session.mode).toBe('focus');
  expect(guide.session.serial).toBeGreaterThan(oldSerial);
  expect(guide.session.phase).toBe('moving');
  expect(oldUtterance.onend).toBe(null);
  act(() => guide.arrive(oldSerial, 'roof'));
  expect(guide.cameraReady).toBe(false);
  arrive();
  expect(utterances[utterances.length - 1].lang).toBe('tr-TR');
  expect(utterances[utterances.length - 1].voice.voiceURI).toBe('tr-local');
  expect(guide.narration.caption).toContain('tavanı');
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('tr');
  expect(JSON.parse(localStorage.getItem('asrlab-guide-settings')).language).toBeUndefined();
  act(() => root.unmount());
  root = createRoot(container);
  renderProbe();
  expect(guide.settings.language).toBe('tr');
});

test('language changes preserve a paused tour and unsupported saved languages default to English', () => {
  act(() => guide.go('screwdriving')); arrive();
  act(() => guide.pause());
  const count = synth.speak.mock.calls.length;
  act(() => guide.setLanguage('tr'));
  arrive();
  expect(guide.session.id).toBe('screwdriving');
  expect(guide.session.paused).toBe(true);
  expect(synth.speak).toHaveBeenCalledTimes(count);
  act(() => guide.pause());
  expect(utterances[utterances.length - 1].lang).toBe('tr-TR');
  act(() => root.unmount());
  localStorage.setItem('asrlab-guide-settings', JSON.stringify({ language: 'de', voiceURI: 'de-local' }));
  localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
  root = createRoot(container);
  renderProbe();
  expect(guide.settings.language).toBe('en');
  act(() => guide.start()); arrive();
  expect(utterances[utterances.length - 1].voice.voiceURI).toBe('en-local');
});

test('VR entry stops the desktop camera tour and its speech', () => {
  act(() => guide.start()); arrive();
  renderProbe(true);
  expect(guide.session).toBe(null);
  expect(synth.cancel).toHaveBeenCalled();
});

test('a tour started in a headset waits for arrival and stops on XR exit', () => {
  renderProbe(true);
  act(() => guide.start());
  expect(guide.request.shot).toBe('monitoring');
  expect(synth.speak).not.toHaveBeenCalled();
  arrive();
  expect(utterances[0].text).toContain('bus inspection area');
  renderProbe(false);
  expect(guide.session).toBeNull();
  expect(utterances[0].onend).toBeNull();
});

test('equipment tracking stays active throughout narration and manual context changes preserve speech', () => {
  act(() => guide.go('gripper', 'focus'));
  const before = guide.request;
  expect(before.shot).toBe('gripper');
  arrive();
  expect(guide.request).toBe(before);
  expect(guide.closeUp).toBe(true);
  const count = synth.speak.mock.calls.length;
  act(() => guide.setCameraView('context'));
  expect(guide.request.shot).toBe('equipment');
  expect(guide.session.phase).toBe('narrating');
  expect(synth.speak).toHaveBeenCalledTimes(count);
  act(() => guide.setCameraView('detail'));
  expect(guide.request.shot).toBe('gripper');
});

test('scenario narration changes from the cell view to the correct moving tool', () => {
  act(() => guide.go('screwdriving', 'focus')); arrive();
  expect(guide.request.shot).toBe('screwdriving');
  finishSentence(); finishSentence();
  expect(guide.request.shot).toBe('screwdriver');
  expect(guide.session.phase).toBe('narrating');
});

test('the next sentence is held until its exact camera angle arrives', () => {
  act(() => guide.go('screwdriving', 'focus')); arrive();
  const count = synth.speak.mock.calls.length;
  act(() => { utterances[utterances.length - 1].onend?.(); jest.advanceTimersByTime(200); });
  expect(guide.request.shot).toBe('screwdriver');
  expect(guide.cameraReady).toBe(false);
  expect(synth.speak).toHaveBeenCalledTimes(count);
  act(() => guide.arrive(guide.session.serial, 'screwdriving'));
  expect(guide.cameraReady).toBe(false);
  arrive();
  expect(guide.cameraReady).toBe(true);
  expect(synth.speak).toHaveBeenCalledTimes(count + 1);
});

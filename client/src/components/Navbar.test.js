import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Navbar from './Navbar';
import DigitalGuide from './guide/DigitalGuide';
import useGuideTour from './guide/useGuideTour';
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from '../LanguageContext';

let root;
let container;
let guide;
let toggleAmbientSound;

function VisitorGuide() {
  guide = useGuideTour({ inVR: false, prepareScene: () => {} });
  return <DigitalGuide guide={guide} inVR={false} liveStatus="offline" animate />;
}
const render = () => act(() => root.render(
  <LanguageProvider>
    <Navbar liveStatus="live" ambientSoundEnabled onToggleAmbientSound={toggleAmbientSound} />
    <VisitorGuide />
  </LanguageProvider>,
));
const click = (selector) => act(() => container.querySelector(selector).click());

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  localStorage.clear();
  toggleAmbientSound = jest.fn();
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollIntoView = jest.fn();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount()); container.remove(); jest.useRealTimers();
});

test('one navbar selector drives chat, tour, navigation and the persisted app preference', () => {
  render();
  const selector = container.querySelector('.navbar-language');
  expect(selector.querySelectorAll('button')).toHaveLength(2);
  expect(selector.previousElementSibling.className).toBe('live-badge');
  expect(selector.nextElementSibling.className).toBe('navbar-sound-toggle');
  expect(selector.nextElementSibling.nextElementSibling.className).toBe('navbar-status-clock');
  expect(container.querySelector('.navbar-sound-toggle').getAttribute('aria-label')).toBe('Mute background sound');
  expect(selector.querySelector('[lang="en"]').getAttribute('aria-pressed')).toBe('true');
  click('.guide-chat-button');
  expect(container.querySelector('.guide-panel h2').textContent).toBe('Digital Twin Assistant');
  expect(container.querySelector('.guide-panel [aria-label="Language / Dil"]')).toBeNull();
  click('.guide-suggestions button');
  const question = container.querySelector('.guide-user-message').textContent;
  expect(container.querySelector('.guide-answer-topic h4').textContent).toContain('Cell 1');
  click('.navbar-language [lang="tr"]');
  expect(container.querySelector('.digital-guide').lang).toBe('tr');
  expect(container.querySelector('.guide-answer-topic h4').textContent).toContain('Hücre 1');
  expect(container.querySelector('.guide-user-message').textContent).toBe(question);
  expect(container.querySelector('.navbar-nav a').textContent).toBe('Ana sayfa');
  expect(document.documentElement.lang).toBe('tr');
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('tr');
  click('.guide-text-button');
  expect(guide.item.id).toBe('pick-place');
  const serial = guide.session.serial;
  click('.navbar-language [lang="en"]');
  expect(guide.item.id).toBe('pick-place');
  expect(guide.session.serial).toBeGreaterThan(serial);
  expect(guide.settings.language).toBe('en');
  expect(guide.item.title).toContain('Cell 1');
  expect(container.querySelector('.guide-tour [aria-label="Language / Dil"]')).toBeNull();
  expect(container.querySelectorAll('[aria-label="Language / Dil"]')).toHaveLength(1);
});

test('the adjacent background-sound control delegates toggling accessibly', () => {
  render();
  click('.navbar-sound-toggle');
  expect(toggleAmbientSound).toHaveBeenCalledTimes(1);

  click('.navbar-language [lang="tr"]');
  expect(container.querySelector('.navbar-sound-toggle').getAttribute('aria-label')).toBe('Arka plan sesini kapat');
});

test('the app preference overrides legacy chatbot language and survives page remounts', () => {
  localStorage.setItem('asrlab-guide-settings', JSON.stringify({ language: 'tr', muted: true }));
  render();
  expect(guide.settings.language).toBe('en');
  expect(guide.settings.muted).toBe(true);
  click('.navbar-language [lang="tr"]');
  act(() => root.unmount()); root = createRoot(container); render();
  expect(guide.settings.language).toBe('tr');
  expect(container.querySelector('.navbar-language [lang="tr"]').getAttribute('aria-pressed')).toBe('true');
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE_KEY, newValue: 'en' })));
  expect(guide.settings.language).toBe('en');
  expect(container.querySelector('.navbar-language [lang="en"]').getAttribute('aria-pressed')).toBe('true');
});

test('tour settings keep camera controls and discard a saved narration speed', () => {
  const settingsKey = 'asrlab-guide-settings';
  localStorage.setItem(settingsKey, JSON.stringify({ muted: true, rate: 1.3 }));
  render();
  expect(guide.settings.muted).toBe(true);
  expect(JSON.parse(localStorage.getItem(settingsKey)).rate).toBeUndefined();

  const settingsButton = '[aria-label="Tour settings"]';
  click('.guide-auto-button');
  expect(container.querySelector(settingsButton)).toBeNull();

  act(() => guide.go('pick-place'));
  click(settingsButton);
  expect(container.querySelector('.guide-settings select')).toBeNull();
  const cameraControls = '[role="group"][aria-label="Camera view"]';
  expect(container.querySelectorAll(`${cameraControls} button`)).toHaveLength(3);
});

test('asking Mira opens chat from Explore, uses the visible subject and resumes only an interrupted tour', () => {
  render();
  click('.guide-chat-button');
  click('#guide-topics-tab');
  act(() => guide.go('pick-place', 'focus'));
  // Close the existing panel, then open Ask from the running tour.
  click('.guide-panel-heading .guide-icon-button');
  click('.guide-ask-button');
  expect(container.querySelector('#guide-chat-tab').getAttribute('aria-selected')).toBe('true');
  expect(guide.session.paused).toBe(true);
  const input = container.querySelector('#guide-question');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'What does it do?');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  act(() => container.querySelector('.guide-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(container.querySelector('.guide-answer-topic h4').textContent).toContain('Cell 1');
  click('.guide-panel-heading .guide-icon-button');
  expect(guide.session.paused).toBe(false);
  act(() => guide.pause());
  click('.guide-ask-button');
  click('.guide-panel-heading .guide-icon-button');
  expect(guide.session.paused).toBe(true);
});

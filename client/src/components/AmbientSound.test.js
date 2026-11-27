import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AmbientSound from './AmbientSound';

let root;
let container;
let play;
let pause;

const render = (props) => act(() => root.render(<AmbientSound {...props} />));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  play = jest.fn(() => Promise.resolve());
  pause = jest.fn();
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test('plays both looped tracks quietly and lowers them while the guide is active', () => {
  render({ play: true });

  const tracks = [...container.querySelectorAll('audio')];
  expect(tracks).toHaveLength(2);
  expect(tracks.every((track) => track.loop)).toBe(true);
  expect(tracks.map((track) => track.getAttribute('src'))).toEqual([
    '/assets/audio/car-engine.ogg',
    '/assets/audio/robot-arm.ogg',
  ]);
  expect(tracks.map((track) => track.volume)).toEqual([0.08, 0.08]);
  expect(play).toHaveBeenCalledTimes(2);

  render({ play: true, ducked: true });
  expect(tracks.map((track) => track.volume)).toEqual([0.03, 0.03]);

  render({ play: false, ducked: true });
  expect(pause).toHaveBeenCalledTimes(2);
});

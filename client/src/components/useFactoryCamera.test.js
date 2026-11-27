import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useFactoryCamera from './useFactoryCamera';

let root;
let camera;

function Harness() {
  camera = useFactoryCamera();
  return null;
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('the camera tour waits for arrival at each stop and finishes on the factory overview', () => {
  act(() => camera.start());
  expect(camera.request).toMatchObject({ shot: 'overview', workspace: true });
  const first = camera.request;
  act(() => jest.advanceTimersByTime(5000));
  expect(camera.request).toBe(first);

  const visited = new Set();
  for (let index = 0; camera.touring && index < 20; index += 1) {
    const { shot, serial } = camera.request;
    visited.add(shot);
    act(() => camera.arrive(serial, shot));
    act(() => jest.advanceTimersByTime(5000));
  }

  expect([...visited]).toEqual(expect.arrayContaining(['monitoring', 'robotGripper', 'screwdriver', 'inspectionRear', 'assemblyTool', 'underbodyHead', 'roofHead']));
  expect(camera.touring).toBe(false);
  expect(camera.request.shot).toBe('overview');
});

test('manual selection cancels a pending tour advance and ignores its late arrival', () => {
  act(() => camera.start());
  const { shot, serial } = camera.request;
  act(() => camera.arrive(serial, shot));
  act(() => camera.select('inspectionRear'));
  act(() => camera.arrive(serial, shot));
  act(() => jest.advanceTimersByTime(5000));

  expect(camera.touring).toBe(false);
  expect(camera.request.shot).toBe('inspectionRear');
  act(() => camera.stop());
  expect(camera.request).toBeNull();
});

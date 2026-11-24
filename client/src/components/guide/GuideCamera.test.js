import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import GuideCamera from './GuideCamera';

jest.mock('@react-three/fiber', () => ({ useFrame: jest.fn(), useThree: jest.fn() }));

let root;
let container;
let frame;
let scene;
let camera;
let controlsRef;
let onArrive;
const request = { shot: 'underbody', serial: 12 };
const render = (props = {}) => act(() => root.render(<GuideCamera request={request} controlsRef={controlsRef} onArrive={onArrive} paused={false} disabled={false} {...props} />));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1.7, 0.05, 150);
  camera.position.set(14, 3, 17);
  controlsRef = { current: { target: new THREE.Vector3(8, 2, 6), enableDamping: true, update: jest.fn() } };
  onArrive = jest.fn();
  window.matchMedia = () => ({ matches: true });
  useThree.mockReturnValue({ camera, scene, size: { width: 1200, height: 800 } });
  useFrame.mockImplementation((callback) => { frame = callback; });
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

function mountSubjects() {
  for (const name of ['robot1-cad-frame', 'robot2-cad-frame', 'inspection-bus-body', 'cell-pickPlace']) {
    const group = new THREE.Group(); group.name = name; scene.add(group);
  }
}

test('arriving at an empty area does not start narration; all target models must be visible', () => {
  render();
  act(() => frame({}, 1));
  expect(onArrive).not.toHaveBeenCalled();
  mountSubjects();
  const bus = scene.getObjectByName('inspection-bus-body');
  bus.visible = false;
  act(() => frame({}, 1));
  expect(onArrive).not.toHaveBeenCalled();
  bus.visible = true;
  act(() => frame({}, 1));
  expect(onArrive).toHaveBeenCalledWith(12, 'underbody');
  act(() => frame({}, 1));
  expect(onArrive).toHaveBeenCalledTimes(1);
});

test('pausing holds the camera and resuming finishes the pending transition', () => {
  mountSubjects();
  render({ paused: true });
  const initial = camera.position.clone();
  act(() => frame({}, 1));
  expect(camera.position.equals(initial)).toBe(true);
  expect(onArrive).not.toHaveBeenCalled();
  render();
  act(() => frame({}, 1));
  expect(camera.position.equals(initial)).toBe(false);
  expect(onArrive).toHaveBeenCalledTimes(1);
});

test('a disabled desktop guide leaves the headset camera untouched', () => {
  mountSubjects();
  render({ disabled: true });
  const initial = camera.position.clone();
  act(() => frame({}, 1));
  expect(camera.position.equals(initial)).toBe(true);
  expect(onArrive).not.toHaveBeenCalled();
});

test('a gripper close-up uses the equipment geometry and keeps tracking after arrival', () => {
  const cell = new THREE.Group(); cell.name = 'cell-pickPlace'; scene.add(cell);
  const tool = new THREE.Group(); tool.name = 'guide-demo-ur10e-gripper'; tool.position.set(6, 1.3, 9); cell.add(tool);
  tool.add(new THREE.Mesh(new THREE.BoxGeometry(.18, .12, .09)));
  const closeRequest = { shot: 'robotGripper', serial: 13 };
  render({ request: closeRequest });
  act(() => frame({}, 1));
  expect(onArrive).toHaveBeenCalledWith(13, 'robotGripper');
  expect(camera.position.distanceTo(tool.position)).toBeLessThan(1.6);
  const before = camera.position.clone();
  tool.position.x += .8;
  tool.position.z -= 1.1;
  for (let i = 0; i < 35; i += 1) act(() => frame({}, .05));
  expect(camera.position.x - before.x).toBeCloseTo(.8, 1);
  expect(camera.position.z - before.z).toBeCloseTo(-1.1, 1);
  expect(onArrive).toHaveBeenCalledTimes(1);
});

test('a missing tool cannot silently fall back to a wide robot shot', () => {
  mountSubjects();
  render({ request: { shot: 'gripper', serial: 14 } });
  const before = camera.position.clone();
  act(() => frame({}, 1));
  expect(onArrive).not.toHaveBeenCalled();
  expect(camera.position.equals(before)).toBe(true);
});

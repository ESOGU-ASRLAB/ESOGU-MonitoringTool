import { Group, PerspectiveCamera, Vector3 } from 'three';
import { placeGuideViewer } from './VRGuide';

jest.mock('@react-three/xr', () => ({ useXR: jest.fn() }));

test('a headset off center lands at the requested eye position and keeps its tracked pitch', () => {
  const origin = new Group();
  const camera = new PerspectiveCamera();
  origin.position.set(-2, .1, 3);
  origin.rotation.y = .61;
  camera.position.set(.35, 1.55, -.22);
  camera.rotation.set(-.2, .12, 0, 'YXZ');
  origin.add(camera);
  const pitch = camera.getWorldDirection(new Vector3()).y;
  const eye = [6.4, 2.3, 10];
  const target = [2, 1.2, 1];

  placeGuideViewer(origin, camera, eye, target);

  expect(camera.getWorldPosition(new Vector3()).distanceTo(new Vector3(...eye))).toBeLessThan(1e-8);
  const direction = camera.getWorldDirection(new Vector3());
  expect(direction.y).toBeCloseTo(pitch);
  const expected = new Vector3(...target).sub(new Vector3(...eye)).setY(0).normalize();
  expect(direction.setY(0).normalize().distanceTo(expected)).toBeLessThan(1e-8);
});

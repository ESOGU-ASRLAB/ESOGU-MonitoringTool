import { walkMotion } from './workerMotion';

test('worker gait accelerates and decelerates smoothly while covering the route', () => {
  const length = 3;
  const speed = 0.8;
  const start = walkMotion(0, length, speed);
  const ramp = Math.min(0.25, length / (2 * speed));
  const halfway = walkMotion(start.duration / 2, length, speed);
  const end = walkMotion(start.duration, length, speed);

  expect(start.distance).toBe(0);
  expect(start.speed).toBe(0);
  expect(halfway.speed).toBeCloseTo(speed);
  expect(end.distance).toBeCloseTo(length);
  expect(end.speed).toBe(0);
  expect(walkMotion(ramp / 2, length, speed).speed).toBeGreaterThan(0);
  expect(walkMotion(ramp / 2, length, speed).speed).toBeLessThan(speed);
  expect(walkMotion(start.duration - ramp / 2, length, speed).speed).toBeLessThan(speed);
});

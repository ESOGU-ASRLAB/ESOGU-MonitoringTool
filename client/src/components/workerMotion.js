import * as THREE from 'three';

export const WALK_CLIP_SPEED = 0.8;

const smoothstep = (t) => t * t * (3 - 2 * t);

export function walkMotion(elapsed, length, speed) {
  const ramp = Math.min(0.25, length / (2 * speed));
  const cruise = length / speed - ramp;
  const duration = 2 * ramp + cruise;
  const time = THREE.MathUtils.clamp(elapsed, 0, duration);
  const rampDistance = speed * ramp;

  if (time < ramp) {
    const t = time / ramp;
    return {
      distance: rampDistance * (t * t * t - 0.5 * t * t * t * t),
      speed: speed * smoothstep(t),
      duration,
    };
  }
  if (time <= ramp + cruise) {
    return {
      distance: rampDistance / 2 + speed * (time - ramp),
      speed,
      duration,
    };
  }

  const t = (duration - time) / ramp;
  return {
    distance: length - rampDistance * (t * t * t - 0.5 * t * t * t * t),
    speed: speed * smoothstep(t),
    duration,
  };
}

export function interpolateYaw(from, to, progress) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * smoothstep(THREE.MathUtils.clamp(progress, 0, 1));
}

import React from 'react';
import Worker from './Worker';

// Six short work rounds: two at the Otokar cell perimeter, one at IFARLAB,
// and one along each parked bus. Each worker walks, pauses and faces the
// equipment at both endpoints. Robot working envelopes and bus footprints are
// deliberately kept outside every pedestrian segment.
export const WORKER_ROUTES = Object.freeze([
  { from: [-5.7, -13.1], to: [-2.8, -13.1], lookAt: [-4.2, -10.9], speed: 0.75, phase: 0.1 },
  { from: [-5.9, 8.7], to: [-2.8, 8.7], lookAt: [-4.2, 6.2], speed: 0.8, phase: 5.0 },
  { from: [4.2, 2.8], to: [6.6, 2.8], lookAt: [5.5, 0.8], speed: 0.75, phase: 1.1 },
  { from: [-9.7, -9.0], to: [-9.7, -5.0], lookAt: [-12.3, -7.0], speed: 0.8, phase: 0.7 },
  { from: [13.1, -7.0], to: [13.1, -3.0], lookAt: [10.5, -5.0], speed: 0.8, phase: 4.9 },
  { from: [5.1, -18.0], to: [5.1, -14.0], lookAt: [2.5, -16.0], speed: 0.8, phase: 1.9 },
]);

export default function Workers() {
  return WORKER_ROUTES.map((route, index) => <Worker key={index} {...route} />);
}

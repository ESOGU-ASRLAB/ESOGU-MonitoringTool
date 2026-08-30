import React from 'react';
import Worker from './Worker';

/*
 * Three workers pacing fixed routes on open floor, clear of the robot
 * workcell (near the origin), the bus (x~11-13, z~-12 to -4), the wall
 * shelving (x~13-15, z~12-19) and the pallet clusters near z~-21/-22.
 */
const ROUTES = [
  { from: [-6, 10], to: [2, 19], speed: 0.22, phase: 0 },
  { from: [-10, 2], to: [-10, -6], speed: 0.16, phase: 1.7 },
  { from: [0, -14], to: [6, -20], speed: 0.2, phase: 3.4 },
];

export default function Workers({ show = true }) {
  if (!show) return null;

  return (
    <>
      {ROUTES.map((route, i) => (
        <Worker key={i} {...route} />
      ))}
    </>
  );
}

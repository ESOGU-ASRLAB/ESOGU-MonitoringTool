import React from 'react';
import Drone from './Drone';

/*
 * Three drones on independent circular patrols, flown low (2.7-3.2m, down
 * from the original 4.5-6m) for visibility. At that height they can't just
 * fly over the ground clutter, so all three circles sit south of it instead:
 * the bus/lift cluster in DigitalTwin.js now spans roughly x=-13..20,
 * z=-3.77..22.77 (3 buses, a ramp, 4 lifts), so every patrol here stays
 * below z=-8 -- clear of that whole cluster, the robot workcell (near the
 * origin), and the wall shelving (x~13-15, z~12-19). Only the pallet
 * clusters near z~-21/-22 (see EnvironmentElements.js) are close enough to
 * mind, and each circle keeps a wide margin from those too.
 */
const PATROLS = [
  { center: [3, 0, -10], radius: 3, height: 3.0, speed: 0.35, phase: 0, tilt: 0.08 },
  { center: [-3, 0, -15], radius: 3, height: 2.7, speed: 0.45, phase: 2.4, tilt: -0.1 },
  { center: [3, 0, -19], radius: 2.5, height: 3.2, speed: 0.28, phase: 4.6, tilt: 0.12 },
];

export default function Drones({ show = true }) {
  if (!show) return null;

  return (
    <>
      {PATROLS.map((patrol, i) => (
        <Drone key={i} {...patrol} />
      ))}
    </>
  );
}

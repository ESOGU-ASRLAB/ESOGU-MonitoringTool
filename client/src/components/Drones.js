import React from 'react';
import Drone from './Drone';

/*
 * MOVED IN OVER THE CELLS.
 *
 * These used to orbit at z -17 and z +15 -- the far ends of the hall, past
 * both cells, where there is nothing to inspect and, from any framing of the
 * work, nothing to see. Three drones patrolling empty floor read as scenery.
 *
 * They now circle the machines they would actually be watching: two over the
 * Otokar cell, whose own centre is near (-3.8, -1.2), and one over the IFARLAB
 * workcell.
 *
 * The heights came down from 5.8-6.6 m to 5.3-5.6 m, and the radii in with
 * them. Higher and wider, the drones read against the roof -- which is where
 * they were hard to find. Lower, they sit against the machines themselves,
 * which is both easier to see and closer to what a patrol over a working cell
 * would actually look like. 5.3 m is the floor here, not a preference: the
 * gantry columns reach 4.90 m at full extension, and a drone has to clear a
 * raised mast at every point of its orbit, not just at rest.
 */
export const DRONE_PATROLS = Object.freeze([
  { center: [-4.0, 0, -4.5], radius: 2.2, height: 5.4, speed: 0.30, phase: 0, tilt: 0.08 },
  { center: [-3.0, 0, 2.5], radius: 2.0, height: 5.6, speed: 0.26, phase: 2.2, tilt: -0.07 },
  { center: [10.5, 0, -0.5], radius: 1.8, height: 5.3, speed: 0.32, phase: 4.1, tilt: 0.06 },
]);

export default function Drones({ show = true }) {
  if (!show) return null;

  return (
    <>
      {DRONE_PATROLS.map((patrol, i) => (
        <Drone key={i} {...patrol} />
      ))}
    </>
  );
}

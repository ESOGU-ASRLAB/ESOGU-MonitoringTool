import React from 'react';
import Drone from './Drone';
import { ACCENT } from './scenePalette';
import { busPose } from './busRoute';

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
/*
 * CLOSER IN, BESIDE THE MACHINES RATHER THAN OVER THEM.
 *
 * Over the Otokar cell a drone cannot come below 5.3 m -- the gantry masts
 * reach 4.90 m and travel the whole runway -- so the patrols sit beside the
 * work instead: one patrols over the scrubber on the east floor at 3.6 m, off
 * the routes of the two buses trading bays (busRoute.js); the other rides over
 * the graphite bus itself (ESCORT below). A third, over
 * the IFARLAB cell, hung across the lab signs from the opening camera and was
 * taken out. At the scale in Drone.js a drone's underside is ~1.1 m below its
 * centre, so every orbit keeps it above head height.
 */
export const DRONE_PATROLS = Object.freeze([
  { center: [12.4, 0, 12.0], radius: 0.8, height: 3.6, speed: 0.34, phase: 2.2, tilt: -0.07 },
]);

// All in the gantries' signal yellow, the one yellow already in the hall.
const DRONE_COLOR = ACCENT.signalRed.color;

/*
 * The escort: a larger drone riding over the buses as they trade bays
 * (busRoute.js). It follows the graphite bus, and while that one is out in the
 * yard -- or up against the far wall, past z = -19 where the door heads are --
 * it switches to the other bus, so it is always over a moving vehicle rather
 * than parked in front of the signs.
 *
 * At its scale (3.4 m across, ~1.35 m half-height) it flies at 6.3 m: its
 * underside at ~4.95 m clears the gantry carriages' 4.90 m tops when a bus
 * runs down the corridor between the two cells, as well as the bus roofs.
 */
const ESCORT = { height: 6.3, minZ: -19, scale: 0.09 };
const followBus = (time) => {
  const graphite = busPose(true, time);
  if (graphite.visible && graphite.z >= ESCORT.minZ) return graphite;
  const forest = busPose(false, time);
  return forest.visible && forest.z >= ESCORT.minZ ? forest : graphite;
};

export default function Drones({ show = true }) {
  if (!show) return null;

  return (
    <>
      {DRONE_PATROLS.map((patrol, i) => (
        <Drone key={i} {...patrol} color={DRONE_COLOR} />
      ))}
      <Drone {...ESCORT} wait={[1.41, 0]} follow={followBus} color={DRONE_COLOR} />
    </>
  );
}

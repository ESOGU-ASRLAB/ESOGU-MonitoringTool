import React, { useMemo, useState, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import OtokarGantryRobot from './OtokarGantryRobot';
import OtokarBusBody from './OtokarBusBody';
import { OTOKAR_ROBOT_HOME } from './otokarAxes';
import { FLOOR_Z_MM } from './otokarCellGeometry';

/*
 * Otokar MATISSE body-control cell, placed inside the facility shell alongside
 * the IFARLAB workcell.
 *
 * RETRACTED LAYOUT -- THIS COMPONENT IS STILL BUILT ON IT.
 *
 * What this file currently does: treats the cell as TWO PORTALS ON ONE RUNWAY,
 * both robots straddling the bus at different stations along a single 16 m
 * track, robot 2 drawn with showRails={false} because it was assumed to ride
 * robot 1's rail.
 *
 * What the CAD and Otokar's slides actually show: TWO INDEPENDENT PARALLEL
 * RAILS, one per robot, each a SINGLE-COLUMN gantry, the two robots mirror
 * images with their arms pointing inward and the bus between the rails. The
 * "both sides" reading came from `2_Konstruksiyon_SYM`, which turned out to be
 * an unplaced master copy of the one column, not a second leg. "Robot 2's X
 * values are relative to Robot 1's zero" means a shared world datum, not a
 * shared rail.
 *
 * Robot 2 therefore still needs its own rail and its own Robot2_*.stp
 * conversion; it must not keep borrowing robot 1's meshes at a different a1.
 * See docs/otokar-cad-notes.md, "RETRACTED: the cell is two portals on one
 * runway".
 *
 * Everything is one <group>, so the cell moves by changing CELL_ORIGIN alone,
 * and the whole subtree unmounts when the "Show Otokar cell" toggle is off --
 * these are the heaviest meshes in the scene, so they are removed, not hidden.
 *
 * Geometry, axis limits and the bus clearances come from Otokar's own CAD and
 * trajectory deck -- see docs/otokar-cad-notes.md.
 */

/*
 * Where the cell sits in the facility.
 *
 * Placed next to the IFARLAB workcell rather than off in a far corner, so a
 * single wide shot takes in both cells -- the earlier position (z ~ -19) put
 * 15+ metres of empty floor between them. Measured against both cells' real
 * world-space bounds (STL/GLB geometry, not the eyeballing that put an even
 * earlier version of this 3.6 m outside the west wall):
 *
 *   IFARLAB cell (fence + furniture)   x [-3.28,  1.75]  z [-3.64, 1.13]
 *   Building shell                     x [-16.39,16.39]  z [-24.73,24.73]
 *
 * The cell's own footprint, once CELL_ROTATION_Y turns the runway onto the
 * building's long axis, is 7.54 m across (x) by 16.21 m along (z). These
 * origin values land it at x -14.11 .. -5.78, z -9.36 .. 6.84:
 *   - a 2.5 m aisle to the IFARLAB fence's west face (x = -3.28)
 *   - 2.28 m clear of the west wall
 *   - z-centred on the IFARLAB cell, so its whole depth sits inside this
 *     cell's z-span and both read together from one camera angle
 *
 * (The cell's own full footprint -- bus body included -- runs about 0.8 m
 * further +x than its rail structure alone, which is what the 2.5 m aisle is
 * measured against here; sizing this by the rail's bbox alone undershot the
 * gap on the first pass. verify_cell_fit.mjs checks the real thing.)
 *
 * One cosmetic loose end: Workers.js's second patrol route runs along
 * x = -10, z 2..-6, straight through this aisle. Left alone -- Workers/Drones
 * are explicitly out of scope for this pass (see DigitalTwin.js) -- so a
 * background figure occasionally paces through the gantry's footprint.
 *
 * The Y component lifts the cell so the rail feet's floor level (CAD Z
 * -1368 mm, see otokarCellGeometry.js) lands on the scene floor at y = 0.
 * The cell tops out 4.87 m up. verify_cell_fit.mjs checks that against a
 * conservative building-wide roof floor of 5.31 m (0.44 m margin);
 * `scripts/otokar/roof_height.mjs` scans the roof structure specifically
 * above this x-band and measures a real local minimum of 7.4 m here, i.e.
 * 2.53 m of actual clearance -- 5.31 m is a safe floor from elsewhere in the
 * building, not this site's true ceiling.
 */
const CELL_ORIGIN = [-10.1, -FLOOR_Z_MM * 0.001, -5.88];
const CELL_ROTATION_Y = Math.PI / 2; // runway from local +x onto the building's z

/*
 * Distance past which the light mesh tier is used. The cell is ~16 m long, so
 * beyond ~26 m a rail carriage covers a handful of pixels and the detailed
 * tier buys nothing but bandwidth and draw time.
 */
const LOD_SWITCH_M = 26;

function LodController({ enabled, activeLod, setActiveLod }) {
  const camera = useThree((state) => state.camera);
  const centre = useMemo(() => new THREE.Vector3(...CELL_ORIGIN), []);

  useFrame(() => {
    if (!enabled) return;
    const next = camera.position.distanceTo(centre) > LOD_SWITCH_M ? 'lo' : 'hi';
    if (next !== activeLod) setActiveLod(next);
  });

  return null;
}

export default function OtokarCell({
  show = true,
  robotAxes,
  showBus = true,
  showRails = true,
  lodMode = 'auto',
  animate = false,
  animationSpeed = 1,
}) {
  const [activeLod, setActiveLod] = useState('lo');
  const lod = lodMode === 'auto' ? activeLod : lodMode;
  const axes = robotAxes || OTOKAR_ROBOT_HOME;

  if (!show) return null;

  return (
    <group position={CELL_ORIGIN} rotation={[0, CELL_ROTATION_Y, 0]}>
      <LodController
        enabled={lodMode === 'auto'}
        activeLod={activeLod}
        setActiveLod={setActiveLod}
      />
      <Suspense fallback={null}>
        {/* Robot 1 carries the shared runway; robot 2 rides the same one, so it
            is drawn without rails rather than stacking a second copy of the
            structure on the first. */}
        <OtokarGantryRobot
          robotId="robot1"
          axes={axes.robot1}
          lod={lod}
          showRails={showRails}
          animate={animate}
          animationSpeed={animationSpeed}
        />
        <OtokarGantryRobot
          robotId="robot2"
          axes={axes.robot2}
          lod={lod}
          showRails={false}
          animate={animate}
          animationSpeed={animationSpeed}
          phase={3.1}
        />

        <OtokarBusBody show={showBus} lod={lod} />
      </Suspense>
    </group>
  );
}

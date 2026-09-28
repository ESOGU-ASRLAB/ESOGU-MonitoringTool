import React, { useMemo, useState, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import OtokarGantryRobot from './OtokarGantryRobot';
import OtokarBusBody from './OtokarBusBody';
import OtokarBusSlings from './OtokarBusSlings';
import { OTOKAR_ROBOT_HOME } from './otokarAxes';
import { FLOOR_Z_MM } from './otokarCellGeometry';

/*
 * Otokar MATISSE body-control cell, placed inside the facility shell alongside
 * the IFARLAB workcell.
 *
 * The CAD and Otokar's slides show TWO INDEPENDENT PARALLEL
 * RAILS, one per robot, each a SINGLE-COLUMN gantry, the two robots mirror
 * images with their arms pointing inward and the bus between the rails. The
 * "both sides" reading came from `2_Konstruksiyon_SYM`, which turned out to be
 * an unplaced master copy of the one column, not a second leg. "Robot 2's X
 * values are relative to Robot 1's zero" means a shared world datum, not a
 * shared rail.
 *
 * Robot 2 uses its own converted Robot2_*.stp mesh set and its own rail. The
 * two machines share a world datum but never a runway.
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
 * building's long axis, is 7.54 m across (x) by 16.21 m along (z). Relative
 * to IFARLAB this lands it at:
 *   - a 2.5 m aisle to the IFARLAB fence's west face
 *   - z-centred on the IFARLAB cell, so its whole depth sits inside this
 *     cell's z-span and both read together from one camera angle
 *
 * Both cells were then shifted together by the same +6.18 m in x (the
 * workcell's half of that is IFARLAB_OFFSET in cellLayout.js) so the
 * combined pair sits centred on the building's own x=0 instead of hugging the
 * west wall with the whole east side of the room sitting empty. That rigid
 * shift is baked into CELL_ORIGIN's x below rather than applied as a second
 * wrapping group here, so this component's own placement math (the aisle,
 * the z-centring) stays relative to IFARLAB's un-shifted coordinates above --
 * only the final x differs by that +6.18 m.
 *
 * With the corrected CAD->Three axis mapping and the bus body's converted
 * offset, the complete hi-res union lands at x -8.59 .. -0.39,
 * z -11.44 .. 6.84: 7.80 m clear of the west wall and 3.28 m from the
 * measured IFARLAB workcell's nearest x face.
 *
 * (The cell's own full footprint -- bus body included -- runs about 0.8 m
 * further +x than its rail structure alone, which is what the 2.5 m aisle is
 * measured against here; sizing this by the rail's bbox alone undershot the
 * gap on the first pass. verify_cell_fit.mjs checks the real thing.)
 *
 * The former worker patrol used to run along x = -10, z 2..-6, straight
 * through this aisle. The patrol is no longer part of the scene.
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
const CELL_ORIGIN = [-3.92, -FLOOR_Z_MM * 0.001, -5.88];
const CELL_ROTATION_Y = Math.PI / 2; // runway from local +x onto the building's z

/*
 * LOD SWITCHING, WITH HYSTERESIS.
 *
 * The cell is ~16 m long, so past roughly 26 m a rail carriage covers a
 * handful of pixels and the detailed tier buys nothing but bandwidth and draw
 * time. That part was right. What was wrong was using ONE threshold at 26 m:
 * a camera sitting near it flips tier on every small movement, and each flip
 * changes every mesh URL in the cell, so the whole cell suspends and refetches.
 * Zooming through that distance made the models visibly reload.
 *
 * Two thresholds instead, with a 4 m dead band. Going out, the light tier
 * starts at 28 m; coming back, the detailed tier resumes at 24 m. A camera
 * anywhere between them keeps whatever it already has, so no amount of small
 * movement can cause a switch.
 */
const LOD_TO_LO_M = 28;
const LOD_TO_HI_M = 24;

/*
 * Which tier a camera at `distance` should use GIVEN the one it is already on.
 * The current tier is an input, not just an output: that is what the dead band
 * means. Also used to choose the opening tier, where passing 'lo' as the
 * current tier asks the stricter question ("is it close enough to earn the
 * detailed tier?") and so never opens on hi by accident.
 */
function lodForDistance(distance, current) {
  if (current === 'hi') return distance > LOD_TO_LO_M ? 'lo' : 'hi';
  return distance < LOD_TO_HI_M ? 'hi' : 'lo';
}

function LodController({ enabled, centre, activeLod, setActiveLod }) {
  const camera = useThree((state) => state.camera);
  const eye = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!enabled) return;
    // World position, not .position: in a headset the camera is parented to
    // the XR origin, so its .position is only the offset within the play space.
    const next = lodForDistance(camera.getWorldPosition(eye).distanceTo(centre), activeLod);
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
  /*
   * THE OPENING TIER IS DERIVED FROM WHERE THE CAMERA ACTUALLY IS, and that
   * matters more than it looks.
   *
   * This used to start at 'lo' unconditionally. LodController then ran on the
   * very first frame, found the default camera well inside the switch distance
   * and moved to 'hi' -- so the page requested the ENTIRE light tier, abandoned
   * it mid-flight, and requested the entire detailed tier. Measured against the
   * meshes actually referenced here: 100.3 MB of lo plus 110.5 MB of hi, and
   * because bus/hi/body.glb and bus/lo/body.glb are byte-identical, 137 MB of
   * that was the same vehicle downloaded twice.
   *
   * Reading the camera at mount costs nothing -- this component renders inside
   * the Canvas, so the camera already exists -- and the first request is then
   * the only request.
   */
  const camera = useThree((state) => state.camera);
  const centre = useMemo(() => new THREE.Vector3(...CELL_ORIGIN), []);
  const [activeLod, setActiveLod] = useState(() =>
    lodForDistance(camera.position.distanceTo(centre), 'lo'));
  const lod = lodMode === 'auto' ? activeLod : lodMode;
  const axes = robotAxes || OTOKAR_ROBOT_HOME;

  if (!show) return null;

  return (
    <group position={CELL_ORIGIN} rotation={[0, CELL_ROTATION_Y, 0]}>
      <LodController
        enabled={lodMode === 'auto'}
        centre={centre}
        activeLod={activeLod}
        setActiveLod={setActiveLod}
      />
      <Suspense fallback={null}>
        {/* Two independent parallel rails, one per robot, mirrored about the
            body's longitudinal centre plane. Both meshes are pre-placed in the
            shared cell frame, so neither instance takes a position here. */}
        <OtokarGantryRobot
          robotId="robot1"
          meshGroup="robot1"
          axes={axes.robot1}
          lod={lod}
          showRails={showRails}
          animate={animate}
          animationSpeed={animationSpeed}
        />
        {/* Robot 2 owns the second rail and the complete mirrored EKSEN1-5
            chain. Its assets are baked into the same installed cell frame. */}
        <OtokarGantryRobot
          robotId="robot2"
          meshGroup="robot2"
          axes={axes.robot2}
          lod={lod}
          showRails={showRails}
          animate={animate}
          animationSpeed={animationSpeed}
          phase={3.1}
        />

        <OtokarBusBody show={showBus} lod={lod} />
        {/* The vehicle has no modelled support -- see OtokarBusSlings for what
            was searched for and not found. These hang it from the roof so it
            does not read as levitating. */}
        <OtokarBusSlings show={showBus} />
      </Suspense>
    </group>
  );
}

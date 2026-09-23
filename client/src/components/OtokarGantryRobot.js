import React, { useRef, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import OtokarMesh from './OtokarMesh';
import { OTOKAR_AXES } from './otokarAxes';
import { OTOKAR_DEMO_WAYPOINTS, createCoordinatedMove } from './otokarMotion';

/*
 * One of the two 5-axis portal (gantry) inspection robots in Otokar's MATISSE
 * body-control cell. Parametric on `robotId` -- the two machines are the same
 * hardware, so this component renders either one.
 *
 *  AXIS CHAIN (each group is a child of the one above it, which is the real
 *  kinematic chain):
 *
 *    axis1  linear  16 000 mm   rides the floor rail        -> CAD +X
 *      axis2  linear   3 350 mm   vertical column           -> CAD +Z / Three +Y
 *        axis3  linear   1 800 mm  horizontal arm           -> CAD +Y / Three -Z
 *          axis4  rotary          wrist tilt                -> about CAD X
 *            axis5  rotary        camera roll/pan           -> about CAD Z
 *              camera head (Basler ace + RealSense D455 + SICK DT35)
 *
 *  Travel, speed and acceleration figures live in otokarAxes.js, transcribed
 *  from MATISSE_Rokos_Yörünge_Bilgileri.pptx. Read the verification banner at
 *  the top of that file before trusting the axis-2/axis-3 mapping: axis 1's
 *  16 000 mm travel and the rotary nature of axes 4 and 5 are confirmed
 *  against the STEP geometry; the rest is inferred from slide order.
 *
 *  ASSUMPTIONS MARKED IN THIS FILE (all detailed in docs/otokar-cad-notes.md):
 *    MESH_GROUP     why both robots draw from one mesh set
 *    CAD_POSE       what axis value the exported CAD pose corresponds to
 *    PIVOTS         rotary axis centres -- these ARE geometry-derived
 *    CAMERA_MOUNT   where the camera head sits on the axis-5 flange
 */

const MM = 0.001; // GLBs are already in metres; the constants below are in mm

/*
 * BOTH robots render from the robot1 mesh set.
 *
 * They are the same machine -- Robot1_EKSEN5.stp and Robot2_EKSEN5.stp have
 * identical face counts (20 173), and the rest match to within a per-cent --
 * and physically they are two carriages on one runway, differing only in where
 * they sit along it. So `robotId` selects the axis values and the demo phase,
 * not a separate mesh set.
 *
 * The other reason is practical. Every one of these exports contains the
 * assembly twice, once mirrored onto the other horizontal axis, and the
 * converter crops to the installed copy (see docs/otokar-cad-notes.md). That
 * crop resolves cleanly for Robot 1's files but not Robot 2's: its axis-2
 * assembly still comes out 0.82 x 15.76 x 6.51 m against Robot 1's
 * 2.41 x 3.66 x 2.05 m for the same hardware, i.e. a duplicate survives along
 * the very axis its own machine runs on. Rather than ship geometry that lands
 * 9.7 m outside the building, Robot 2's axis meshes are not converted at all.
 */
const MESH_GROUP = 'robot1';

/*
 * THE EXPORTED POSE IS HOME. Every axis reads zero here.
 *
 * Otokar's overview and "ROBOT1 0 position" slides show both carriages parked
 * at the same end of their rails -- the end with the U-shaped cable loop --
 * and the exported carriage sits 180.3 mm from that end stop. So the pose the
 * STEP files capture is the machine's zero, and the sliders move each axis
 * away from it. Nothing here is a fitted or centred figure any more.
 *
 * This replaces a previous a1 of 13474 mm, which came from an unverified
 * "centre the 16 m sweep on the 16.207 m rail" formula and was never checked
 * against where the carriage actually sits. Against it, BOTH robots' default
 * stations put the carriage clean off the end of the rail -- robot 1 by
 * 8.8 m -- which is what launched the arms into open space.
 */
const CAD_POSE = { a1: 0, a2: 0, a3: 0, a4: 0, a5: 0 };

/*
 * THE BAKED FRAME.
 *
 * EKSEN2..5 are exported in the axis-2 column's own master frame, not in
 * EKSEN1's. The transform onto EKSEN1's installed frame is that column's
 * assembly placement -- a 180 deg rotation about Z plus a translation -- read
 * from `2_Eksen_Sabit_SYM` in Robot1_EKSEN1.stp. convert.py now BAKES it into
 * the GLB vertices, so every mesh arrives already in the installed frame and
 * this component no longer carries per-boundary correction constants.
 *
 * The matrix is repeated here for one reason only: the joint pivots and axis
 * DIRECTIONS below were measured in the same native frame as the geometry, so
 * they must be carried through the same transform. Deriving them beats
 * re-typing them with flipped signs -- a translation-only constant silently
 * standing in for this rotation is exactly what left the arm and camera
 * pointing away from the body, and no bbox check could see it.
 *
 * Provenance and evidence: client/public/meshes/otokar/placements.json.
 */
const BAKED_PLACEMENT_MM = [
  [-1, 0, 0, -10738.384],
  [0, -1, 0, -0.108],
  [0, 0, 1, 0],
];
const toInstalled = (p) =>
  BAKED_PLACEMENT_MM.map((r) => r[0] * p[0] + r[1] * p[1] + r[2] * p[2] + r[3]);
const rotateToInstalled = (v) =>
  BAKED_PLACEMENT_MM.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);

/*
 * Rotary axis centres. NOT guesses: the centroids of the NABTESCO cycloidal
 * reducers that drive each axis, read straight out of EKSEN4 and EKSEN5, then
 * carried into the installed frame by the same matrix as their geometry.
 */
const PIVOTS = {
  a4: toInstalled([1840.0, -2258.2, -585.3]),
  a5: toInstalled([1902.8, -2258.2, -755.0]),
};

/*
 * Joint directions, derived from the baked rotation rather than written down
 * as signs. Axis 3 comes out as installed -Y, which is what points the arm
 * INWARD at the body; axis 4 tilts about installed -X; axis 5 is unaffected
 * by a rotation about Z.
 */
const AXIS2_DIR = new THREE.Vector3(...rotateToInstalled([0, 0, 1])); // column slide, up
const AXIS3_DIR = new THREE.Vector3(...rotateToInstalled([0, 1, 0])); // arm, toward body
const AXIS4_AXIS = new THREE.Vector3(...rotateToInstalled([1, 0, 0])).normalize();
const AXIS5_AXIS = new THREE.Vector3(...rotateToInstalled([0, 0, 1])).normalize();

/*
 * Camera head placement on the axis-5 flange. STILL AN ASSUMPTION, and the one
 * placement in the chain that is NOT derivable: Robot1_EKSEN5.stp contains no
 * camera instance to read a matrix from, and Robot2_Kamera.stp is modelled on
 * its own origin. This hangs the head below the axis-5 reducer, the direction
 * that reducer's output faces. Flagged as a declared assumption in
 * placements.json; it needs a figure from Otokar.
 */
const CAMERA_MOUNT = toInstalled([1902.8, -2258.2, -1010.0]);

const STRUCTURE = { color: '#8d9299', metalness: 0.75, roughness: 0.5 };
// COLUMN kept at the original CARRIAGE colour: this used to be the material
// on the axis2 mesh before the axis1_carriage mesh existed, and that mesh is
// still the vertical column, not the carriage.
const COLUMN = { color: '#5b6169', metalness: 0.8, roughness: 0.42 };
const CARRIAGE = { color: '#71767d', metalness: 0.8, roughness: 0.42 };
const ARM = { color: '#137cbd', metalness: 0.55, roughness: 0.35 };
const WRIST = { color: '#2c2d30', metalness: 0.85, roughness: 0.35 };
const CAMERA_MAT = { color: '#d8dde2', metalness: 0.45, roughness: 0.3 };

const toRad = (deg) => (deg * Math.PI) / 180;
export default function OtokarGantryRobot({
  robotId = 'robot1',
  axes = OTOKAR_AXES.map((a) => a.home),
  lod = 'hi',
  showRails = true,
  animate = false,
  animationSpeed = 1,
  phase = 0,
}) {
  const refs = useRef({});
  // Holds the demo sequence's state between frames: which leg of
  // OTOKAR_DEMO_WAYPOINTS is running, the coordinated move for THIS leg
  // (built once when the leg starts, not every frame), and seconds elapsed
  // since it started. A scratch array avoids allocating on every sample.
  const seqRef = useRef(null);
  const sampleOut = useRef([0, 0, 0, 0, 0]);

  /*
   * Demo motion is written straight onto the group transforms rather than
   * through React setters -- same reasoning as RailAnimator on the IFARLAB
   * page: this runs every frame, and routing it through state would re-render
   * the page 60x/second.
   *
   * Unlike RailAnimator's sine sweep, this drives real trapezoidal velocity
   * profiles (otokarMotion.js) through a fixed inspection sequence -- front
   * wall, rear wall, underbody, roof, the order Otokar's own deck lists.
   * createCoordinatedMove synchronises all five axes to arrive together each
   * leg -- the way a real multi-axis controller runs a programmed move --
   * rather than letting each axis run at its own pace and finish whenever:
   * the axis that needs the longest at its own accel/speed/decel sets the
   * leg's duration, and every other axis's profile is re-solved to take
   * exactly that long by capping its cruise speed, never its accel/decel.
   *
   * `phase` staggers the two robots so they aren't mid-sequence in lockstep:
   * it offsets which leg this instance starts on and how far into it.
   */
  useFrame((_, delta) => {
    const g = refs.current;
    let a1;
    let a2;
    let a3;
    let a4;
    let a5;

    if (animate) {
      let cur = seqRef.current;
      if (cur === null) {
        // First frame of animation (or the first since it was last turned
        // off): start the sequence staggered by `phase` rather than always
        // from leg 0, and move from the pose selected on the sliders.
        const n = OTOKAR_DEMO_WAYPOINTS.length;
        const startLeg = Math.floor(phase) % n;
        const fromAxes = axes;
        const toAxes = OTOKAR_DEMO_WAYPOINTS[startLeg].axes;
        const move = createCoordinatedMove(fromAxes, toAxes, OTOKAR_AXES);
        cur = {
          leg: startLeg,
          toAxes,
          move,
          t: (phase % 1) * move.duration, // stagger without a fixed-time guess
        };
        seqRef.current = cur;
      }

      cur.t += delta * animationSpeed;

      // Preserve any frame-time overshoot so a long frame cannot silently
      // skip part of the next movement leg.
      while (cur.t >= cur.move.duration && cur.move.duration > 0) {
        cur.t -= cur.move.duration;
        const n = OTOKAR_DEMO_WAYPOINTS.length;
        const nextLeg = (cur.leg + 1) % n;
        const fromAxes = cur.toAxes;
        const toAxes = OTOKAR_DEMO_WAYPOINTS[nextLeg].axes;
        cur = {
          leg: nextLeg,
          toAxes,
          move: createCoordinatedMove(fromAxes, toAxes, OTOKAR_AXES),
          t: cur.t,
        };
        seqRef.current = cur;
      }

      [a1, a2, a3, a4, a5] = cur.move.sample(cur.t, sampleOut.current);
    } else {
      seqRef.current = null; // re-seed from the manual pose next time animation starts
      [a1, a2, a3, a4, a5] = axes;
    }

    // Every mesh below arrives already in the installed CAD frame (baked by
    // convert.py), so these groups drive along the DERIVED installed-frame
    // directions above -- no per-boundary correction, no hand-written signs.
    // They stay in the CAD basis; the root's -90 deg X rotation does the single
    // Z-up -> Y-up conversion for the whole subtree.
    if (g.a1) g.a1.position.x = (a1 - CAD_POSE.a1) * MM;
    if (g.a2) g.a2.position.copy(AXIS2_DIR).multiplyScalar((a2 - CAD_POSE.a2) * MM);
    if (g.a3) g.a3.position.copy(AXIS3_DIR).multiplyScalar((a3 - CAD_POSE.a3) * MM);
    if (g.a4) g.a4.quaternion.setFromAxisAngle(AXIS4_AXIS, toRad(a4 - CAD_POSE.a4));
    if (g.a5) g.a5.quaternion.setFromAxisAngle(AXIS5_AXIS, toRad(a5 - CAD_POSE.a5));
  });

  return (
    // CAD is Z-up, three.js is Y-up -- the same conversion the ROS-sourced
    // UR10e and Kawasaki components apply at their own roots.
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <group name={`${robotId}-cad-frame`}>
        <Suspense fallback={null}>
          {/* ===== AXIS 1 stator: floor rail, feet and support structure.
                   Static -- everything else rides it. ===== */}
          {showRails && (
            <OtokarMesh group={MESH_GROUP} part="axis1" lod={lod} material={STRUCTURE} />
          )}

          {/* ===== AXIS 1 (linear, installed +X, rides the rail) =====
                   Carries the saddle AND the axis-2 column: the column's base
                   plate is bolted to the saddle, so it travels with a1. Both
                   come out of EKSEN1 in one mesh. ===== */}
          <group name="axis-1-carriage" ref={(el) => (refs.current.a1 = el)}>
            <OtokarMesh group={MESH_GROUP} part="axis1_carriage" lod={lod} material={CARRIAGE} />

            {/* ===== AXIS 2 (linear, up the column, 0-3 350 mm) ===== */}
            <group name="axis-2-vertical" ref={(el) => (refs.current.a2 = el)}>
              {/* The axis-2 slide itself rides the column, so unlike the old
                  arrangement it belongs INSIDE the a2 group. */}
              <OtokarMesh group={MESH_GROUP} part="axis2" lod={lod} material={COLUMN} />
              <OtokarMesh group={MESH_GROUP} part="axis3" lod={lod} material={ARM} />

              {/* ===== AXIS 3 (linear, installed -Y, toward the body) ===== */}
              <group name="axis-3-arm" ref={(el) => (refs.current.a3 = el)}>
                <OtokarMesh group={MESH_GROUP} part="axis4" lod={lod} material={WRIST} />

                {/* ===== AXIS 4 (rotary, at the reducer centre) ===== */}
                <group name="axis-4-pivot" position={PIVOTS.a4.map((v) => v * MM)}>
                  <group name="axis-4-tilt" ref={(el) => (refs.current.a4 = el)}>
                    <group position={PIVOTS.a4.map((v) => -v * MM)}>
                      <OtokarMesh group={MESH_GROUP} part="axis5" lod={lod} material={WRIST} />

                      {/* ===== AXIS 5 (rotary, at the reducer centre) ===== */}
                      <group name="axis-5-pivot" position={PIVOTS.a5.map((v) => v * MM)}>
                        <group name="axis-5-azimuth" ref={(el) => (refs.current.a5 = el)}>
                          <group position={PIVOTS.a5.map((v) => -v * MM)}>
                            {/* Both robots share this head: identical
                                hardware, and only Robot2_Kamera.stp exports it
                                in a usable local frame. Its mount point is the
                                one assumption left in the chain. */}
                            <group name="camera-mount" position={CAMERA_MOUNT.map((v) => v * MM)}>
                              <OtokarMesh
                                group="shared"
                                part="camera"
                                lod={lod}
                                material={CAMERA_MAT}
                              />
                            </group>
                          </group>
                        </group>
                      </group>
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </Suspense>
      </group>
    </group>
  );
}

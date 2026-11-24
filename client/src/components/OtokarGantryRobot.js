import React, { useCallback, useMemo, useRef, useState, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { publishTelemetry } from './robotTelemetry';
import * as THREE from 'three';
import OtokarMesh from './OtokarMesh';
import { OTOKAR_AXES } from './otokarAxes';
import { OTOKAR_INSPECTION_SEQUENCES, createCoordinatedMove } from './otokarMotion';
import { OTOKAR_ROBOT_MATERIALS } from './otokarCadPalette';
import {
  AXIS1,
  AXIS2,
  AXIS2_MIRRORED,
  foldParamsFromBox,
  makeFoldingChainMaterial,
} from './otokarCableChain';

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
 *  ASSUMPTIONS MARKED IN THIS FILE (all detailed in docs/inspection-cell-cad-notes.md):
 *    meshGroup      each robot draws its own mirrored mesh set
 *    CAD_POSE       what axis value the exported CAD pose corresponds to
 *    PIVOTS         rotary axis centres -- these ARE geometry-derived
 *    CAMERA_MOUNT   where the camera head sits on the axis-5 flange
 */

const MM = 0.001; // GLBs are already in metres; the constants below are in mm

/*
 * Each robot draws its OWN mesh set: they are mirror-image machines on their
 * own parallel rails, not one machine re-posed, so `meshGroup` selects
 * robot1/ or robot2/ and every mesh arrives pre-placed in the shared cell
 * frame (see placements.json).
 *
 * Robot2_EKSEN2..5 are baked into the mirrored installed frame by the same
 * conversion pipeline as Robot1. The runtime only applies axis motion; it no
 * longer carries a sibling-with-zero-offset or a cross-file correction.
 */

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
 * Provenance and evidence: client/public/meshes/bus-inspection/placements.json.
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
 * its own origin. The current datum places the head against the axis-5 lower
 * flange; the 124 mm adjustment closes the measured runtime surface gap.
 * Flagged as a declared assumption in placements.json; it needs a figure from
 * Otokar.
 */
const CAMERA_MOUNT = toInstalled([1902.8, -2258.2, -886.0]);

// The end-view datum puts the bus centre plane at this CAD-local Y. Robot 2
// is a mirror across that plane, while both carriages remain at the same X
// cable-loop end. Its baked GLBs use the same installed CAD axes as Robot 1,
// so only the inward arm direction and rotary pivot Y coordinates differ.
const BUS_CENTRELINE_Y_MM = -137.2612;
const mirrorAcrossBus = ([x, y, z]) => [x, 2 * BUS_CENTRELINE_Y_MM - y, z];
const ROBOT2_PIVOTS = {
  a4: mirrorAcrossBus(PIVOTS.a4),
  a5: mirrorAcrossBus(PIVOTS.a5),
};
// CAMERA_MOUNT is a local flange assumption, not an installed world point.
// Robot2 mirrors Robot1 across the bus centre plane; the inspection head then
// turns inward via CAMERA_HEADING below.
const ROBOT2_CAMERA_MOUNT = mirrorAcrossBus(CAMERA_MOUNT);

const ROBOT_KINEMATICS = {
  robot1: {
    axis2Dir: AXIS2_DIR,
    axis3Dir: AXIS3_DIR,
    axis4Axis: AXIS4_AXIS,
    axis5Axis: AXIS5_AXIS,
    pivots: PIVOTS,
    cameraMount: CAMERA_MOUNT,
  },
  robot2: {
    axis2Dir: new THREE.Vector3(0, 0, 1),
    axis3Dir: new THREE.Vector3(0, 1, 0),
    axis4Axis: new THREE.Vector3(-1, 0, 0),
    axis5Axis: new THREE.Vector3(0, 0, 1),
    pivots: ROBOT2_PIVOTS,
    cameraMount: ROBOT2_CAMERA_MOUNT,
  },
};

// The named inner stage stays on the column; two 900 mm telescopic strokes
// supply 1800 mm total travel. A 1:2 stage ratio is recorded as an assumption
// in telescopic.json. No fitted wrist offset is added to the CAD assembly.

/* Both inspection heads must face inward across the bus. */
const CAMERA_HEADING = Object.freeze({ robot1: 0, robot2: Math.PI });

// Shared visual language for the Otokar CAD assemblies. Keeping the palette
// in one place makes the robot parts read as one coherent machine while still
// preserving useful material differences between steel, painted profiles and
// technical details.
const {
  structure: STRUCTURE, chain: CABLE_CHAIN, column: COLUMN,
  carriage: CARRIAGE, arm: ARM, slide: SLIDE, wrist: WRIST,
  rotary: AXIS5_DETAIL, camera: CAMERA_MAT, fixtures: FIXTURES,
} = OTOKAR_ROBOT_MATERIALS;

/*
 * THE ENERGY CHAIN IN THE CABLE TRAY.
 *
 * `Kablo_Traktoru` comes out as its own mesh (AXIS1_ROLE=chain) rather than
 * being welded into the static runway, where convert.py's branch-name split had
 * put it -- it is a sibling of `1_Eksen_Hareketli`, not a child of it.
 *
 * It folds. otokarCableChain.js lays its links along an anchored run, a rolling
 * U-bend and a towed run, in the vertex shader, and that module carries the
 * reasoning along with what is measured and what is assumed. All this component
 * does is tell it where the carriage is.
 */

const toRad = (deg) => (deg * Math.PI) / 180;

export default function OtokarGantryRobot({
  robotId = 'robot1',
  meshGroup = 'robot1',
  axes = OTOKAR_AXES.map((a) => a.home),
  lod = 'hi',
  showRails = true,
  animate = false,
  animationSpeed = 1,
  phase = 0,
}) {
  const kinematics = ROBOT_KINEMATICS[robotId] || ROBOT_KINEMATICS.robot1;
  const refs = useRef({});

  /*
   * The chain's own material, built once the mesh reports its bounding box: the
   * fold's parameters are read off the geometry rather than written down, so
   * they cannot drift from a rebuilt mesh. The two robots' chains differ by a
   * couple of millimetres, so there is no one pair of numbers to write anyway.
   */
  const [chainParams, setChainParams] = useState(null);
  const onChainGeometry = useCallback((box) => {
    setChainParams((prev) => (prev ? prev : foldParamsFromBox(box, OTOKAR_AXES[0].max, AXIS1)));
  }, []);
  const chainMaterial = useMemo(
    () => (chainParams ? makeFoldingChainMaterial(CABLE_CHAIN, chainParams) : null),
    [chainParams],
  );

  /*
   * The column's own chain, folding the same way about the vertical axis. Robot
   * 2's doubles back the other way across its column, which is the only thing
   * that differs between the two.
   */
  const columnAxis = robotId === 'robot2' ? AXIS2_MIRRORED : AXIS2;
  const [columnChainParams, setColumnChainParams] = useState(null);
  const onColumnChainGeometry = useCallback(
    (box) => {
      setColumnChainParams((prev) => (prev ? prev : foldParamsFromBox(box, OTOKAR_AXES[1].max, columnAxis)));
    },
    [columnAxis],
  );
  const columnChainMaterial = useMemo(
    () => (columnChainParams ? makeFoldingChainMaterial(CABLE_CHAIN, columnChainParams) : null),
    [columnChainParams],
  );
  /*
   * This robot's own inspection program -- robot 1 works the underbody, robot 2
   * the roof, and the two are NOT the same leg list with a time offset. See
   * otokarMotion.js for why the regions are split and why only one of them
   * reaches into the vehicle.
   */
  const legs = useMemo(
    () => OTOKAR_INSPECTION_SEQUENCES[robotId] || OTOKAR_INSPECTION_SEQUENCES.robot1,
    [robotId],
  );
  // Holds the sequence's state between frames: which leg is running, the
  // coordinated move for THIS leg (built once when the leg starts, not every
  // frame), and seconds elapsed since it started. A scratch array avoids
  // allocating on every sample.
  const seqRef = useRef(null);
  // Reused each frame; see robotTelemetry.js for why it is not a fresh array.
  const liveRef = useRef([0, 0, 0, 0, 0]);
  const sampleOut = useRef([0, 0, 0, 0, 0]);

  /*
   * Demo motion is written straight onto the group transforms rather than
   * through React setters -- same reasoning as RailAnimator on the IFARLAB
   * page: this runs every frame, and routing it through state would re-render
   * the page 60x/second.
   *
   * Unlike RailAnimator's sine sweep, this drives real trapezoidal velocity
   * profiles (otokarMotion.js) through the robot's inspection program.
   * createCoordinatedMove synchronises all five axes to arrive together each
   * leg -- the way a real multi-axis controller runs a programmed move --
   * rather than letting each axis run at its own pace and finish whenever:
   * the axis that needs the longest at its own accel/speed/decel sets the
   * leg's duration, and every other axis's profile is re-solved to take
   * exactly that long by capping its cruise speed, never its accel/decel.
   *
   * A leg's total time is its move plus its `hold`, the dwell the head spends
   * on target. Dwell is part of the leg rather than a leg of its own precisely
   * because a standalone one would be a zero-distance move: those have zero
   * duration, and the advance loop below would either spin straight through it
   * or, with the guard it needs against dividing time by nothing, sit on it
   * forever.
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
      const legTime = (leg) => leg.move.duration + leg.hold;
      const beginLeg = (toAxes, hold, index, resumeAt, fromAxes, carriedTime) => ({
        leg: index,
        resumeAt,
        toAxes,
        hold,
        move: createCoordinatedMove(fromAxes, toAxes, OTOKAR_AXES),
        t: carriedTime,
      });
      const startLegAt = (index, fromAxes, carriedTime) =>
        beginLeg(legs[index].axes, legs[index].hold || 0, index, null, fromAxes, carriedTime);

      let cur = seqRef.current;
      if (cur === null) {
        /*
         * WITHDRAW BEFORE JOINING THE PROGRAM.
         *
         * The sliders' own home pose has axis 3 fully extended -- 1 800 mm, the
         * head under the floor pan -- and the program's first leg is a TRAVEL,
         * which is parked. Going straight there would run axis 1 and axis 3 at
         * once and drag the extended arm the length of the vehicle, which is
         * the exact sweep the program's three-leg shape exists to prevent. It
         * is also invisible to the leg-by-leg checks, because they start from
         * the cycle's last leg and so never see the pose the machine is
         * actually in when the engine is switched on.
         *
         * So the first thing that happens is always a straight withdrawal: the
         * rail and column hold where they are and axis 3 comes home. Only then
         * does the program start. Starting from an already-parked pose makes
         * this a zero-distance move that costs nothing.
         *
         * `phase` staggers WHICH leg this robot joins on, but it no longer
         * offsets time into the first leg. It used to, and that would now skip
         * part of the withdrawal -- a safety move is not something to start
         * halfway through.
         */
        const startLeg = Math.floor(phase) % legs.length;
        const parked = [axes[0], axes[1], 0, axes[3], axes[4]];
        cur = beginLeg(parked, 0, -1, startLeg, axes, 0);
        seqRef.current = cur;
      }

      cur.t += delta * animationSpeed;

      // Preserve any frame-time overshoot so a long frame cannot silently skip
      // part of the next leg. The `> 0` guard is what stops a program of
      // instantaneous legs from locking the loop up.
      while (cur.t >= legTime(cur) && legTime(cur) > 0) {
        const carried = cur.t - legTime(cur);
        const next = cur.resumeAt !== null && cur.resumeAt !== undefined
          ? cur.resumeAt
          : (cur.leg + 1) % legs.length;
        cur = startLegAt(next, cur.toAxes, carried);
        seqRef.current = cur;
      }

      if (cur.t >= cur.move.duration) {
        // In the dwell: hold the leg's end pose exactly rather than letting
        // sample() clamp, so a held pose is the programmed one to the digit.
        [a1, a2, a3, a4, a5] = cur.toAxes;
      } else {
        [a1, a2, a3, a4, a5] = cur.move.sample(cur.t, sampleOut.current);
      }
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
    /*
     * The chain's towed end rides with the carriage, so the fold only needs to
     * be told where that is. Everything else -- how much of the chain lies in
     * the tray, where the bend has rolled to -- falls out of the geometry in
     * otokarCableChain.js.
     */
    if (chainMaterial && chainParams) {
      chainMaterial.userData.foldUniforms.uTowed.value =
        chainParams.towedAtZeroMm + (a1 - CAD_POSE.a1) * chainParams.towedSign;
    }
    /*
     * The column's chain is towed by the axis-2 slide, so it follows a2. Its
     * mesh hangs off the CARRIAGE rather than off the slide: the fold already
     * moves the links, and putting it inside the a2 group would move them
     * twice.
     */
    if (columnChainMaterial && columnChainParams) {
      columnChainMaterial.userData.foldUniforms.uTowed.value =
        columnChainParams.towedAtZeroMm + (a2 - CAD_POSE.a2) * columnChainParams.towedSign;
    }
    if (g.a2) g.a2.position.copy(kinematics.axis2Dir).multiplyScalar((a2 - CAD_POSE.a2) * MM);
    if (g.a3) g.a3.position.copy(kinematics.axis3Dir).multiplyScalar((a3 - CAD_POSE.a3) * MM);
    if (g.a3middle) g.a3middle.position.copy(kinematics.axis3Dir).multiplyScalar((a3 - CAD_POSE.a3) * MM * 0.5);
    if (g.a4) g.a4.quaternion.setFromAxisAngle(kinematics.axis4Axis, toRad(a4 - CAD_POSE.a4));
    if (g.a5) g.a5.quaternion.setFromAxisAngle(kinematics.axis5Axis, toRad(a5 - CAD_POSE.a5));

    liveRef.current[0] = a1;
    liveRef.current[1] = a2;
    liveRef.current[2] = a3;
    liveRef.current[3] = a4;
    liveRef.current[4] = a5;
    publishTelemetry(robotId, liveRef.current);
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
            <OtokarMesh group={meshGroup} part="axis1" lod={lod} material={STRUCTURE} />
          )}

          {/* ===== The energy chain in the cable tray. Its own mesh so it can
                   carry its own colour and be driven separately the day its
                   fold is modelled; still for now. See the note above. ===== */}
          {showRails && (
            <OtokarMesh
              group={meshGroup}
              part="axis1_chain"
              lod={lod}
              material={CABLE_CHAIN}
              overrideMaterial={chainMaterial}
              onGeometry={onChainGeometry}
            />
          )}

          {/* ===== The row of vehicle supports along the rail bed. Static like
                   the runway, but its own mesh so it can carry the amber that
                   says what the bed is for. ===== */}
          {showRails && (
            <OtokarMesh group={meshGroup} part="axis1_fixtures" lod={lod} material={FIXTURES} />
          )}

          {/* ===== AXIS 1 (linear, installed +X, rides the rail) =====
                   Carries the saddle AND the axis-2 column: the column's base
                   plate is bolted to the saddle, so it travels with a1. Both
                   come out of EKSEN1 in one mesh. ===== */}
          <group name="axis-1-carriage" ref={(el) => (refs.current.a1 = el)}>
            <OtokarMesh group={meshGroup} part="axis1_carriage" lod={lod} material={CARRIAGE} />

            {/* ===== The column's energy chain. It rides the carriage, not the
                     axis-2 slide: the fold itself is what raises and lowers its
                     links, so nesting it in the a2 group would move it twice.
                     See otokarCableChain.js. ===== */}
            <OtokarMesh
              group={meshGroup}
              part="axis2_chain"
              lod={lod}
              material={CABLE_CHAIN}
              overrideMaterial={columnChainMaterial}
              onGeometry={onColumnChainGeometry}
            />

            {/* ===== AXIS 2 (linear, up the column, 0-3 350 mm) ===== */}
            <group name="axis-2-vertical" ref={(el) => (refs.current.a2 = el)}>
              {/* The axis-2 slide itself rides the column, so unlike the old
                  arrangement it belongs INSIDE the a2 group. */}
              <OtokarMesh group={meshGroup} part="axis2" lod={lod} material={COLUMN} />
              <OtokarMesh group={meshGroup} part="axis3_fixed" lod={lod} material={ARM} />
              <group name="axis-3-middle" ref={(el) => (refs.current.a3middle = el)}>
                <OtokarMesh group={meshGroup} part="axis3_middle" lod={lod} material={SLIDE} />
              </group>

              {/* ===== AXIS 3 (linear, installed -Y, toward the body) ===== */}
              <group name="axis-3-arm" ref={(el) => (refs.current.a3 = el)}>
                <OtokarMesh group={meshGroup} part="axis3_outer" lod={lod} material={SLIDE} />
                <group name="axis-4-chain-mount">
                  <OtokarMesh group={meshGroup} part="axis4" lod={lod} material={WRIST} />

                {/* ===== AXIS 4 (rotary, at the reducer centre) ===== */}
                <group name="axis-4-pivot" position={kinematics.pivots.a4.map((v) => v * MM)}>
                  <group name="axis-4-tilt" ref={(el) => (refs.current.a4 = el)}>
                    <group position={kinematics.pivots.a4.map((v) => -v * MM)}>
                      <OtokarMesh group={meshGroup} part="axis5" lod={lod} material={AXIS5_DETAIL} />

                      {/* ===== AXIS 5 (rotary, at the reducer centre) ===== */}
                      <group name="axis-5-pivot" position={kinematics.pivots.a5.map((v) => v * MM)}>
                        <group name="axis-5-azimuth" ref={(el) => (refs.current.a5 = el)}>
                          <group position={kinematics.pivots.a5.map((v) => -v * MM)}>
                            {/* Both robots share this head: identical
                                hardware, and only Robot2_Kamera.stp exports it
                                in a usable local frame. Its mount point is the
                                one assumption left in the chain. */}
                            <group
                              name="camera-mount"
                              position={kinematics.cameraMount.map((v) => v * MM)}
                              rotation={[0, 0, CAMERA_HEADING[robotId]]}
                            >
                              <mesh name="camera-flange-adapter" position={[0, 0, .05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                                <cylinderGeometry args={[.028, .028, .03, 20]} />
                                <meshStandardMaterial color="#8b959b" metalness={.8} roughness={.38} />
                              </mesh>
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
          </group>
        </Suspense>
      </group>
    </group>
  );
}

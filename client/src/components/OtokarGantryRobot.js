import React, { useRef, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
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
 *      axis2  linear   3 350 mm   vertical column           -> CAD +Z
 *        axis3  linear   1 800 mm  horizontal arm           -> CAD +Y
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
 * The STEP export captures the machine at one particular pose, and carries no
 * travel datum saying what each axis read at that moment. Sliders therefore
 * move each axis RELATIVE to the exported pose, and these are the axis values
 * that pose is taken to represent.
 *
 * a1 is derived from geometry: the axis-1 rail spans 16.207 m in X while the
 * declared travel is 16.000 m and the carriage envelope is 2.414 m wide, so
 * the two cannot both hold exactly. This value centres the 16 m sweep on the
 * rail, leaving a symmetric ~1.1 m carriage overhang at each extreme rather
 * than a 2.2 m overhang at one end.
 *
 * a2 is 0: the exported pose is taken as the BOTTOM of axis-2 travel, so the
 * slider only ever raises the column. That is forced by geometry -- the axis-2
 * assembly already reaches 502 mm below floor level at the exported pose
 * (`2_Eksen_Kablo_Traktoru`, the energy-chain carriage, running in its floor
 * trench), so treating that pose as mid-travel would drive the column 2.2 m
 * under the slab at a2 = 0.
 *
 * a3 sits at mid-travel: nothing in the CAD pins its datum down, it has no
 * floor to hit, and mid-travel keeps both slider directions plausible.
 */
const CAD_POSE = { a1: 13474, a2: 0, a3: 900, a4: 0, a5: 0 };

/*
 * Rotary axis centres, in CAD mm. NOT guesses: these are the centroids of the
 * NABTESCO cycloidal reducers that drive each axis (NABTESCO_EREF183067 in
 * EKSEN4 and EKSEN5 respectively), read straight out of the STEP assembly.
 */
const PIVOTS = {
  a4: [1840.0, -2258.2, -585.3],
  a5: [1902.8, -2258.2, -755.0],
};

/*
 * Camera head placement on the axis-5 flange. INFERRED. Robot1_Kamera.stp
 * places the head 3.9 m from its own axis-5 assembly with no usable relation
 * to it, and Robot2_Kamera.stp is centred on its own local origin, so neither
 * file states where the head actually bolts on. This hangs it just below the
 * axis-5 reducer, which is the direction that reducer's output faces.
 */
const CAMERA_MOUNT = [1902.8, -2258.2, -1010.0];

const STRUCTURE = { color: '#8d9299', metalness: 0.75, roughness: 0.5 };
const CARRIAGE = { color: '#5b6169', metalness: 0.8, roughness: 0.42 };
const ARM = { color: '#137cbd', metalness: 0.55, roughness: 0.35 };
const WRIST = { color: '#2c2d30', metalness: 0.85, roughness: 0.35 };
const CAMERA_MAT = { color: '#d8dde2', metalness: 0.45, roughness: 0.3 };

const toRad = (deg) => (deg * Math.PI) / 180;
const neg = (v) => v.map((x) => -x);
const scaled = (v) => v.map((x) => x * MM);

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
  useFrame((state, delta) => {
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
        // from leg 0, and from wherever the manual sliders last left it.
        const n = OTOKAR_DEMO_WAYPOINTS.length;
        const startLeg = Math.floor(phase) % n;
        const prevLeg = (startLeg - 1 + n) % n;
        const fromAxes = OTOKAR_DEMO_WAYPOINTS[prevLeg].axes;
        const toAxes = OTOKAR_DEMO_WAYPOINTS[startLeg].axes;
        cur = {
          leg: startLeg,
          toAxes,
          move: createCoordinatedMove(fromAxes, toAxes, OTOKAR_AXES),
          t: (phase % 1) * 3, // seconds already "into" this leg, for stagger
        };
        seqRef.current = cur;
      }

      cur.t += delta * animationSpeed;

      if (cur.t >= cur.move.duration) {
        const n = OTOKAR_DEMO_WAYPOINTS.length;
        const nextLeg = (cur.leg + 1) % n;
        const fromAxes = cur.toAxes;
        const toAxes = OTOKAR_DEMO_WAYPOINTS[nextLeg].axes;
        cur = { leg: nextLeg, toAxes, move: createCoordinatedMove(fromAxes, toAxes, OTOKAR_AXES), t: 0 };
        seqRef.current = cur;
      }

      [a1, a2, a3, a4, a5] = cur.move.sample(cur.t, sampleOut.current);
    } else {
      seqRef.current = null; // re-seed from the manual pose next time animation starts
      [a1, a2, a3, a4, a5] = axes;
    }

    if (g.a1) g.a1.position.x = (a1 - CAD_POSE.a1) * MM;
    if (g.a2) g.a2.position.z = (a2 - CAD_POSE.a2) * MM;
    if (g.a3) g.a3.position.y = (a3 - CAD_POSE.a3) * MM;
    if (g.a4) g.a4.rotation.x = toRad(a4 - CAD_POSE.a4);
    if (g.a5) g.a5.rotation.z = toRad(a5 - CAD_POSE.a5);
  });

  return (
    // CAD is Z-up, three.js is Y-up -- the same conversion the ROS-sourced
    // UR10e and Kawasaki components apply at their own roots.
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <group>
        <Suspense fallback={null}>
          {/* ===== AXIS 1 stator: floor rail, feet and support structure.
                   Static -- everything else rides it. ===== */}
          {showRails && (
            <OtokarMesh group={MESH_GROUP} part="axis1" lod={lod} material={STRUCTURE} />
          )}

          {/* ===== AXIS 1 (linear, CAD +X, 0-16 000 mm) ===== */}
          <group ref={(el) => (refs.current.a1 = el)}>
            <OtokarMesh group={MESH_GROUP} part="axis2" lod={lod} material={CARRIAGE} />

            {/* ===== AXIS 2 (linear, CAD +Z, 0-3 350 mm) ===== */}
            <group ref={(el) => (refs.current.a2 = el)}>
              <OtokarMesh group={MESH_GROUP} part="axis3" lod={lod} material={ARM} />

              {/* ===== AXIS 3 (linear, CAD +Y, 0-1 800 mm) ===== */}
              <group ref={(el) => (refs.current.a3 = el)}>
                <OtokarMesh group={MESH_GROUP} part="axis4" lod={lod} material={WRIST} />

                {/* ===== AXIS 4 (rotary about CAD X, at the reducer centre) ===== */}
                <group position={scaled(PIVOTS.a4)}>
                  <group ref={(el) => (refs.current.a4 = el)}>
                    <group position={scaled(neg(PIVOTS.a4))}>
                      <OtokarMesh group={MESH_GROUP} part="axis5" lod={lod} material={WRIST} />

                      {/* ===== AXIS 5 (rotary about CAD Z, at the reducer centre) ===== */}
                      <group position={scaled(PIVOTS.a5)}>
                        <group ref={(el) => (refs.current.a5 = el)}>
                          <group position={scaled(neg(PIVOTS.a5))}>
                            {/* The camera head is shared between the two
                                robots: identical hardware, and only
                                Robot2_Kamera.stp exports it in a usable
                                local frame. */}
                            <group position={scaled(CAMERA_MOUNT)}>
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

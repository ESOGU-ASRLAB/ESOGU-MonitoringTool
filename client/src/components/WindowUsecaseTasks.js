import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { PART_SPOT, SCREW_POINTS, TABLE_TOP } from './windowUsecaseLayout';
import { screwTraining } from './training/screwTraining';
import {
  CARRY, DOWN, FEEDER, InspectionBeam, ScrewFeeder, ScrewHead, SINK, UR_AXIS, UR_JOINTS,
  driveArm, handleReach, subSteps, keyTimes, lerp, onRail, UR_RAIL, makeScratch, presentScrew, operatorAssists, sample, screwCycle, screwInHole, setOpacity, stepPoint, stepRail,
  sweepDoorFaces,
} from './fasteningShared';

// The source table is x .336..1.056, y 1.965..2.965, top 0.855 m.
const SCREWS = SCREW_POINTS;
// The part rides the belt (top 0.845 m, clear between the side rails over
// x .58..0.90) from the infeed end to the pick point the original cell uses.
const BELT_TOP = 0.845;
const PART = { w: 0.28, h: 0.034, d: 0.3 };
const BELT_FROM = -0.3;
const BELT_TIME = 2.0;
const FADE_IN = 0.5;
const PICK = [0.742, 0.25];
// The bit rests on the part's top face while it holds the part.
const PICK_TOP = BELT_TOP + PART.h;
const PLACE_TOP = TABLE_TOP + PART.h;
// A seated screw's head centre, and where the bit meets it.
const SEAT = PLACE_TOP + 0.006;
const TIP = (head) => head + 0.006;
/*
 * Finished parts go into a tote at the table's far end (y 2.625..2.955),
 * clear of the part's own place (y 2.30..2.60). The far end of the table is
 * past the end of the arm's rail, so the carriage stops at the rail's end and
 * the arm reaches the rest of the way (onRail).
 */
const TOTE = { x: 0.695, y: 2.79, w: 0.36, d: 0.33, h: 0.09, wall: 0.012 };
const TOTE_TOP = TABLE_TOP + TOTE.wall + PART.h;
const TOTE_RAIL = UR_RAIL.max;
const PART_RAIL = onRail(PART_SPOT[1]);

/*
 * Between two parts, from the feeder (where the last screw left the arm) back
 * to the feeder (where the first screw starts): the finished part into the
 * tote, the next one off the belt and onto the table.
 */
const TRANSFER = [
  { duration: 0, rail: FEEDER[1], point: [FEEDER[0], FEEDER[1], CARRY] },
  { duration: 1.0, rail: PART_RAIL, point: [PART_SPOT[0], PART_SPOT[1], CARRY] },
  { duration: 0.7, rail: PART_RAIL, point: [PART_SPOT[0], PART_SPOT[1], PLACE_TOP] },
  { duration: 0.4, rail: PART_RAIL, point: [PART_SPOT[0], PART_SPOT[1], PLACE_TOP] },
  { duration: 0.6, rail: PART_RAIL, point: [PART_SPOT[0], PART_SPOT[1], CARRY] },
  { duration: 0.9, rail: TOTE_RAIL, point: [TOTE.x, TOTE.y, CARRY] },
  { duration: 0.6, rail: TOTE_RAIL, point: [TOTE.x, TOTE.y, TOTE_TOP] },
  { duration: 0.3, rail: TOTE_RAIL, point: [TOTE.x, TOTE.y, TOTE_TOP] },
  { duration: 0.5, rail: TOTE_RAIL, point: [TOTE.x, TOTE.y, CARRY] },
  { duration: 3.4, rail: PICK[1], point: [PICK[0], PICK[1], CARRY] },
  { duration: 0.8, rail: PICK[1], point: [PICK[0], PICK[1], PICK_TOP] },
  { duration: 0.4, rail: PICK[1], point: [PICK[0], PICK[1], PICK_TOP] },
  { duration: 0.8, rail: PICK[1], point: [PICK[0], PICK[1], CARRY] },
  { duration: 2.8, rail: PART_RAIL, point: [PART_SPOT[0], PART_SPOT[1], CARRY] },
  { duration: 0.8, rail: PART_RAIL, point: [PART_SPOT[0], PART_SPOT[1], PLACE_TOP] },
  { duration: 0.4, rail: PART_RAIL, point: [PART_SPOT[0], PART_SPOT[1], PLACE_TOP] },
  { duration: 0.6, rail: PART_RAIL, point: [PART_SPOT[0], PART_SPOT[1], CARRY] },
  { duration: 1.0, rail: FEEDER[1], point: [FEEDER[0], FEEDER[1], CARRY] },
];
const TRANSFER_AT = keyTimes(TRANSFER);
const TRANSFER_TIME = TRANSFER_AT[TRANSFER_AT.length - 1];
// Key indices: the finished part gripped and let go in the tote, the next one
// gripped on the belt and let go on the table. The next part starts down the
// belt the moment the finished one is in the tote.
const UNLOAD_GRIP = 3;
const UNLOAD_RELEASE = 7;
const GRIP = 11;
const RELEASE = 15;
const NEXT_PART_AT = TRANSFER_AT[UNLOAD_RELEASE];

const SCREW_PLANS = SCREWS.map(([sx, sy]) => screwCycle({
  approach: [sx, sy, CARRY], contact: [sx, sy, TIP(SEAT + SINK)], seated: [sx, sy, TIP(SEAT)],
}));
const { times: SCREW_TIMES } = SCREW_PLANS[0];
const FASTENING_CYCLE = SCREW_TIMES.cycle * SCREWS.length;
// Screw heads relative to the part's centre.
const HEAD_LOCAL = SEAT - (TABLE_TOP + PART.h / 2);
const screwLocal = ([sx, sy], proud = 0) => [sx - PART_SPOT[0], HEAD_LOCAL + proud, PART_SPOT[1] - sy];

function Part({ partRef, screwRefs, spinRefs }) {
  return (
    <group ref={partRef}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[PART.w, PART.h, PART.d]} />
        <meshStandardMaterial color="#8daab8" metalness={0.64} roughness={0.35} transparent />
      </mesh>
      {SCREWS.map((at, i) => {
        const [x, , z] = screwLocal(at);
        return (
          <React.Fragment key={i}>
            <mesh position={[x, PART.h / 2 + 0.001, z]}>
              <cylinderGeometry args={[0.018, 0.018, 0.002, 16]} />
              <meshStandardMaterial color="#26323b" metalness={0.55} roughness={0.5} transparent />
            </mesh>
            {screwRefs && (
              <ScrewHead
                objectRef={(node) => { screwRefs.current[i] = node; }}
                spinRef={(node) => { spinRefs.current[i] = node; }}
                position={screwLocal(at)}
                transparent
              />
            )}
          </React.Fragment>
        );
      })}
    </group>
  );
}

// An independent program for the north cell: a part arrives on the conveyor,
// the UR10e sets it on the work table and fastens it with four screws, then
// puts it in the tote as the next one comes in. The original pick/place and
// chassis inspection keep their own task engine.
export default function WindowUsecaseTasks({ active, operator = true, ur, kawasaki, spinRef, screwLoadedRef, productHeldRef, assistantHandleRef, assistantActiveRef }) {
  const root = useRef(null);
  const beam = useRef(null);
  const partRef = useRef(null);
  const toteFull = useRef(null);
  const presented = useRef(null);
  const assistHandle = useRef(null);
  const screwRefs = useRef([]);
  const spinRefs = useRef([]);
  const run = useRef({ last: null, elapsed: 0, urElapsed: 0, wasActive: false });
  const scratch = useMemo(makeScratch, []);

  const world = (out, x, y, height) => root.current.localToWorld(out.set(x, height, -y));
  const placePart = (x, y, top) => partRef.current?.position.set(x, top - PART.h / 2, -y);
  const showScrews = (show) => screwRefs.current.forEach((screw) => {
    if (!screw) return;
    screw.visible = show;
    screw.position.y = HEAD_LOCAL;
  });
  const idleTool = () => {
    spinRef.current = false;
    screwLoadedRef.current = false;
    productHeldRef.current = false;
    assistantActiveRef.current = false;
    if (assistHandle.current) assistHandle.current.visible = false;
  };
  // The wearer fastens the part in place while the UR10e parks.
  const handOverToTraining = () => {
    if (ur.groupRef.current) ur.groupRef.current.position.z = -0.25;
    placePart(PART_SPOT[0], PART_SPOT[1], PLACE_TOP);
    setOpacity(partRef.current, 1);
    showScrews(false);
    if (presented.current) presented.current.visible = false;
  };
  const holdPart = () => {
    if (!ur.toolRef.current) return;
    ur.toolRef.current.getWorldPosition(scratch.from);
    root.current.worldToLocal(scratch.from);
    partRef.current?.position.set(scratch.from.x, scratch.from.y - PART.h / 2, scratch.from.z);
  };

  // One step of the program, `h` seconds on (see subSteps).
  const advance = (h) => {
    const state = run.current;
    state.elapsed += h;
    if (screwTraining.active) {
      state.urElapsed = 0;
      ur.driveRef.current = null;
      idleTool();
      handOverToTraining();
    } else {
      state.urElapsed += h;
      const cycleTime = state.urElapsed % (TRANSFER_TIME + FASTENING_CYCLE);
      if (cycleTime < TRANSFER_TIME) {
        const step = sample(TRANSFER, cycleTime);
        if (ur.groupRef.current) ur.groupRef.current.position.z = -lerp(step.from.rail, step.to.rail, step.u);
        ur.groupRef.current?.updateMatrixWorld(true);
        world(scratch.target, ...stepPoint(step));
        driveArm(ur, UR_JOINTS, scratch.target, DOWN, UR_AXIS);
        idleTool();
        const i = step.index;
        productHeldRef.current = (i >= UNLOAD_GRIP && i <= UNLOAD_RELEASE) || (i >= GRIP && i <= RELEASE);
        let opacity = 1;
        if (i < UNLOAD_GRIP) placePart(PART_SPOT[0], PART_SPOT[1], PLACE_TOP);
        else if (i <= UNLOAD_RELEASE || (i >= GRIP && i <= RELEASE)) holdPart();
        else if (i < GRIP) {
          // The finished part lies in the tote now; the same part comes back as
          // the next one, faded in at the infeed end of the belt.
          const ride = cycleTime - NEXT_PART_AT;
          placePart(PICK[0], lerp(BELT_FROM, PICK[1], Math.min(ride / BELT_TIME, 1)), PICK_TOP);
          opacity = Math.min(ride / FADE_IN, 1);
          if (toteFull.current) toteFull.current.visible = true;
        } else placePart(PART_SPOT[0], PART_SPOT[1], PLACE_TOP);
        setOpacity(partRef.current, opacity);
        showScrews(i <= UNLOAD_RELEASE);
        presentScrew(presented.current, null, SCREW_TIMES);
      } else {
        // Each screw from the feeder, driven into the part on the table. The
        // rail follows the feeder and hole positions.
        const screwTime = cycleTime - TRANSFER_TIME;
        const current = Math.floor(screwTime / SCREW_TIMES.cycle);
        const phase = screwTime % SCREW_TIMES.cycle;
        const step = sample(SCREW_PLANS[current].keys, phase);
        const point = stepPoint(step);
        if (ur.groupRef.current) ur.groupRef.current.position.z = -stepRail(step);
        ur.groupRef.current?.updateMatrixWorld(true);
        world(scratch.target, ...point);
        driveArm(ur, UR_JOINTS, scratch.target, DOWN, UR_AXIS);
        spinRef.current = phase >= SCREW_TIMES.contact && phase < SCREW_TIMES.seated;
        screwLoadedRef.current = phase >= SCREW_TIMES.picked && phase < SCREW_TIMES.contact;
        productHeldRef.current = false;
        // The operator steadies the driver by its side handle from going down
        // onto the hole until it lifts clear.
        const assisting = operatorAssists(step) && Boolean(ur.toolRef.current);
        assistantActiveRef.current = assisting;
        if (assistHandle.current) {
          setOpacity(assistHandle.current, operator ? handleReach(step) : 0);
          if (assisting) {
            ur.toolRef.current.getWorldPosition(scratch.from);
            assistHandle.current.position.copy(root.current.worldToLocal(scratch.from));
            assistHandle.current.position.y += 0.15;
          }
        }
        placePart(PART_SPOT[0], PART_SPOT[1], PLACE_TOP);
        setOpacity(partRef.current, 1);
        screwRefs.current.forEach((screw, i) => {
          if (!screw) return;
          const hole = screwInHole(i, current, phase, SCREW_TIMES);
          screw.visible = Boolean(hole);
          if (!hole) return;
          screw.position.y = HEAD_LOCAL + hole.proud;
          if (spinRefs.current[i]) spinRefs.current[i].rotation.y = -hole.turn;
        });
        presentScrew(presented.current, phase, SCREW_TIMES);
      }
    }

    sweepDoorFaces({ elapsed: state.elapsed, kawasaki, world, root, beam, scratch });
  };

  useFrame(({ clock }) => {
    if (!root.current) return;
    const state = run.current;
    const now = clock.elapsedTime;
    const dt = state.last == null ? 0 : Math.max(0, now - state.last);
    state.last = now;
    if (!active) {
      if (state.wasActive) {
        ur.driveRef.current = null;
        kawasaki.driveRef.current = null;
        state.wasActive = false;
      }
      idleTool();
      if (beam.current) beam.current.visible = false;
      if (screwTraining.active) handOverToTraining();
      return;
    }
    const fresh = !state.wasActive;
    if (fresh) {
      state.elapsed = 0;
      state.wasActive = true;
    }
    subSteps(fresh ? 0 : dt, advance);
  }, -1);

  return (
    <group ref={root}>
      {/* The part: a plate with four holes, carried in on the conveyor. Its
          screws are its own children, so they leave with it. */}
      <Part partRef={partRef} screwRefs={screwRefs} spinRefs={spinRefs} />
      {/* Fixture clamps either side of where the part is set down. */}
      {[0.52, 0.87].map((x) => (
        <mesh key={x} position={[x, 0.873, -PART_SPOT[1]]} castShadow>
          <boxGeometry args={[0.07, 0.035, 0.11]} />
          <meshStandardMaterial color="#384a57" metalness={0.72} roughness={0.32} />
        </mesh>
      ))}
      {/* The tote for finished parts; once one is in, one is always seen. */}
      <group position={[TOTE.x, TABLE_TOP, -TOTE.y]}>
        <mesh position={[0, TOTE.wall / 2, 0]} receiveShadow>
          <boxGeometry args={[TOTE.w, TOTE.wall, TOTE.d]} />
          <meshStandardMaterial color="#2d4a63" metalness={0} roughness={0.7} />
        </mesh>
        {[[0, (TOTE.d - TOTE.wall) / 2, TOTE.w, TOTE.wall], [0, -(TOTE.d - TOTE.wall) / 2, TOTE.w, TOTE.wall],
          [(TOTE.w - TOTE.wall) / 2, 0, TOTE.wall, TOTE.d], [-(TOTE.w - TOTE.wall) / 2, 0, TOTE.wall, TOTE.d]].map(([x, z, w, d]) => (
            <mesh key={`${x}:${z}`} position={[x, TOTE.h / 2, z]} castShadow receiveShadow>
              <boxGeometry args={[w, TOTE.h, d]} />
              <meshStandardMaterial color="#2d4a63" metalness={0} roughness={0.7} />
            </mesh>
        ))}
        <group ref={toteFull} position={[0, TOTE.wall + PART.h / 2, 0]} visible={false}>
          <Part />
          {SCREWS.map((at, i) => <ScrewHead key={i} position={screwLocal(at)} visible />)}
        </group>
      </group>
      {/* A side handle on the driver, out towards the operator beside the
          table, so the operator steadies the tool without reaching over the
          part. */}
      <group ref={assistHandle} visible={false}>
        <mesh position={[0.25, 0, 0]} castShadow>
          <boxGeometry args={[0.5, 0.024, 0.024]} />
          <meshStandardMaterial color="#46535b" metalness={0.55} roughness={0.38} transparent />
        </mesh>
        <mesh position={[0.5, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.017, 0.017, 0.19, 12]} />
          <meshStandardMaterial color="#263640" metalness={0.35} roughness={0.56} transparent />
        </mesh>
        <group ref={assistantHandleRef} position={[0.5, 0, 0]} />
      </group>
      <ScrewFeeder presentedRef={presented} />
      <InspectionBeam beamRef={beam} />
    </group>
  );
}

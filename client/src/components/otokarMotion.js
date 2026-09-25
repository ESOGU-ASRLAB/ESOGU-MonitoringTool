/*
 * Trapezoidal velocity-profile motion for the Otokar gantries' demo animation.
 *
 * Every other animated thing in this project (UR10eRobot's scan sweep,
 * RailAnimator) drives a sine wave, which is fine for a robot with no
 * published motion limits to honour. The Otokar deck gives real per-axis
 * accel / cruise-speed / decel figures (otokarAxes.js), so its demo actually
 * uses them.
 *
 * Two building blocks:
 *
 *   computeTrapezoidalProfile  one axis, its own accel/cruise/decel, no
 *                              regard for what any other axis is doing.
 *   createCoordinatedMove      several axes moving to a shared waypoint
 *                              together, the way a real multi-axis
 *                              controller actually runs a programmed move:
 *                              every axis arrives at the same instant. The
 *                              axis that needs the longest sets the move's
 *                              duration, and every other axis's profile is
 *                              re-solved to take exactly that long, by
 *                              capping its cruise speed below its own
 *                              nominal value rather than by its accel/decel.
 *
 * Tests: `node --test scripts/otokar/motion.test.mjs`.
 */

/*
 * distance, accel, cruiseSpeed, decel: accel/cruiseSpeed/decel are positive;
 * distance is signed and can be zero. Units are whatever's consistent within
 * one call (mm & mm/s/s, or deg & deg/s/s).
 *
 * d_acc = v^2 / (2a) is the distance covered while accelerating to v; same
 * for d_dec with the deceleration. If the move is too short for the axis to
 * reach cruiseSpeed before it would already have to start slowing down again
 * (d < d_acc + d_dec), it falls back to a triangular profile: solve for the
 * peak speed the move actually reaches instead of assuming cruiseSpeed.
 *
 * Returns `positionAt(t)` / `velocityAt(t)` rather than plain numbers so a
 * caller (createCoordinatedMove, or a component driving one axis on its own)
 * can sample the profile at whatever time step useFrame hands it, without
 * this module needing to know anything about frames or React.
 */
export function computeTrapezoidalProfile(distance, accel, cruiseSpeed, decel) {
  const direction = distance > 0 ? 1 : distance < 0 ? -1 : 0;
  const d = Math.abs(distance);

  let tAccel = 0;
  let tCruise = 0;
  let tDecel = 0;
  let peakSpeed = 0;

  if (d > 1e-9 && accel > 0 && decel > 0 && cruiseSpeed > 0) {
    const dAcc = (cruiseSpeed * cruiseSpeed) / (2 * accel);
    const dDec = (cruiseSpeed * cruiseSpeed) / (2 * decel);

    if (d >= dAcc + dDec) {
      peakSpeed = cruiseSpeed;
      tAccel = cruiseSpeed / accel;
      tDecel = cruiseSpeed / decel;
      tCruise = (d - dAcc - dDec) / cruiseSpeed;
    } else {
      // Triangular: never reaches cruiseSpeed. d = v^2/2a + v^2/2b => solve v.
      peakSpeed = Math.sqrt((2 * d) / (1 / accel + 1 / decel));
      tAccel = peakSpeed / accel;
      tDecel = peakSpeed / decel;
    }
  }

  const duration = tAccel + tCruise + tDecel;
  const sAccelEnd = 0.5 * peakSpeed * tAccel;
  const sCruiseEnd = sAccelEnd + peakSpeed * tCruise;

  const unsignedPositionAt = (t) => {
    if (duration <= 0 || t <= 0) return 0;
    if (t >= duration) return d;
    if (t < tAccel) {
      const a = peakSpeed / tAccel;
      return 0.5 * a * t * t;
    }
    if (t < tAccel + tCruise) return sAccelEnd + peakSpeed * (t - tAccel);
    const td = t - tAccel - tCruise;
    const dec = peakSpeed / tDecel;
    return sCruiseEnd + peakSpeed * td - 0.5 * dec * td * td;
  };

  const unsignedVelocityAt = (t) => {
    if (duration <= 0 || t <= 0 || t >= duration) return 0;
    if (t < tAccel) return (peakSpeed / tAccel) * t;
    if (t < tAccel + tCruise) return peakSpeed;
    const td = t - tAccel - tCruise;
    return peakSpeed - (peakSpeed / tDecel) * td;
  };

  return {
    tAccel,
    tCruise,
    tDecel,
    duration,
    peakSpeed,
    distance: d,
    positionAt: (t) => direction * unsignedPositionAt(t),
    velocityAt: (t) => direction * unsignedVelocityAt(t),
  };
}

/*
 * Re-solves one axis's profile to take exactly `targetDuration` seconds
 * (>= its own natural minimum) by searching for a REDUCED cruise-speed cap,
 * not by changing its accel/decel. computeTrapezoidalProfile(d, a, v, b)'s
 * own duration is monotonic in v (a lower cap only ever takes longer), so
 * this is a plain bisection on v -- no separate closed-form solve needed for
 * the asymmetric-accel/decel case.
 */
function stretchToDuration(distance, accel, decel, nominalSpeed, targetDuration) {
  if (Math.abs(distance) < 1e-9) {
    // Nothing to move, so nothing to stretch -- hold in place for the move's
    // whole duration rather than searching for a speed that can't exist.
    return {
      tAccel: 0,
      tCruise: 0,
      tDecel: 0,
      duration: targetDuration,
      peakSpeed: 0,
      distance: 0,
      positionAt: () => 0,
      velocityAt: () => 0,
    };
  }

  let lo = 0;
  let hi = nominalSpeed;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const duration = computeTrapezoidalProfile(distance, accel, mid, decel).duration;
    if (duration > targetDuration) lo = mid;
    else hi = mid;
  }
  return computeTrapezoidalProfile(distance, accel, hi, decel);
}

/*
 * A move where every axis in `from`/`to` arrives together, the way a real
 * multi-axis controller runs one programmed move. `specs[i]` needs
 * `accel`, `speed` (cruise -- the deck's working speed, not `maxSpeed`,
 * which is just the axis's transit ceiling and is not used here), and
 * `decel`, matching OTOKAR_AXES's shape.
 *
 * `sample(t, out)` writes into a caller-supplied array (avoids allocating
 * every frame in a useFrame loop) and returns it.
 */
export function createCoordinatedMove(from, to, specs) {
  const naturalProfiles = from.map((f, i) =>
    computeTrapezoidalProfile(to[i] - f, specs[i].accel, specs[i].speed, specs[i].decel),
  );
  const duration = Math.max(0, ...naturalProfiles.map((p) => p.duration));

  const profiles = naturalProfiles.map((natural, i) => {
    if (natural.duration >= duration - 1e-9) return natural; // the limiting axis
    return stretchToDuration(to[i] - from[i], specs[i].accel, specs[i].decel, specs[i].speed, duration);
  });

  return {
    duration,
    sample(t, out = new Array(from.length)) {
      const clamped = Math.min(Math.max(t, 0), duration);
      for (let i = 0; i < from.length; i++) out[i] = from[i] + profiles[i].positionAt(clamped);
      return out;
    },
  };
}

/*
 * THE INSPECTION PROGRAM, AND THE ONE RULE THAT MAKES IT SAFE.
 *
 * Each robot works one region: robot 1 the UNDERBODY, robot 2 the ROOF. They
 * are on opposite rails facing each other, so splitting the vehicle this way is
 * what the cell is built to do, and it keeps the two heads in different halves
 * of the body, which is why they can run at once.
 *
 * BOTH OF THEM GO IN, AND WHERE EACH ONE ENTERS IS A MEASURED RESULT.
 *
 * Robot 1 goes under the sill. Robot 2 goes in through the WINDOW BAND and
 * looks up at the roof from inside the cabin. Neither of those is a choice of
 * style; they are the two heights at which the arm fits, and the sweep that
 * found them is scripts/otokar/bus_entry_windows.mjs with the clearance metric
 * in bus_clearance.mjs.
 *
 * At full 1 800 mm reach, by column height:
 *
 *   a2=400   head under the floor pan      326-490 mm   <- the underbody pass
 *   a2=1400  head at the waist rail          0-28 mm
 *   a2=1800  head above the waist            4-387 mm   (blocked mid-vehicle)
 *   a2=2200  head at the glazing             4-456 mm   (blocked mid-vehicle)
 *   a2=2600  head in the window band       176-296 mm   <- the roof pass
 *   a2=3000  head at the cant rail            0-17 mm
 *
 * THE ROOF CANNOT BE REACHED FROM ROOF HEIGHT. At a2=3000 and above, the head
 * meets the cant rail -- a member that runs the whole length of the vehicle --
 * and stops 20 mm past the body's side plane with 95 mm to spare. There is no
 * station where that is not true, and the clearance barely varies along the
 * bus (675, 680, 680, 676, 685, 686, 677 mm at a 400 mm reach), which is what
 * a continuous longitudinal member looks like as opposed to a row of pillars.
 *
 * An earlier version of this file read a row of "openings between pillars" at
 * roof height and concluded the opposite. Those openings were not real: the
 * clearance metric then sampled eight bounding-box corners per part, and eight
 * points are enough to miss a rail. See bus_clearance.mjs.
 *
 * So robot 2 climbs to the window band instead, reaches its full stroke -- 820
 * mm past the body's side plane, properly inside the cabin -- and tilts its
 * head up at the roof from there.
 *
 * WHY THE ROOF PASS SKIPS THE REAR-MOST STATION. At a1=1500 the head is at
 * cell X -11129 and the body's rear wall is at -11564, so the head is reaching
 * into a closed end: clearance drops to 115 mm against 217 mm or better
 * everywhere else. The rear wall is inspected from outside, by the underbody
 * robot's own rear station.
 *
 * THE RULE: THE RAIL NEVER MOVES WHILE THE HEAD IS IN THE VEHICLE.
 *
 * Axis 1 runs the length of the bus. Axis 3 reaches sideways into it. Move both
 * at once and the head sweeps a diagonal through the pillars -- which is
 * exactly what the previous four-waypoint demo did, because it drove straight
 * from one region's pose to the next and let every axis interpolate together.
 *
 * So a station is not one waypoint, it is three legs, and the structure itself
 * enforces the rule rather than a comment asking for it:
 *
 *   TRAVEL   axis 3 held at 0 at BOTH ends, so it stays 0 for the whole leg
 *            (a zero-distance trapezoid never leaves its start), while axis 1
 *            carries the carriage to the station and axes 2/4/5 pre-aim.
 *   ENTER    axis 1 held, axis 3 alone reaches in to `depth`. Then hold, which
 *            is the actual inspection: a camera needs dwell time on the target,
 *            and a demo that never pauses reads as a machine flailing.
 *   EXIT     axis 1 held, axis 3 alone withdraws to 0.
 *
 * Because TRAVEL is the only leg that moves axis 1 and it runs entirely at
 * axis 3 = 0, the head is outside the body's side plane for every millimetre of
 * rail motion. scripts/otokar/verify_inspection_program.mjs asserts this
 * against the real mounted hierarchy rather than trusting the description.
 *
 * WHERE THE NUMBERS COME FROM
 *
 * `stations`, `columnHeight` and `depth` are NOT evenly spaced or rounded to
 * taste. They are measured by scripts/otokar/bus_entry_windows.mjs, which
 * sweeps the swept corridor of the head against the body's two million
 * vertices and reports the clearance each combination leaves. The body is a
 * body-in-white -- open sides, pillars and roof bows -- so a station chosen by
 * eye drives the head through a pillar.
 *
 * `tilt` (axis 4) and `roll` (axis 5) still aim the head by hand: the camera
 * mesh's own forward axis was never characterised against the STEP data, so
 * these turn the head convincingly toward the region without claiming to be a
 * lookAt solve. See docs/otokar-cad-notes.md.
 */
export const OTOKAR_INSPECTION_PROGRAMS = {
  robot1: {
    zone: 'underbody',
    // Low enough that the outer telescope stage's top edge sits at cell
    // Z = -28 mm, a quarter metre below the body's underside, so the whole arm
    // passes under the sill rather than just the camera.
    columnHeight: 400,
    // Full axis-3 stroke. The head ends up under the floor pan, inside the
    // body's plan footprint -- this is the robot that goes into the vehicle.
    depth: 1800,
    // Camera turned up at the underfloor structure.
    tilt: 90,
    roll: 0,
    dwell: 1.8,
    // Spread across the body's length. Head X is -12653 + a1, and the body runs
    // from cell X -11564 to 290, so these five land inside the vehicle.
    stations: [1500, 4500, 7500, 10000, 12500],
  },
  robot2: {
    zone: 'roof',
    // The window band: head at cell Z 1649..1769, between the waist rail and
    // the cant rail. The one height at which the arm reaches its full stroke.
    columnHeight: 2600,
    // The whole stroke. The head ends up 820 mm past the body's side plane --
    // inside the cabin, not at its edge.
    depth: 1800,
    // Head turned up at the roof from inside. +60 deg measured best: it leaves
    // 217 mm at the tightest station against 207 mm at +45 and 63 mm at +75.
    tilt: 60,
    roll: 0,
    dwell: 1.8,
    // The rear-most station is left out on purpose -- see the note above.
    stations: [2750, 4500, 7625, 9125, 11875],
  },
};

/*
 * Expand a program into the leg list the runner consumes.
 *
 * `hold` is seconds to stand still once the leg's move has finished, and it is
 * a property of the LEG rather than a separate waypoint so a dwell can never
 * become a zero-length move -- those have zero duration, and a runner that
 * advances on elapsed >= duration would spin through them without rendering,
 * or stall on them forever.
 */
export function buildInspectionSequence(program) {
  const { columnHeight, depth, tilt, roll, dwell, stations } = program;
  const parked = (a1) => [a1, columnHeight, 0, tilt, roll];
  const legs = [];
  for (const station of stations) {
    legs.push({ name: `travel to ${station} mm`, axes: parked(station), hold: 0 });
    legs.push({
      name: `${program.zone} scan at ${station} mm`,
      axes: [station, columnHeight, depth, tilt, roll],
      hold: dwell,
    });
    legs.push({ name: `withdraw at ${station} mm`, axes: parked(station), hold: 0 });
  }
  return legs;
}

/*
 * The runner's view of a program: legs plus the axis 3 value that counts as
 * "clear of the vehicle". Exported so the verification script checks the same
 * object the component runs, not a copy of it.
 */
export const OTOKAR_INSPECTION_SEQUENCES = Object.fromEntries(
  Object.entries(OTOKAR_INSPECTION_PROGRAMS).map(([id, program]) => [
    id,
    buildInspectionSequence(program),
  ]),
);

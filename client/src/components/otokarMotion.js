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
 * Demo inspection sequence: front wall -> rear wall -> underbody -> roof, the
 * order Otokar's own deck lists for the regions this cell scans.
 *
 * These axis targets are a REPRESENTATIVE sweep, not an inverse-kinematics
 * solution:
 *   - axis 1 (rail) "near front"/"near rear" come from lining the carriage's
 *     own embedded CAD position up against the bus's measured rear anchor
 *     (see OtokarBusBody.js) -- good to within roughly a metre, not exact.
 *   - axis 2 (column height) picks round fractions of its 0-3350mm travel
 *     for wall / underbody / roof height, not a measured wall/roof height.
 *   - axis 4/5 (the camera's tilt/pan) are hand-picked per leg so the head
 *     visibly turns toward each region instead of holding one fixed pose --
 *     not a lookAt solve, since the camera mesh's own local forward axis was
 *     never characterised against the STEP data (docs/otokar-cad-notes.md).
 *
 * Axis order matches OTOKAR_AXES: [axis1_mm, axis2_mm, axis3_mm, axis4_deg, axis5_deg].
 */
export const OTOKAR_DEMO_WAYPOINTS = [
  { name: 'front wall', axes: [13000, 1400, 1400, 20, -70] },
  { name: 'rear wall', axes: [1500, 1400, 1400, -20, 70] },
  { name: 'underbody', axes: [7000, 250, 1700, 90, 0] },
  { name: 'roof', axes: [9000, 3100, 600, -90, 0] },
];

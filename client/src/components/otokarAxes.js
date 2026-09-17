/*
 * Axis specification for the Otokar MATISSE body-inspection cell.
 *
 * Single source of truth: OtokarGantryRobot drives the kinematic chain from
 * it, OtokarControlPanel builds its sliders from it, and OtokarRailAnimator
 * picks its demo ranges out of it. Keeping one table is the same discipline
 * the UR10e/Kawasaki components follow by reading their joint limits from the
 * .xacro rather than restating them.
 *
 * SOURCE: MATISSE_Rokos_Yörünge_Bilgileri.pptx (Otokar). Travel and motion
 * figures are transcribed from that deck, NOT estimated.
 *
 * ---------------------------------------------------------------------------
 * VERIFICATION STATUS -- read before trusting any of this (details and the
 * full cross-check are in docs/otokar-cad-notes.md):
 *
 *   CONFIRMED against the STEP geometry:
 *     - axis 1 travel is 16 000 mm (Robot2_EKSEN1's X extent is 16 000.0 mm
 *       exactly)
 *     - axes 4 and 5 are rotary: each carries a NABTESCO cycloidal reducer and
 *       a part literally named "{4,5}_Eksen_Reduktor_Baglanti_Braketi"
 *     - axes 1-3 are linear: INA/FAG KWVE45 / KWVE35 / KWVE25 linear guide
 *       carriages in EKSEN1 / EKSEN2 / EKSEN3 respectively
 *
 *   INFERRED, NOT CONFIRMED:
 *     - that PPTX slide order maps to CAD file number for axes 2 and 3. Their
 *       3 350 mm and 1 800 mm travels are consistent with the part envelopes
 *       (5 295 mm and 4 388 mm) but nothing in the CAD pins them down.
 *     - the angular limits. The deck gives speeds and accelerations for axes 4
 *       and 5 but no travel, so +/-180 deg below is a convention, not source
 *       data.
 *     - the camera's mount point on the axis-5 flange. See
 *       CAMERA_MOUNT in OtokarGantryRobot.js.
 *
 * NOTE ON AXIS NAMES: the deck calls these Z / Y / X / AX / AZ. Those are
 * controller axis names and they do NOT match the CAD frame -- the deck's "Z"
 * (axis 1) runs along CAD X. This file uses the deck's NUMBERS and records the
 * CAD direction each axis actually drives, so the two can't be confused.
 * ---------------------------------------------------------------------------
 */

// prettier-ignore
export const OTOKAR_AXES = [
  {
    id: 'a1', index: 0, kind: 'linear', deckName: 'Z',
    label: 'Axis 1 — long rail',
    // CAD +X for robot1. Robots are normalised into a shared frame by
    // OtokarGantryRobot, so this is the canonical direction, not per-robot.
    cadAxis: 'x',
    min: 0, max: 16000, home: 8000, step: 10, unit: 'mm',
    accel: 275, speed: 500, decel: 275, maxSpeed: 690, motionUnit: 'mm/s',
    confirmed: true,
  },
  {
    id: 'a2', index: 1, kind: 'linear', deckName: 'Y',
    label: 'Axis 2 — vertical column',
    cadAxis: 'z',
    min: 0, max: 3350, home: 1200, step: 10, unit: 'mm',
    accel: 175, speed: 300, decel: 175, maxSpeed: 800, motionUnit: 'mm/s',
    confirmed: false,
  },
  {
    id: 'a3', index: 2, kind: 'linear', deckName: 'X',
    label: 'Axis 3 — horizontal arm',
    cadAxis: 'y',
    min: 0, max: 1800, home: 600, step: 10, unit: 'mm',
    accel: 150, speed: 250, decel: 150, maxSpeed: 470, motionUnit: 'mm/s',
    confirmed: false,
  },
  {
    id: 'a4', index: 3, kind: 'rotary', deckName: 'AX',
    label: 'Axis 4 — wrist tilt',
    cadAxis: 'y',
    // The deck specifies no travel for the rotary axes; +/-180 is a convention.
    min: -180, max: 180, home: 0, step: 1, unit: '°',
    accel: 100, speed: 150, decel: 100, maxSpeed: 250, motionUnit: '°/s',
    confirmed: false,
  },
  {
    id: 'a5', index: 4, kind: 'rotary', deckName: 'AZ',
    label: 'Axis 5 — camera roll',
    cadAxis: 'z',
    min: -180, max: 180, home: 0, step: 1, unit: '°',
    accel: 100, speed: 150, decel: 100, maxSpeed: 250, motionUnit: '°/s',
    confirmed: false,
  },
];

export const OTOKAR_HOME = OTOKAR_AXES.map((a) => a.home);

/*
 * Per-robot home pose.
 *
 * The two portals share one runway and straddle the same body at different
 * stations along it -- which is what the deck means by "Robot 2's X values are
 * defined relative to Robot 1's zero". So they differ only in axis 1; every
 * other axis starts at the common home. The two stations below are spaced
 * 7 m apart over the 11.86 m body, which keeps each portal over roughly half
 * of it and keeps them from overlapping. The spacing is OURS, not Otokar's:
 * the deck gives no station separation.
 */
export const OTOKAR_ROBOT_HOME = {
  robot1: OTOKAR_AXES.map((a, i) => (i === 0 ? 4500 : a.home)),
  robot2: OTOKAR_AXES.map((a, i) => (i === 0 ? 11500 : a.home)),
};

export const clampAxis = (index, value) => {
  const a = OTOKAR_AXES[index];
  if (!a) return value;
  return Math.min(a.max, Math.max(a.min, value));
};

export const formatAxis = (index, value) => {
  const a = OTOKAR_AXES[index];
  if (!a) return String(value);
  return a.kind === 'linear'
    ? `${(value / 1000).toFixed(2)} m`
    : `${Math.round(value)}°`;
};

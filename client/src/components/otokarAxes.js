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
 * full cross-check are in docs/inspection-cell-cad-notes.md):
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
    label: 'Long rail',
    // CAD +X for robot1. Robots are normalised into a shared frame by
    // OtokarGantryRobot, so this is the canonical direction, not per-robot.
    cadAxis: 'x',
    // CLAMPED TO WHAT THE RAIL PHYSICALLY OFFERS, not to the declared travel.
    // The rail spans 16 207 mm and the carriage is 960 mm wide, so end stop to
    // end stop there is 15 247 mm of usable travel. The deck's declared
    // 16 000 mm exceeds that physical span by 753 mm. OPEN QUESTION FOR
    // OTOKAR:
    // either the rail is longer than this export, or the 16 000 mm is nominal.
    // Do not "fix" this by stretching the rail to match.
    min: 0, max: 15247, home: 0, step: 10, unit: 'mm',
    accel: 275, speed: 500, decel: 275, maxSpeed: 690, motionUnit: 'mm/s',
    confirmed: true,
  },
  {
    id: 'a2', index: 1, kind: 'linear', deckName: 'Y',
    label: 'Vertical column',
    cadAxis: 'z',
    min: 0, max: 3350, home: 1200, step: 10, unit: 'mm',
    accel: 175, speed: 300, decel: 175, maxSpeed: 800, motionUnit: 'mm/s',
    confirmed: false,
  },
  {
    id: 'a3', index: 2, kind: 'linear', deckName: 'X',
    label: 'Horizontal arm',
    cadAxis: 'y',
    min: 0, max: 1800, home: 600, step: 10, unit: 'mm',
    accel: 150, speed: 250, decel: 150, maxSpeed: 470, motionUnit: 'mm/s',
    confirmed: false,
  },
  {
    id: 'a4', index: 3, kind: 'rotary', deckName: 'AX',
    label: 'Wrist tilt',
    cadAxis: 'y',
    // The deck specifies no travel for the rotary axes; +/-180 is a convention.
    min: -180, max: 180, home: 0, step: 1, unit: '°',
    accel: 100, speed: 150, decel: 100, maxSpeed: 250, motionUnit: '°/s',
    confirmed: false,
  },
  {
    id: 'a5', index: 4, kind: 'rotary', deckName: 'AZ',
    label: 'Camera roll',
    cadAxis: 'z',
    min: -180, max: 180, home: 0, step: 1, unit: '°',
    accel: 100, speed: 150, decel: 100, maxSpeed: 250, motionUnit: '°/s',
    confirmed: false,
  },
];

export const OTOKAR_HOME = OTOKAR_AXES.map((a) => a.home);

/*
 * Per-robot reference pose from Otokar's end-view: both carriages are at the
 * cable-loop end (a1 = 0), Robot 1 reaches the lower/underbody zone and Robot
 * 2 reaches the upper/roof zone. Both Axis 3 arms are extended inward so the
 * inspection heads can enter the bus envelope.
 */
export const OTOKAR_ROBOT_HOME = {
  robot1: [0, 600, 1800, 0, 0],
  robot2: [0, 3350, 1800, 0, 0],
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

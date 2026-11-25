/*
 * WHERE THE TWO CELLS STAND IN THE BUILDING.
 *
 * One number, in one place, because it was in four.
 *
 * IFARLAB_SHIFT_X lived in DigitalTwin.js and was copied by hand into
 * verify_cell_fit.mjs, camera_framing.mjs and camera_framing_reverse.mjs, each
 * with a comment asking whoever changed it to keep the others in sync. That
 * works until someone moves the cell and does not, and then every check --
 * does it fit, does it clear the Otokar cell, is it in the opening frame --
 * silently measures a position the page no longer uses. The scripts import
 * this now, so moving the cell moves what they test.
 *
 * It is also a full vector rather than a single axis. The original shift was
 * purely +x: both cells used to hug the building's west wall, occupying
 * x -14.11..1.75 with the east side empty, and +6.18 m recentres that combined
 * range on the building's own centre. Moving the workcell along the hall needs
 * z as well.
 *
 * TWO THINGS TO KNOW BEFORE CHANGING IT.
 *
 * The Otokar cell does NOT read this. Its own +6.18 is baked into CELL_ORIGIN
 * in OtokarCell.js, so changing the value here moves the WORKCELL ALONE and
 * the aisle between the two cells changes with it. That is usually the intent;
 * it was not the intent when the shift was first introduced, which is what the
 * old "keep both in sync" comment was about.
 *
 * And the aisle is a real constraint, not a matter of taste. Run
 *
 *   node scripts/otokar/verify_cell_fit.mjs
 *
 * after any change: it reports the minimum clearance between the workcell and
 * the Otokar cell's swept volume, and fails if they overlap. At the current
 * offset that clearance is 2.98 m.
 */
export const IFARLAB_OFFSET = Object.freeze([6.18, 0, 11]);
export const OTOKAR_PICK_OFFSET = Object.freeze([-3.4, 0, 15.2]);
export const FORKLIFT_AISLE = Object.freeze({ x: -13.3, fromZ: -19.6, toZ: 0.4 });

// Same x alignment, 7 m farther into the hall (-z/north in the opening view).
// The measured fence bounds leave 2.23 m of clear space between the cells.
export const IFARLAB_COPY_OFFSET = Object.freeze([IFARLAB_OFFSET[0], IFARLAB_OFFSET[1], IFARLAB_OFFSET[2] - 7]);

// The dual-robot inspection cell is 6.6 m east of the copy.
// The measured fence bounds leave clear aisles between the cells.
export const IFARLAB_INSPECTION_OFFSET = Object.freeze([
  IFARLAB_COPY_OFFSET[0] + 6.6, IFARLAB_COPY_OFFSET[1], IFARLAB_COPY_OFFSET[2],
]);

// Door fastening sits directly south of inspection, parallel to the original
// cell: the east row shares inspection's x, the south row the original's z.
export const IFARLAB_DOOR_OFFSET = Object.freeze([
  IFARLAB_INSPECTION_OFFSET[0], IFARLAB_INSPECTION_OFFSET[1], IFARLAB_OFFSET[2],
]);

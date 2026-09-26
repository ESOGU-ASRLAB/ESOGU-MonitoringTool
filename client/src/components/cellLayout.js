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

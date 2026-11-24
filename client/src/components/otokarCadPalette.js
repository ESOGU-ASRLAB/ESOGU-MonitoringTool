import { BODY_IN_WHITE, PAINT, ACCENT, METAL, POLYMER } from './scenePalette';

/*
 * ONE PALETTE FOR THE WHOLE CELL.
 *
 * Both families are taken from Otokar's own end view of this cell, which is the
 * picture this is meant to match:
 *
 *   THE MACHINES   near-black rail bed and box sections, a PALE column mast,
 *                  and red on the drives -- the axis-2 slide and the wrist. The
 *                  machine is dark so the mast reads as its height and the red
 *                  reads as its axes.
 *   THE BODY       the CAD's structural colour coding, by member: cream roof,
 *                  green waist and roof rails, blue pillars, magenta interior
 *                  structure, dark red sills, cyan cross members.
 *
 * A neutral tonal scheme was tried on the body and taken back out. It made a
 * tidier picture, but it threw away what those colours are FOR: this is a body
 * in white on an inspection stand, and the CAD codes its structure by member so
 * it can be seen at a glance which part of the shell the head is over. Tidiness
 * is not worth that.
 */

/*
 * The body, now from BODY_IN_WHITE in the shared scene palette.
 *
 * The history of this value is worth keeping, because it went one step too far
 * twice. It began as the CAD's six-HUE part colouring -- green pillars,
 * magenta interior, cyan cross members -- which is useful inside CAD and made
 * the shell louder than the robots in the cell. That was replaced by one blue
 * hue in six values, which fixed the noise but left the vehicle at saturation
 * 0.52-0.77: a fluorescent cyan bus, and the largest object in the frame.
 *
 * What the coding is actually for survives both changes: the shell is coded by
 * member so it can be seen at a glance which part of the vehicle the head is
 * over. That information lives in the VALUE ORDER, not in the hue, so moving
 * to a realistic body-in-white grey keeps it -- roof-to-sill spread 3.14:1
 * against 3.41:1 before, at a fifth of the saturation.
 *
 * The grey has since given way to a single oxide-primer red, because a grey
 * shell disappeared among the hall's grey machines; the value order is kept.
 * See BODY_IN_WHITE for the numbers.
 */
export const OTOKAR_BODY_PALETTE = Object.freeze({ ...BODY_IN_WHITE });

/*
 * The gantries' livery.
 *
 *   NEAR-BLACK    the rail bed, the carriage and the arm's box sections.
 *                 Nearly the whole machine is one dark structural colour; the
 *                 shapes read by silhouette and highlight, not by hue.
 *   COLUMN WHITE  the mast. It is the one pale element on the machine in the
 *                 end view, and it is what gives the gantry its height against
 *                 the dark rail bed.
 *   SIGNAL RED    the drives: the axis-2 slide block riding the column, and the
 *                 wrist reducers. Red is what makes the axes legible.
 *   SATIN STEEL   the exposed linear guides and telescoping stages, the only
 *                 genuinely metallic surfaces on the machine.
 *
 * THE CHAIN IS THE ONE THING HERE THAT IS NOT ITS REAL COLOUR. A polymer energy
 * chain is black, and it was black: `#141619`, the darkest value in the cell.
 * Lying in a dark tray on a dark rail bed, it was invisible -- which was
 * tolerable while it sat still, and stopped being so once it started folding.
 * It is now the most active thing in the scene, and the fold is the point.
 *
 * So it takes a neutral grey, and the value is doing the work rather than the
 * hue: roughly twice the lightness of the rail bed it lies in and of the column
 * it climbs, and clearly darker than the satin steel of the guides and the bus
 * slings. It reads at a glance without introducing a colour.
 *
 * A muted teal was tried in between. It was certainly visible -- too visible.
 * In a grey shed full of grey steel it looked like the one plastic part in the
 * building, and it took the eye away from the machines. Being findable and
 * being loud are not the same requirement.
 *
 * The finish carries what the colour no longer does: metalness 0 and a high
 * roughness, so it stays matte polymer next to metal that is not.
 */
export const OTOKAR_ROBOT_LIVERY = Object.freeze({
  /*
   * The three structural darks now come from the shared PAINT family, one
   * value apart each. They used to be #2f3336, #1e2124 and #3f4549 -- luminance
   * 0.032, 0.015 and 0.058, which is 1.27:1 and 1.31:1 between them. Three
   * names, one value: the gantries rendered as black cut-outs with no form in
   * them. Real enamel that reads as dark still has a range in it.
   */
  graphite: PAINT.structure.color, // Rail bed and structural beams.
  black: PAINT.dark.color,         // Carriage saddle and column mast.
  armGrey: PAINT.mid.color,        // The arm's box sections.
  chain: POLYMER.chain.color,      // Energy chain. Neutral, but not a dark.
  columnWhite: '#d7dade',          // Pale panels on the mast.
  /*
   * One red and one amber in the whole hall. These were #e0a92c and #b8332f
   * here while the AGV and the guarding carried their own, so the scene had
   * several near-but-not-quite versions of the same two safety colours --
   * which is precisely how an accent stops reading as a signal.
   */
  amber: ACCENT.hazardAmber.color, // Vehicle support fixtures along the rail bed.
  signalRed: ACCENT.hazardAmber.color, // Drive blocks: axis-2 slide and wrist.
  satinSteel: METAL.machined.color, // Exposed guides and telescoping stages.
  sensorGrey: '#99a1a7',           // Camera enclosure, light against the wrist.
});

/*
 * Finish matters as much as colour: painted steel and polymer are dielectric,
 * while the exposed guides reflect the factory around them. Both robots share
 * these -- they are the same machine handed left and right.
 */
export const OTOKAR_ROBOT_MATERIALS = Object.freeze({
  /*
   * Metalness says WHAT A SURFACE IS, not how shiny it should look, and this
   * table had it wrong in the same way the warehouse shell did. Paint is a
   * dielectric: a painted steel beam is metalness ~0.05 however glossy the
   * paint. The rail bed was at 0.45 and the carriage and arm at 0.25, so every
   * painted part on the machine was being lit as though it were bare metal.
   * Only the linear guides and telescoping stages are, and they are at 0.9.
   *
   * Roughness then carries the difference between them, which it was not doing
   * either: everything sat between 0.42 and 0.55, near enough one value that
   * the whole machine scattered light identically. A sealed rail bed, a painted
   * box section, a ground guide and a polymer chain do not.
   */
  structure: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.graphite, metalness: 0.05, roughness: 0.62 }),
  chain: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.chain, metalness: 0.0, roughness: 0.85 }),
  carriage: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.black, metalness: 0.05, roughness: 0.58 }),
  // The axis-2 slide is the red block riding the column in the end view, and it
  // is the part the eye follows as the head changes height.
  column: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.signalRed, metalness: 0.05, roughness: 0.5 }),
  /*
   * The arm no longer shares the carriage's colour. They were both `black`, so
   * the contrast where the arm meets the saddle was 1.00:1 -- the two largest
   * moving parts of the machine merged into one silhouette. The arm sits a step
   * lighter now, which is also how it reads in Otokar's renders: the saddle is
   * the heaviest thing on the rail and the arm is lighter gear above it.
   */
  arm: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.armGrey, metalness: 0.05, roughness: 0.55 }),
  // Ground and exposed: the only genuinely metallic surfaces on the machine.
  slide: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.satinSteel, metalness: 0.9, roughness: 0.2 }),
  wrist: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.signalRed, metalness: 0.08, roughness: 0.48 }),
  rotary: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.graphite, metalness: 0.05, roughness: 0.5 }),
  /*
   * Lightened from #6d747a, where it sat at 1.25:1 against the red reducer it
   * is bolted to -- the head, which is the thing the whole cell exists to aim,
   * was the hardest part of the machine to pick out.
   */
  camera: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.sensorGrey, metalness: 0.2, roughness: 0.42 }),
  // The row of vehicle supports standing along each rail bed. They are the one
  // amber element in the cell and the thing that says what the bed is for.
  fixtures: Object.freeze({ color: OTOKAR_ROBOT_LIVERY.amber, metalness: 0.05, roughness: 0.55 }),
});

/*
 * THE FINISH THAT WAS ERASING THE BODY'S OWN COLOURS.
 *
 * This said metalness 0.32 under a comment claiming "low metalness keeps it
 * from going mirror-like". 0.32 is not low, and with an environment map in the
 * scene it was enough to hand the shell over to its reflection: a metallic
 * surface tints what it reflects by its base colour rather than showing that
 * colour, so the whole roof/pillar/sill value coding was being washed out and
 * the vehicle rendered as one flat near-white skeleton -- the brightest object
 * in a frame where it is meant to be the thing being measured.
 *
 * A body in white at an inspection station is bare or e-coated steel. Bare
 * steel is metallic, but what is actually wanted here is for the structure to
 * READ, and at 0.08 the shell shows its own values and still carries a dull
 * sheen. This is the one place in the palette where legibility is deliberately
 * chosen over strict physical fidelity, and it is worth saying so plainly: the
 * colour coding exists so the inspection head's position on the vehicle can be
 * followed, and a reflection that erases it defeats the purpose of the model.
 */
export const OTOKAR_BODY_MATERIAL = Object.freeze({
  color: OTOKAR_BODY_PALETTE.roof,
  metalness: 0.08,
  roughness: 0.62,
});

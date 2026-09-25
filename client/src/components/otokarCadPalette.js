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
 * The body, in the blue Otokar's own layout drawing uses for the vehicle.
 *
 * One hue, six values. The blue is what separates the thing being measured from
 * the machines measuring it -- the cell is otherwise black, grey and amber --
 * and the values keep the structure legible within it: roof lightest, sills and
 * floor darkest, so the shell still reads as roof, pillars, waist rails and
 * underfloor rather than as a flat silhouette.
 *
 * This replaced a six-HUE version (green pillars, magenta interior, cyan cross
 * members) that came from the CAD's own part colouring. That coding is useful
 * inside CAD; in the cell it made the shell louder than the robots.
 */
export const OTOKAR_BODY_PALETTE = Object.freeze({
  roof: '#6fc3e8',        // Roof panel and cant rail: the lightest blue.
  upper: '#3aa6dc',       // Outer waist and roof rails along the flanks.
  pillar: '#2e8fc4',      // Outer vertical members.
  inner: '#2878a6',       // Interior structure: inner pillars.
  crossMember: '#3f9bcb', // Roof bows and floor cross members.
  sill: '#1f6188',        // Sills, floor pan and everything under the vehicle.
});

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
  graphite: '#2f3336',    // Rail bed and structural beams.
  black: '#1e2124',       // Carriage saddle and column mast: the darkest steel.
  armGrey: '#3f4549',     // The arm's box sections, a step up from the saddle.
  chain: '#828a8c',       // Energy chain. Neutral, but not a dark: see below.
  columnWhite: '#d7dade', // Pale panels on the mast.
  amber: '#e0a92c',       // Vehicle support fixtures along the rail bed.
  signalRed: '#b8332f',   // Drive blocks: the axis-2 slide and the wrist.
  satinSteel: '#aab1b7',  // Exposed guides and telescoping stages.
  sensorGrey: '#99a1a7',  // Camera enclosure, light against the red wrist.
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
 * Bare steel, not paint: a body in white at the inspection station has no
 * topcoat on it yet. Low metalness keeps it from going mirror-like under the
 * shop lights, which at this scale reads as plastic rather than as steel. The
 * per-surface colours come from cadPartColor; this only sets the finish they
 * all share.
 */
export const OTOKAR_BODY_MATERIAL = Object.freeze({
  color: OTOKAR_BODY_PALETTE.roof,
  metalness: 0.32,
  roughness: 0.58,
});

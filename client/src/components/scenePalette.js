  /*
 * ONE PALETTE FOR THE WHOLE HALL.
 *
 * Every component used to carry its own colours, and they had drifted apart
 * until the scene read as several different pictures in one frame: a blown-out
 * white building, machines lit as though they were solid chrome, a fluorescent
 * orange AGV and floor markings that glowed. This file is the single place
 * those decisions live now.
 *
 * THREE RULES, and every value below follows from them.
 *
 * 1. FINISH BEFORE COLOUR. metalness is not a gloss slider; it says what a
 *    surface IS. Paint, polymer, rubber and concrete are dielectrics and sit
 *    at 0.05 or below however deep their shine -- the shine belongs to
 *    roughness. Only genuinely bare metal goes high. Nearly every material in
 *    the scene had this wrong: the Kawasaki's painted white shell was at 0.72,
 *    the AGV's painted body at 0.7, the UR10e's at 0.42. A painted part lit as
 *    metal takes the room's colour instead of its own and collapses to a
 *    silhouette as soon as it leaves a highlight, which is exactly what made
 *    the machines look like plastic toys.
 *
 * 2. DESATURATE, THEN SPEND SATURATION ON MEANING. A real plant is grey: mill
 *    finish, galvanising, sealed concrete, machine enamel. Saturated colour in
 *    a factory carries information -- guarding, e-stops, hazard marking, one
 *    brand hue -- so it is rationed here to the ACCENT group. If everything is
 *    coloured, nothing is signal.
 *
 * 3. SEPARATE BY VALUE, NOT BY HUE. Neighbouring surfaces are set at least
 *    1.25:1 apart in luminance, so the image still reads with the colour taken
 *    out. Hue alone fails under the hall's own warm lighting, and it fails
 *    completely for anyone colour-blind.
 *
 * scripts/otokar/verify_palette.mjs checks rules 1 and 3 mechanically and
 * fails if a value drifts; it is the reason these numbers can be trusted
 * rather than merely asserted.
 */

/* ------------------------------------------------------------------ *
 * THE LIGHTING RIG, kept here rather than in Scene.js.
 *
 * This is not really a palette value, and it lives here anyway, because the
 * palette cannot be checked without it. Colours were chosen and validated in
 * ALBEDO space -- the contrast between two paint values on a chart -- and what
 * a viewer sees is albedo multiplied by the light that reaches it and then put
 * through a tone curve. Those are not the same ordering.
 *
 * It cost a round of wrong work to learn that. The parked buses were set
 * 1.63:1, 2.68:1 and 4.39:1 apart, every pair comfortably above threshold, and
 * two of the three still arrived on screen as the same white: at these
 * intensities anything above about 0.55 albedo lands past 0.85 after tone
 * mapping, where the curve has almost no range left. The wall did the same
 * thing, which is why the hall read as a white box.
 *
 * With the rig here, verify_palette.mjs can put every value through the same
 * arithmetic the renderer does and fail on what will actually be seen.
 * ------------------------------------------------------------------ */
export const LIGHTING = Object.freeze({
  environment: 0.68, // PMREM room bounce -- the soft fill a closed shed has.
  ambient: 0.24,     // Flat term, deliberately small.
  hemisphere: 0.42,  // Sky above, floor bounce below.
  key: 1.2,          // The directional source. Dominant, so surfaces shade.
  /*
   * 0.88 rather than 0.95, and it is not a brightness control -- it is what
   * PAYS for the extra fill above.
   *
   * Raising the three fill terms by about 40% to lift the working light in
   * the hall pushes everything up, including the surfaces already near the top
   * of the curve: at the old exposure the wall landed at 0.85 and started
   * clipping again, taking the bus and machine values with it towards a single
   * white. Pulling exposure down by the same amount at the top puts the extra
   * light where it was wanted -- the shadows and the dark volume, where the
   * curve has range to spend -- and leaves the highlights where they were.
   *
   * Net: total light 2.11 -> 2.54, and nothing clips. The floor goes 0.66 ->
   * 0.69, the machine structure 0.14 -> 0.17, the dark bus 0.18 -> 0.21.
   */
  exposure: 0.88,
});

/* ------------------------------------------------------------------ *
 * THE BUILDING
 *
 * The floor is the largest surface in almost every shot, and it is what the
 * machines are read against. It had been pushed to #ffffff -- with a comment
 * beside it describing a cool, darker concrete nobody had actually applied --
 * so the hall was a white box and the dark cells sat on a pale field with
 * nothing grounding them. Sealed concrete is a mid, slightly cool grey.
 *
 * The wall panel then has to be lighter than the floor, and the structural
 * steel a step darker and cooler than the panel it holds up. Those two were
 * #fcfcfc and #fffcfc: 1.01:1 apart, which is no distinction at all, leaving
 * the entire difference between cladding and structure to the texture map.
 * ------------------------------------------------------------------ */
export const ARCHITECTURE = Object.freeze({
  floor: Object.freeze({ color: '#97cdfc', metalness: 0.0, roughness: 0.86 }),
  /*
   * Brought down from #d8dbdc. That was albedo 0.70, which this lighting rig
   * renders at 0.87 -- effectively white, and it is the surface behind
   * everything, so the whole hall read as a white box. At 0.51 it renders 0.81:
   * still plainly the lightest large surface, but with tone left in it.
   */
  wall: Object.freeze({ color: '#f1e7d1', metalness: 0.0, roughness: 0.78 }),
  steel: Object.freeze({ color: '#0471ba', metalness: 0.15, roughness: 0.52 }),
  details: Object.freeze({ color: '#07567d', metalness: 0.0, roughness: 0.6 }),
});

/* ------------------------------------------------------------------ *
 * MACHINE ENAMEL -- dielectric, every one of them.
 *
 * Roughness is what separates these, and it follows the process: a robot's
 * moulded shell is smoother than a welded steel frame, which is smoother than
 * an underbody.
 * ------------------------------------------------------------------ */
export const PAINT = Object.freeze({
  // Robot shells (UR10e, Kawasaki). Off-white rather than white: a white
  // enamel under warm hall light is never #ffffff, and leaving headroom above
  // it is what lets a highlight read as a highlight.
  /*
   * Brought down from #dcdedf, which rendered at 0.87 -- past the top of the
   * tone curve, where neighbouring values stop being distinguishable. That is
   * why the UR10e, the Kawasaki and the drone all arrived as white shapes with
   * no form: the enamel was clipping, so nothing on those arms had a highlight
   * or a shaded side left to describe it. Rule 4 in verify_palette.mjs caught
   * this one; the albedo rules could not see it.
   */
  shell: Object.freeze({ color: '#535555', metalness: 0.05, roughness: 0.38 }),
  // Secondary machine bodywork, frames, cabinets.
  body: Object.freeze({ color: '#878d90', metalness: 0.05, roughness: 0.5 }),
  // Structural machine steel: gantry frames, rail beds, guarding posts.
  structure: Object.freeze({ color: '#3d4347', metalness: 0.05, roughness: 0.62 }),
  // Joints, covers and the darkest machine parts.
  dark: Object.freeze({ color: '#2b3033', metalness: 0.05, roughness: 0.55 }),
  /*
   * One step up from `structure`, for the parts that need to read as separate
   * bodywork against it -- a gantry's arm sections against its own rail bed.
   *
   * The Otokar machine carried three structural darks at luminance 0.015,
   * 0.032 and 0.058, which is 1.27:1 and 1.31:1 apart: one value in practice.
   * The gantries were black cut-outs with no form in them, which is not what a
   * dark machine looks like -- real enamel that reads as dark still has a
   * range. The three are now 1.33:1 and 1.47:1 apart and still clearly darker
   * than the floor (2.17:1 to 4.26:1).
   */
  mid: Object.freeze({ color: '#555c60', metalness: 0.05, roughness: 0.58 }),
});

/* ------------------------------------------------------------------ *
 * ACCENTS -- the rationed group.
 *
 * These mean something on a real machine, so they are used where that meaning
 * holds and nowhere else: red for e-stops, guarding and wrist housings; amber
 * for hazard and fixture hardware; blue as the one brand hue on the arms.
 * They are all noticeably duller than the values they replace (#b55400,
 * #6babf4), because saturated pigment under factory light simply is duller --
 * and because a bright accent on every machine stops being an accent.
 * ------------------------------------------------------------------ */
export const ACCENT = Object.freeze({
  signalRed: Object.freeze({ color: '#daa410', metalness: 0.05, roughness: 0.48 }),
  hazardAmber: Object.freeze({ color: '#bf8b2c', metalness: 0.05, roughness: 0.55 }),
  brandBlue: Object.freeze({ color: '#003054', metalness: 0.05, roughness: 0.42 }),
});

/* ------------------------------------------------------------------ *
 * BARE METAL -- the only group allowed to be metallic.
 *
 * Machined slides and rail heads are polished by use, so they are the
 * smoothest thing in the hall; extrusion and galvanising are not.
 * ------------------------------------------------------------------ */
export const METAL = Object.freeze({
  aluminium: Object.freeze({ color: '#1e2930', metalness: 0.85, roughness: 0.38 }),
  machined: Object.freeze({ color: '#9897a8', metalness: 0.9, roughness: 0.22 }),
  galvanised: Object.freeze({ color: '#494a4b', metalness: 0.8, roughness: 0.52 }),
  worn: Object.freeze({ color: '#343d43', metalness: 0.75, roughness: 0.45 }),
});

/* ------------------------------------------------------------------ *
 * POLYMER AND RUBBER -- dielectric, and rough.
 * ------------------------------------------------------------------ */
export const POLYMER = Object.freeze({
  chain: Object.freeze({ color: '#5c4927', metalness: 0.0, roughness: 0.85 }),
  rubber: Object.freeze({ color: '#000000', metalness: 0.0, roughness: 0.9 }),
  // Vehicle glazing: a dielectric mirror. Roughness near zero is what makes a
  // window read as glass instead of as dark paint.
  glass: Object.freeze({ color: '#010b0f', metalness: 0.0, roughness: 0.12 }),
});

/* ------------------------------------------------------------------ *
 * VEHICLES.
 *
 * THE INSPECTION BODY was the loudest object in the scene and the largest: a
 * six-value blue running from #6fc3e8 to #1f6188, at saturations of 0.52 to
 * 0.77. That came from the CAD's own structural colour coding, and the reason
 * for keeping a coding at all is sound -- the shell is coded by member so it
 * can be seen at a glance which part of the vehicle the inspection head is
 * over, and a flat neutral shell throws that away.
 *
 * The coding does not actually live in the hue -- it lives in the VALUE
 * ORDER, roof lightest down to sills darkest -- so it has survived every
 * change of colour since:
 *
 *                   saturation        roof-to-sill spread
 *   CAD blue        0.52 - 0.77       3.41:1
 *   steel grey      0.08 - 0.22       3.14:1
 *   darker grey     0.18 - 0.23       2.80:1
 *   oxide primer    0.52 - 0.66       2.54:1
 *   lighter primer  0.62 - 0.70       2.53:1
 *
 * The two greys were the realistic reading -- bare or e-coated steel -- and
 * both lost the vehicle. The hall is grey machines, grey rails and grey-blue
 * steel on a pale floor, and a grey shell among them read as one more piece of
 * the building rather than as the thing the cell exists to inspect; darkening
 * it only traded a white ghost for a grey one.
 *
 * So the body carries a colour again, but ONE colour, and a real one: the
 * red shop primer a welded bus skeleton wears before paint. It is the only
 * warm red in a hall that is otherwise blue, beige and grey, and it stays
 * clear of the gantries' own gold and amber, which sit further round towards
 * yellow. One hue in six values, so it is a primed vehicle, not the multi-hue
 * CAD coding the first round took out.
 *
 * The first primer was a dark oxide, and its lower members rendered at 0.12
 * to 0.29 -- brown, and back into the same murk as the gantries' darks. The
 * ramp now sits a step lighter and more vivid, rendering 0.72 at the roof down
 * to 0.32 at the sills, so the whole shell reads as colour and not only its
 * top. What carries it against the pale wall and floor is the hue rather than
 * the value (roof 2.31:1 off the wall, pillars 3.04:1 off the floor), and the
 * lift also separates the shell from the machines around it: sills 1.40:1 off
 * the rail bed and pillars 1.33:1 off the gantry arm, where the dark oxide was
 * 1.11:1 and 1.14:1.
 * ------------------------------------------------------------------ */
export const BODY_IN_WHITE = Object.freeze({
  roof: '#598474',      // Roof panel and cant rail: the lightest.
  upper: '#598474',       // Outer waist and roof rails along the flanks.
  crossMember: '#598474', // Roof bows and floor cross members.
  pillar: '#598474',      // Outer vertical members.
  inner: '#598474',       // Interior structure: inner pillars.
  sill: '#598474',        // Sills, floor pan and everything under the vehicle.
});

/*
 * THE PARKED PRESENTATION BUSES. Three liveries that had drifted into three
 * near-identical bright orange stripes (saturation 0.80) over bodies that did
 * not separate from each other or from the floor -- the graphite one measured
 * 1.13:1 against the concrete, so it would have sunk into it, with its own
 * stripe at 1.02:1 against its own flank.
 *
 * The stripe is gone entirely now. Each vehicle is one paint colour over flank
 * and roof, with the chassis skirt a step off it rather than a second livery
 * colour, and the three are told apart by value AND hue: sand gold, fleet
 * green and dark graphite, rendering 0.76, 0.47 and 0.14 -- far enough apart
 * that no two read as the same vehicle. The glazing is dark glossy glass,
 * opaque: see Bus.js for why the see-through version striped.
 *
 * Roofs are not checked against their bodies. The opening camera sits at 1.3 m
 * -- below the vehicles' waistline -- so a parked bus's roof is never in shot,
 * and separating it would spend contrast where nothing can see it.
 */
export const BUS_LIVERY = Object.freeze({
  /*
   * Sand gold, a plain fleet livery in the warm yellow the other two lack. It
   * replaces fleet white, which stopped separating from the floor once the
   * floor went to pale blue (1.20:1); it is also the only warm, light hue
   * standing on that floor.
   */
  sand: Object.freeze({ body: '#bf9f5f', chassis: '#6b5d45' }),
  /*
   * Was #3f6b8c, a corporate blue. Changed because blue is already doing two
   * other jobs in this hall -- it is the accent on both IFARLAB arms and the
   * cast on the inspection body's steel -- so a blue bus made a fourth blue
   * object in a scene whose whole colour discipline is that saturation should
   * mean something. A muted fleet green is a real livery colour and is the
   * only thing in the building wearing it.
   */
  forest: Object.freeze({ body: '#4e7265', chassis: '#6b8d80' }),
  /*
   * The dark one, pushed further down so it separates from the green: at
   * #414a51 the two rendered 0.11 apart, which on screen is one dark bus
   * twice. Now 0.33 apart.
   */
  graphite: Object.freeze({ body: '#373f45', chassis: '#4e575e' }),
});

/* ------------------------------------------------------------------ *
 * FLOOR MARKING.
 *
 * This was a MeshBasicMaterial with toneMapped={false}, which means it ignored
 * the scene's lighting and tone mapping entirely and drew at full intensity --
 * a glowing yellow stripe on a concrete floor. Paint on concrete is lit like
 * everything else on that floor.
 * ------------------------------------------------------------------ */
export const MARKING = Object.freeze({
  bay: Object.freeze({ color: '#c9a33f', metalness: 0.0, roughness: 0.8 }),
});

/* ------------------------------------------------------------------ *
 * THE ROOM ITSELF.
 *
 * The background and fog were #dfe8ef, a pale sky blue. That is a reasonable
 * colour for an exterior and the wrong one for the inside of a shed: it put a
 * cold daylight wash behind every wall opening and lifted the far end of the
 * hall into haze. Interior air is neutral and slightly warm from the lamps.
 * ------------------------------------------------------------------ */
export const ROOM = Object.freeze({
  background: '#c8ccce',
  fog: '#c8ccce',
  ambient: '#f2f4f6',
  lamp: '#fff2e0',
  skyBounce: '#f6f9fb',
  groundBounce: '#7e868d',
});

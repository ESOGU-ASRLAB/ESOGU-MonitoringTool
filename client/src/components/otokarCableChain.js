import * as THREE from 'three';

/*
 * THE AXIS-1 ENERGY CHAIN, FOLDED THE WAY A REAL ONE FOLDS.
 *
 * `Kablo_Traktoru` is the 8.5 m chain lying in the cable tray beside the rail.
 * One end is anchored to the rail; the other is towed by the carriage. The
 * difference between the two -- up to 8.5 m of it -- is taken up by the chain
 * doubling back on itself around a U-bend that rolls along the tray.
 *
 * NOTHING RIGID CAN DO THIS, which is why two earlier attempts failed and are
 * worth recording. Driving the whole mesh at HALF the carriage's travel gives
 * the bend its real speed, but the chain does not move at the bend's speed, and
 * the carriage -- at full speed -- ends up inside its own chain from 500 mm of
 * travel onwards. Driving it 1:1 keeps the towed end attached but carries the
 * anchored end with it, and at full stroke the whole chain hangs 8.8 m past the
 * end of its own tray. Leaving it still, which is what shipped in between, is
 * merely wrong rather than impossible.
 *
 * So the links are laid along a computed path instead, in the vertex shader:
 * one draw call, and the geometry never leaves the GPU.
 *
 * WHAT IS MEASURED AND WHAT IS ASSUMED
 *
 * Measured, from the mesh itself (see foldParamsFromBox):
 *   L        the chain's length, its own X extent: 8 533 mm.
 *   section  the chain's height, its own Z extent: 380 mm.
 *
 * Measured, from the assembly (ANCHOR_X_MM / TOWED_X_AT_ZERO_MM below):
 *   the anchor bracket's position, and where the towed end sits at a1 = 0.
 *
 * DERIVED, because the geometry leaves it no freedom:
 *   the bend radius. A chain of length L spanning a distance d spends PI*r of
 *   itself in the bend, so it reaches only d <= L - PI*r. The towed end has to
 *   follow the carriage over its whole travel, and the furthest it ever gets
 *   from the anchor is 8 124 mm, so PI*r <= L - 8 124 and the radius cannot
 *   exceed about 130 mm. That is the constraint the chain's own length and the
 *   anchor's position put on it, and it is what `foldParamsFor` computes.
 *
 * TWO WRONG VERSIONS, both caught by cable_chain.test.mjs rather than by
 * reading the code, which is why that file exists:
 *
 *   The anchor was first put at the chain's own +X end, because the exported
 *   pose is straight. That needs the chain to span its entire length with no
 *   bend left over, and the towed end came up 597 mm short of the carriage. The
 *   exported pose is how the CAD drew the part, not a pose the machine holds.
 *
 *   The bend radius was then assumed to be half the chain's section, 190 mm, on
 *   the grounds that the runs stack. With the anchor where Otokar actually put
 *   it that leaves the chain 188 mm short at full stroke. The radius is not
 *   free to be assumed; the reach fixes it.
 *
 * A NOTE ON THE ANCHOR'S POSITION. The reach requirement puts the anchor in a
 * band around X -3 875, the midpoint of the towed end's travel. Otokar's
 * bracket is at -4 376, which is 500 mm outside the middle of that band -- so
 * the chain is only just long enough, and it runs out 188 mm before the rail
 * does. Read the other way, the chain implies a usable stroke of about
 * 15 059 mm against the 15 247 mm this model drives axis 1 over. That is a
 * 1.2 % disagreement between two independent parts of the same CAD, and it sits
 * alongside the axis-1 travel question already open in otokarAxes.js.
 */

/*
 * The anchor, measured off `1_Eksen_Kablo_Traktoru_Braketi_1` in
 * Robot1_EKSEN1.stp: X [-4406, -4346], so -4376 at its centre. It is the
 * bracket that stays put -- bracket 2 is the one bolted to the carriage.
 */
export const ANCHOR_X_MM = -4376;

/*
 * Where the chain's towed end sits when the carriage is at a1 = 0, measured off
 * `1_Eksen_Kablo_Traktoru_Braketi_2` at X [-11559, -11439]. It travels with the
 * carriage from there.
 */
export const TOWED_X_AT_ZERO_MM = -11499;

/*
 * Which way each chain lies. `arc` is the direction it runs, `sep` the
 * direction its two runs are separated in, and the shader works in that basis
 * so one fold serves both chains. The axis-1 chain runs along the rail (cell X)
 * and doubles back in height (cell Z); the axis-2 chain runs up the column
 * (cell Z) and doubles back across it (cell Y).
 *
 * `towedSign` is which way the towed end moves as the axis value grows.
 */
export const AXIS1 = Object.freeze({
  arc: 'x',
  sep: 'z',
  arcVector: new THREE.Vector3(1, 0, 0),
  sepVector: new THREE.Vector3(0, 0, 1),
  anchorMm: ANCHOR_X_MM,
  towedAtZeroMm: TOWED_X_AT_ZERO_MM,
  towedSign: 1,
  // The loop lies on the -X side of the anchor, where the carriage starts.
  foldDir: -1,
  // Anchored at the mesh's +X end; the -X end is the one beside the carriage.
  arcOriginSide: 'max',
});

/*
 * THE AXIS-2 CHAIN, up the column.
 *
 * Same fold, turned on its side: it runs vertically (cell Z) and its two runs
 * are separated across the column (cell Y). Its towed end is bolted to the
 * axis-2 slide, so it rises and falls with the column height.
 *
 * ITS ANCHOR IS DERIVED, NOT MEASURED, and that is a real difference from the
 * axis-1 chain. The export draws this one hanging straight down from the slide
 * to cell Z -1866 -- 498 mm BELOW the factory floor -- with its own lower
 * bracket at -1328, also underground. That is not a pose the machine can hold,
 * so neither the chain's drawn ends nor its bracket can be read as the
 * installed anchor. (It is also why the chain had to be lifted out of the axis2
 * mesh in the first place: left in, it dragged the column through the floor
 * rail at every working height.)
 *
 * What the geometry does fix is where the anchor CAN be. The slide's
 * attachment travels from cell Z -12 to 3338, and a chain of length L reaches
 * only L - PI*r, so the anchor has to sit within that of both ends -- which
 * puts it at the travel's midpoint, Z 1663, with almost no room either side.
 * The chain is 1 930 mm long against a 3 350 mm stroke, so the reach is spent
 * almost entirely and the bend comes out around 73 mm.
 *
 * That tightness is the same story the axis-1 chain tells: the cable runs in
 * this export are a little short for the strokes the deck declares.
 */
export const AXIS2 = Object.freeze({
  arc: 'z',
  sep: 'y',
  arcVector: new THREE.Vector3(0, 0, 1),
  sepVector: new THREE.Vector3(0, 1, 0),
  // Midpoint of the slide attachment's travel -- the only place the anchor fits.
  anchorMm: 1663,
  // The top of the axis-2 slide at a2 = 0, from the converted axis2 mesh.
  towedAtZeroMm: -12,
  towedSign: 1,
  /*
   * The loop rides ABOVE the anchor, and the chain drapes over it and down to
   * the slide. This was -1 first, putting the loop below the anchor -- which
   * meant that with the slide at the bottom the chain ran down PAST it, turned,
   * and came back up, leaving the loop underneath the slide and in the
   * carriage's way. A column chain hangs the other way: up from the fixed
   * point, over the top, down to what it feeds.
   */
  foldDir: 1,
  // Anchored at the mesh's bottom; the top is the end bolted to the slide.
  arcOriginSide: 'min',
});

/*
 * Robot 2 is robot 1 mirrored across the bus, so its column's chain doubles
 * back the other way. Only the separation direction flips; the chain still runs
 * up the same Z and its anchor is at the same height.
 */
export const AXIS2_MIRRORED = Object.freeze({
  ...AXIS2,
  sepVector: new THREE.Vector3(0, -1, 0),
});

/*
 * Reads the model's parameters off the chain mesh's own bounding box, in the
 * cell's CAD frame, in millimetres. Taking them from the geometry rather than
 * writing them down means a rebuilt mesh cannot silently disagree with the
 * shader driving it -- and the two robots' chains differ by a couple of
 * millimetres, so there is no single pair of numbers to write down anyway.
 */
export function foldParamsFromBox(box, strokeMm, axis = AXIS1) {
  const size = {
    x: (box.max.x - box.min.x) * 1000,
    y: (box.max.y - box.min.y) * 1000,
    z: (box.max.z - box.min.z) * 1000,
  };
  const centre = new THREE.Vector3(
    ((box.min.x + box.max.x) / 2) * 1000,
    ((box.min.y + box.max.y) / 2) * 1000,
    ((box.min.z + box.max.z) / 2) * 1000,
  );

  const lengthMm = size[axis.arc];
  const sectionMm = size[axis.sep];

  /*
   * Which end of the mesh is the anchored one, in its own coordinates. The
   * axis-1 chain is anchored at its +X end and towed from -X; the axis-2 chain
   * hangs from the slide at its top, so its anchored end is the bottom.
   */
  const arcOriginMm =
    (axis.arcOriginSide === 'min' ? box.min : box.max)[axis.arc] * 1000;

  /*
   * The furthest the towed end ever gets from the anchor, over the whole of
   * the axis's travel. This is what the chain has to be able to span, and it is
   * what leaves the bend radius no room to be chosen.
   */
  const reachMm = Math.max(
    Math.abs(axis.towedAtZeroMm - axis.anchorMm),
    Math.abs(axis.towedAtZeroMm + strokeMm * axis.towedSign - axis.anchorMm),
  );
  // 0.9 leaves a little of the chain's length unspent at the extreme rather
  // than having it dead straight with the bend squeezed to nothing.
  const bendRadiusMm = Math.max(((lengthMm - reachMm) / Math.PI) * 0.9, 1);

  return {
    axis,
    arcAxis: axis.arcVector,
    sepAxis: axis.sepVector,
    arcOriginMm,
    anchorMm: axis.anchorMm,
    towedAtZeroMm: axis.towedAtZeroMm,
    towedSign: axis.towedSign,
    foldDir: axis.foldDir,
    lengthMm,
    sectionMm,
    reachMm,
    /*
     * Mid-plane of the run as exported: the path is built through the centre of
     * the section and each vertex keeps its own offset from it.
     *
     * PROJECTED ONTO THE SEPARATION VECTOR, not read off the axis by name. The
     * shader measures a vertex with dot(position, sepVector), so for robot 2 --
     * whose chain folds the other way across its column, sepVector (0,-1,0) --
     * that coordinate is -y. Taking centre.y there instead of -centre.y is off
     * by twice the chain's distance from the origin: 7.2 m, which threw robot
     * 2's chain clean out of the cell while robot 1's, with sepVector (0,0,1),
     * looked fine.
     */
    centreSepMm: centre.dot(axis.sepVector),
    /*
     * NOT the section height, though it looks like it should be. The bend is
     * what joins the two runs, so the gap between them IS the bend's diameter;
     * choosing them separately tears the chain open at the turn, by exactly the
     * difference. The radius is already pinned by the reach, so this follows.
     *
     * It comes out at about 234 mm against a chain 380 mm deep, which means the
     * runs would have to overlap -- a real chain cannot do that. Read as a
     * statement about the hardware rather than about the drawing: either the
     * real chain is longer than this export, or the rail's usable travel is
     * shorter than the 15 247 mm driven here. See the note on the anchor above.
     */
    runSpacingMm: bendRadiusMm * 2,
    bendRadiusMm,
  };
}

/*
 * The path, as the shader walks it.
 *
 * Arc length s runs from the anchored end. With the anchor at xa, the towed end
 * at xc, a chain of length L and a bend of radius r:
 *
 *   lower run   length A, from xa toward the carriage
 *   bend        length PI*r, a half turn
 *   upper run   length B, back toward the carriage's side
 *
 * Both ends lie on the same side of the bend, so A + B = L - PI*r and
 * |A - B| = |xc - xa|. That gives A and B directly, with no search and no
 * iteration -- which is what makes this cheap enough to run per vertex.
 */
const FOLD_CHUNK = /* glsl */`
  uniform vec3 uArcAxis;      // the direction the chain runs
  uniform vec3 uSepAxis;      // the direction the two runs are separated in
  uniform float uArcOrigin;   // the chain's own anchored END, in mesh coords
  uniform float uAnchor;      // where that end attaches, in cell coords
  uniform float uTowed;       // towed end position along uArcAxis, mm
  uniform float uLength;
  uniform float uRadius;
  uniform float uCentreSep;   // mid-plane of the run as exported, along uSepAxis
  uniform float uSpacing;
  uniform float uFoldDir;     // which way the loop lies. FIXED by the install.

  vec3 foldGantryChain(vec3 p) {
    vec3 mm = p * 1000.0;
    float along = dot(mm, uArcAxis);
    float across = dot(mm, uSepAxis);
    // Whatever is left once the two driven directions are taken out: the
    // chain's width. It rides through the fold untouched.
    vec3 rest = mm - uArcAxis * along - uSepAxis * across;

    /*
     * Arc length from the anchored END OF THE MESH -- not from the anchor's
     * position in the cell. They are different numbers and conflating them was
     * a real bug: the axis-2 chain's mesh lies at Z -1866..68 while its anchor
     * attaches at Z 1663, so measuring from the anchor gave s = 1595..3529 for
     * a chain only 1934 mm long. The far end came out 595 mm above the top of
     * the column, hanging in mid-air.
     */
    float s = abs(along - uArcOrigin);           // 0 .. uLength
    float u = across - uCentreSep;               // offset across the section
    /*
     * SIGNED, and the fold direction is a constant rather than sign(t).
     *
     * Deriving the direction from which side the towed end is on looks right
     * and is not: the moment the carriage crosses the anchor the sign flips and
     * the loop jumps to the other side of it -- eight metres, in one frame. A
     * chain's fold is fixed by how it was installed; it does not reverse
     * because the carriage drove past the fixed point.
     *
     * With the direction held, the loop simply walks in as the towed end goes
     * out: A shrinks from most of the chain to almost none, continuously,
     * across the whole travel and straight through the anchor.
     */
    float t = uTowed - uAnchor;
    float dir = uFoldDir;
    float bendLen = 3.14159265 * uRadius;
    float straight = max(uLength - bendLen, 0.0);

    float a = clamp((straight + dir * t) * 0.5, 0.0, straight);
    float bend = uAnchor + dir * a;              // where the turn sits
    float near = uCentreSep;                     // the run the anchor is on
    float far = uCentreSep + uSpacing;           // the run the towed end is on
    float mid = (near + far) * 0.5;

    float outAlong;
    float outAcross;
    if (s <= a) {
      outAlong = uAnchor + dir * s;
      outAcross = near + u;
    } else if (s <= a + bendLen) {
      float t = (s - a) / uRadius;               // 0 .. PI through the turn
      // The section rotates with the tangent, so the offset turns with it.
      outAlong = bend + dir * (uRadius + u) * sin(t);
      outAcross = mid - (uRadius + u) * cos(t);
    } else {
      // Past the half turn the chain is upside down, so the offset flips.
      outAlong = bend - dir * (s - a - bendLen);
      outAcross = far - u;
    }

    vec3 outMm = rest + uArcAxis * outAlong + uSepAxis * outAcross;
    return outMm * 0.001;
  }
`;

/*
 * Installs the fold on a material. The uniforms object is returned so the
 * component can move the carriage every frame without rebuilding the shader --
 * recompiling a shader per frame would cost far more than the fold saves.
 */
let foldingChainSerial = 0;

export function makeFoldingChainMaterial(base, params) {
  const uniforms = {
    uArcAxis: { value: params.arcAxis },
    uSepAxis: { value: params.sepAxis },
    uArcOrigin: { value: params.arcOriginMm },
    uAnchor: { value: params.anchorMm },
    uTowed: { value: params.towedAtZeroMm },
    uLength: { value: params.lengthMm },
    uRadius: { value: params.bendRadiusMm },
    uCentreSep: { value: params.centreSepMm },
    uSpacing: { value: params.runSpacingMm },
    uFoldDir: { value: params.foldDir },
  };

  const material = new THREE.MeshStandardMaterial({
    color: base.color,
    metalness: base.metalness,
    roughness: base.roughness,
    // No NORMAL accessor in these GLBs, so three derives normals per fragment.
    // That is what makes displacing positions here enough: the lighting follows
    // the folded geometry without a normal to rebuild.
    flatShading: true,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FOLD_CHUNK}`)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed = foldGantryChain(transformed);',
      );
  };
  /*
   * A cache key UNIQUE TO THIS MATERIAL, and it has to be.
   *
   * It was a single shared string, on the reasoning that all four chains run
   * the same shader source and could share one compiled program. They can --
   * but `onBeforeCompile` only runs when a program is CREATED, and that is
   * where the uniforms are attached. With one key, the first chain to compile
   * got its uniforms bound and the other three reused its program and its
   * values: the column chains were being folded with the RAIL chain's anchor
   * and arc axis, so they ignored the column height entirely and came out
   * shaped wrong. Four programs instead of one is the price of four chains
   * that each know where they are.
   */
  const key = `gantry-folding-chain-${foldingChainSerial += 1}`;
  material.customProgramCacheKey = () => key;
  material.userData.foldUniforms = uniforms;
  return material;
}

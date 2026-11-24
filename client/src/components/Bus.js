import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BUS_LIVERY } from './scenePalette';
import VehicleLamps from './VehicleLamps';
import { useRealism } from './realismContext';
import { alignGlazingNormals, createBusGlazing, projectBusGlazing, writeGlazingUv } from './busGlazing';

// Parked presentation buses, separate from the Otokar inspection-body CAD.
// The old bus asset is Y-up and in centimetres, hence its 0.01 scale.

/*
 * FLAT SHADING, AND THE DIAGONAL "SHADOW" IT FIXES.
 *
 * The parked buses carried a dark wedge sweeping diagonally across the lower
 * body, which looked like a shadow and was not one. The current realistic
 * mode casts floor shadows, while the body itself does not receive them.
 *
 * It was a shading artefact, and one introduced here: this asset carries
 * POSITION and nothing else -- no NORMAL -- so GLTFLoader falls back to
 * geometry.computeVertexNormals(), which AVERAGES a normal across every
 * triangle sharing a vertex. That is the right answer on a curved surface and
 * the wrong one on a box. The optimisation pass that shrank this file from
 * 412 KB to 84 KB ran `weld` first, which merged the split vertices that used
 * to sit along the panel edges, so after it the averaging ran straight across
 * corners that should be hard and smeared a gradient over flat panels.
 *
 * flatShading derives the normal per fragment from the triangle itself, so a
 * flat panel shades uniformly and a corner stays a corner. The same reasoning
 * is already in OtokarMesh for the same reason: these meshes have no normals.
 *
 * The honest alternative is re-exporting without the weld, which would keep
 * the smooth roof genuinely smooth. That asset is not in the repo any more, so
 * this is the fix available; it costs faceting on the roof curve, which at
 * 46 k triangles is barely visible and is a fair trade against a wedge that
 * read as a defect in the model.
 */
const BUS_URL = process.env.PUBLIC_URL + '/assets/bus/bus.glb';
const BUS_SCALE = 0.01;

/*
 * From BUS_LIVERY in the shared scene palette. Each vehicle is one paint
 * colour now; the three are told apart by that colour alone, without a stripe.
 */
const LIVERIES = Object.freeze({
  sand: { ...BUS_LIVERY.sand },
  forest: { ...BUS_LIVERY.forest },
  graphite: { ...BUS_LIVERY.graphite },
});

/*
 * Tyres and underbody. The bottom fifth of the vehicle is all wheel, arch and
 * skirt, and the source carries no material IDs to separate them, so this one
 * black covers the lot -- which is what it should be anyway.
 */
const TYRE = new THREE.MeshStandardMaterial({ color: '#191d20', metalness: 0, roughness: 0.95, flatShading: true });

// The source shell has overlapping skin and inner panels. Both viewer
// modes use the same opaque tinted exterior, with separate glass and rubber
// finishes so the windows do not read as a single painted stripe.
let glazing;
const geometryCache = new WeakMap();

/*
 * THE WHEELS, CUT OUT OF THE BODY SO THEY CAN TURN.
 *
 * The source is one mesh with no parts, so the wheels were painted by height
 * like everything else: black below 0.6 m, skirt and body colour above -- which
 * put the top of every tyre in the paint. They are now lifted out by where they
 * are, measured off the mesh in its own centimetres:
 *
 *   axles     x = 233 (front, under the raked nose) and x = -186 (rear), both
 *             at y = 47 -- the front from a circle fit to the tyre wall, the
 *             rear from where its tread touches the ground (its wall is buried
 *             in the wheel arch and would not fit cleanly)
 *   tyre      radius 50; wall from |z| = 76 out to the body side
 *
 * Every triangle wholly inside one of those four cylinders becomes part of a
 * wheel: its own mesh, centred on its axle, so it can be spun about it. Tyre
 * rubber is black; the hub, inside radius 30, is steel grey.
 */
const AXLES_CM = [233, -186];
const AXLE_Y_CM = 47;
const TYRE_RADIUS_CM = 50;
const HUB_RADIUS_CM = 30;
const TYRE_INNER_Z_CM = 76;
export const WHEEL_RADIUS_M = TYRE_RADIUS_CM * BUS_SCALE;
const HUB = new THREE.MeshStandardMaterial({ color: '#8b9196', metalness: 0.6, roughness: 0.4, flatShading: true });
const WHEEL_MATERIALS = [TYRE, HUB];

// Which wheel (0-3) a triangle belongs to, or -1.
function wheelOf(triangle) {
  for (let a = 0; a < AXLES_CM.length; a += 1) {
    const inside = triangle.every(([x, y, z]) => Math.hypot(x - AXLES_CM[a], y - AXLE_Y_CM) <= TYRE_RADIUS_CM + 1
      && Math.abs(z) >= TYRE_INNER_Z_CM);
    if (!inside) continue;
    const side = triangle[0][2] > 0 ? 1 : 0;
    if (triangle.every(([, , z]) => (z > 0 ? 1 : 0) === side)) return a * 2 + side;
  }
  return -1;
}

// A wheel's triangles as a geometry centred on its axle: tyre group, hub group.
function wheelGeometry(triangles, axleX) {
  const parts = [[], []];
  for (const triangle of triangles) {
    const r = triangle.reduce((sum, [x, y]) => sum + Math.hypot(x - axleX, y - AXLE_Y_CM), 0) / 3;
    parts[r < HUB_RADIUS_CM ? 1 : 0].push(triangle);
  }
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(triangles.length * 9);
  let vertex = 0;
  parts.forEach((part, slot) => {
    const start = vertex;
    for (const triangle of part) {
      for (const [x, y, z] of triangle) {
        position.set([x - axleX, y - AXLE_Y_CM, z], vertex * 3);
        vertex += 1;
      }
    }
    if (vertex > start) geometry.addGroup(start, vertex - start, slot);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  return { geometry, position: [axleX, AXLE_Y_CM, 0] };
}

/*
 * HALF THE TRIANGLES WERE THERE TWICE.
 *
 * 22,299 of the source's 46,228 triangles repeat another one exactly -- same
 * three corners, same winding -- so each was drawn twice. Opaque, the copy is
 * invisible and only costs time; under the old see-through glazing it doubled
 * the tint wherever it sat. Copies are dropped here. A triangle and its
 * reversed twin are both kept, since that pair is what makes a panel visible
 * from both sides.
 */
function triangleKey(corners) {
  const keys = corners.map((p) => p.map((c) => Math.round(c * 10)).join(',')); // 1 mm grid
  const lead = keys.indexOf([...keys].sort()[0]);
  return `${keys[lead]}|${keys[(lead + 1) % 3]}|${keys[(lead + 2) % 3]}`;
}

/*
 * BANDS ARE CUT, NOT ASSIGNED.
 *
 * The zones below used to be handed out whole triangles at a time, by where
 * each triangle's centre fell. This model's flanks are a few very large
 * triangles running from the skirt up past the window line, so one whose
 * centre landed in the glass band painted glazing in a long diagonal down the
 * side, and the neighbouring one painted body colour up into the windows: the
 * sharp lines running across the flanks. Each triangle is now split along the
 * band edges first, so every band ends on a straight horizontal line.
 */
const BAND_EDGES = [0.20, 0.30, 0.52, 0.72];

// Splits a triangle along the plane y = level, keeping its winding.
function splitAtLevel(triangle, level) {
  const side = triangle.map((p) => (p[1] > level + 1e-4 ? 1 : p[1] < level - 1e-4 ? -1 : 0));
  if (!side.includes(1) || !side.includes(-1)) return [triangle];
  const cut = (from, to) => {
    const t = (level - from[1]) / (to[1] - from[1]);
    return [from[0] + (to[0] - from[0]) * t, level, from[2] + (to[2] - from[2]) * t];
  };
  // Lead with the odd corner out: the one on the plane, else the one alone on its side.
  let lead = side.indexOf(0);
  if (lead === -1) lead = side.findIndex((s, i) => s !== side[(i + 1) % 3] && s !== side[(i + 2) % 3]);
  const a = triangle[lead];
  const b = triangle[(lead + 1) % 3];
  const c = triangle[(lead + 2) % 3];
  if (side[lead] === 0) {
    const m = cut(b, c);
    return [[a, b, m], [a, m, c]];
  }
  const p = cut(a, b);
  const q = cut(a, c);
  return [[a, p, q], [p, b, c], [p, c, q]];
}

function preparedBusGeometry(scene) {
  if (geometryCache.has(scene)) return geometryCache.get(scene);
  const source = scene.getObjectByProperty('isMesh', true);
  if (!source) return null;

  const sourceGeometry = source.geometry;
  sourceGeometry.computeBoundingBox();
  const { min, max } = sourceGeometry.boundingBox;
  const centreX = (min.x + max.x) / 2;
  const centreZ = (min.z + max.z) / 2;
  const height = max.y - min.y;
  const pos = sourceGeometry.attributes.position;
  const index = sourceGeometry.index;
  const count = index ? index.count : pos.count;
  const corner = (k) => {
    const i = index ? index.getX(k) : k;
    return [pos.getX(i) - centreX, pos.getY(i) - min.y, pos.getZ(i) - centreZ];
  };

  // Four zones: black rubber at the bottom, a lighter chassis skirt above it,
  // the painted flank, and the glazing. The source has no material IDs, so a
  // height fraction is the only handle there is.
  const groups = [[], [], [], [], []]; // tyres, body, chassis skirt, glass, roof
  const wheelTriangles = [[], [], [], []];
  const seen = new Set();
  for (let k = 0; k < count; k += 3) {
    const triangle = [corner(k), corner(k + 1), corner(k + 2)];
    const key = triangleKey(triangle);
    if (seen.has(key)) continue;
    seen.add(key);
    const wheel = wheelOf(triangle);
    if (wheel >= 0) {
      wheelTriangles[wheel].push(triangle);
      continue;
    }
    let pieces = [triangle];
    for (const edge of BAND_EDGES) pieces = pieces.flatMap((piece) => splitAtLevel(piece, edge * height));
    for (const piece of pieces) {
      const y = (piece[0][1] + piece[1][1] + piece[2][1]) / (3 * height);
      /*
       * The thin 0.32-0.37 band that used to carry the orange stripe is gone.
       * It was a fifth of a metre tall on a three-metre vehicle and it cut
       * straight across the sloped front, so on the nose it came out as a
       * diagonal wedge rather than a stripe -- which is what made the parked
       * buses look like the model was broken. Bands that survive here are the
       * ones that follow something real: rubber, skirt, flank, glass.
       */
      const slot = y < 0.20 ? 0 : y < 0.30 ? 2 : y < 0.52 ? 1 : y < 0.72 ? 3 : 4;
      groups[slot].push(piece);
    }
  }

  const triangles = groups.reduce((sum, group) => sum + group.length, 0);
  const position = new Float32Array(triangles * 9);
  const uv = new Float32Array(triangles * 6);
  const geometry = new THREE.BufferGeometry();
  const halfLength = (max.x - min.x) / 2;
  const halfWidth = (max.z - min.z) / 2;
  const glazingBottom = BAND_EDGES[2] * height;
  const glazingHeight = (BAND_EDGES[3] - BAND_EDGES[2]) * height;
  let vertex = 0;
  groups.forEach((group, slot) => {
    const start = vertex;
    for (const triangle of group) {
      const projection = slot === 3 ? projectBusGlazing(triangle, halfLength, halfWidth) : null;
      for (const point of triangle) {
        position.set(point, vertex * 3);
        if (projection) writeGlazingUv(uv, vertex * 2, point, projection, glazingBottom, glazingHeight);
        vertex += 1;
      }
    }
    if (vertex > start) geometry.addGroup(start, vertex - start, slot);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  // The legacy GLB contains positions only. Lit PBR paint needs vertex normals;
  // without them every livery becomes a near-black silhouette in the factory.
  geometry.computeVertexNormals();
  alignGlazingNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const prepared = {
    geometry,
    wheels: wheelTriangles.map((triangles, i) => wheelGeometry(triangles, AXLES_CM[Math.floor(i / 2)])),
  };
  geometryCache.set(scene, prepared);
  return prepared;
}

function busMaterials(paint, realistic) {
  // Painted panels are dielectric; keeping metalness low preserves the livery
  // colour under the warehouse lighting. One paint over flank and roof, the
  // chassis skirt a step off it, black rubber below, tinted glazing.
  const shell = realistic
    ? new THREE.MeshPhysicalMaterial({
      color: paint.body, metalness: 0.04, roughness: 0.36,
      clearcoat: 0.42, clearcoatRoughness: 0.22, flatShading: true,
    })
    : new THREE.MeshStandardMaterial({
      color: paint.body, metalness: 0.05, roughness: 0.3, flatShading: true,
    });
  const skirt = new THREE.MeshStandardMaterial({
    color: paint.chassis, metalness: 0.08, roughness: realistic ? 0.72 : 0.6, flatShading: true,
  });
  glazing ??= createBusGlazing();
  return [TYRE, shell, skirt, glazing, shell];
}

/*
 * Lamps, in the bus's own frame in metres (nose +x). The headlamps sit low on
 * the nose, whose face is at x = 4.14 below the windscreen; the tail and
 * reversing lamps on the flat rear (x = -4.43).
 */
const BUS_LAMPS = [
  ...[-0.92, 0.92].map((z) => ({ kind: 'head', position: [4.15, 0.78, z], size: [0.04, 0.13, 0.34], facing: [1, 0, 0] })),
  ...[-1.0, 1.0].map((z) => ({ kind: 'tail', position: [-4.44, 1.05, z], size: [0.03, 0.26, 0.14], facing: [-1, 0, 0] })),
  ...[-0.98, 0.98].map((z) => ({ kind: 'reverse', position: [-4.44, 0.82, z], size: [0.03, 0.1, 0.12], facing: [-1, 0, 0] })),
];

/*
 * `rollRef`, when given, holds the distance the bus has rolled in metres
 * (signed: negative when reversing); the wheels turn to match it.
 * `lampRef` holds 'forward', 'reverse' or 'off' for the lamps (VehicleLamps.js).
 */
function BusModel({ position, rotation = Math.PI / 2, livery = 'forest', rollRef, lampRef }) {
  const realistic = useRealism();
  const parkedLampRef = useRef('off');
  const { scene } = useGLTF(BUS_URL);
  const prepared = useMemo(() => preparedBusGeometry(scene), [scene]);
  const geometry = prepared && prepared.geometry;
  const wheelRefs = useRef([]);

  useFrame(() => {
    if (!rollRef) return;
    // Rolling forward (+x) turns a wheel about -z: the contact patch stays put.
    const angle = -rollRef.current / WHEEL_RADIUS_M;
    for (const wheel of wheelRefs.current) if (wheel) wheel.rotation.z = angle;
  });
  const paint = LIVERIES[livery] || LIVERIES.forest;
  const materials = useMemo(() => busMaterials(paint, realistic), [paint, realistic]);
  useEffect(() => () => {
    materials[1].dispose();
    materials[2].dispose();
  }, [materials]);

  if (!geometry) return null;
  const rearX = geometry.boundingBox.min.x * BUS_SCALE;
  return (
    <group name="factory-presentation-bus" position={position} rotation={[0, rotation, 0]}>
      <mesh
        geometry={geometry}
        material={materials}
        scale={BUS_SCALE}
        castShadow={realistic}
        receiveShadow={!realistic}
      >
        {prepared.wheels.map((wheel, i) => (
          <mesh
            key={i}
            ref={(mesh) => { wheelRefs.current[i] = mesh; }}
            geometry={wheel.geometry}
            material={WHEEL_MATERIALS}
            position={wheel.position}
            castShadow={realistic}
            receiveShadow={!realistic}
          />
        ))}
      </mesh>
      <VehicleLamps lamps={BUS_LAMPS} modeRef={lampRef || parkedLampRef} />
      {realistic && (
        <mesh position={[rearX - 0.02, 0.47, 0]} castShadow>
          <boxGeometry args={[0.09, 0.18, 2.05]} />
          <meshStandardMaterial color="#465159" metalness={0.24} roughness={0.58} />
        </mesh>
      )}
    </group>
  );
}

useGLTF.preload(BUS_URL);

export default function Bus(props) {
  return <Suspense fallback={null}><BusModel {...props} /></Suspense>;
}

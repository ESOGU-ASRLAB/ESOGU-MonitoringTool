import React, { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { BUS_LIVERY, POLYMER } from './scenePalette';

// Parked presentation buses, separate from the Otokar inspection-body CAD.
// The old bus asset is Y-up and in centimetres, hence its 0.01 scale.

/*
 * FLAT SHADING, AND THE DIAGONAL "SHADOW" IT FIXES.
 *
 * The parked buses carried a dark wedge sweeping diagonally across the lower
 * body, which looked like a shadow and was not one -- the mesh has
 * castShadow={false}, so it cannot shadow itself, and nothing else stands
 * where that wedge falls.
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
  pearl: { ...BUS_LIVERY.pearl },
  forest: { ...BUS_LIVERY.forest },
  graphite: { ...BUS_LIVERY.graphite },
});

// The source has no material IDs or UVs. Keep glazing separate from the much
// larger painted flank; neither glass nor the underbody should tint it black.
/*
 * Tyres and underbody. The bottom fifth of the vehicle is all wheel, arch and
 * skirt, and the source carries no material IDs to separate them, so this one
 * black covers the lot -- which is what it should be anyway.
 */
const TYRE = new THREE.MeshStandardMaterial({ ...POLYMER.rubber, flatShading: true });

/*
 * REAL GLAZING: transparent, so the far side of the vehicle shows through it.
 *
 * It was an opaque tinted panel before, which is why the window band read as
 * paint that happened to be a different colour rather than as glass. Three
 * things together make it read as glazing:
 *
 *   opacity 0.30       you see through it to the interior and out the far
 *                      windows, which is the single strongest cue
 *   DoubleSide         without it the far windows' back faces are culled and
 *                      looking through the near glass shows nothing at all
 *   depthWrite false   a transparent surface that writes depth hides whatever
 *                      is behind it in the same mesh -- which here is the rest
 *                      of the bus
 *
 * roughness 0.05 keeps a sharp reflection of the roof lights on top of that,
 * so the band still reads as a hard surface rather than a hole.
 *
 * three.js sorts render items per material GROUP, not per mesh, so one
 * transparent group inside this otherwise opaque bus lands in the transparent
 * pass on its own and draws in the right order.
 */
const GLASS = new THREE.MeshStandardMaterial({
  color: '#a8c6d2',
  metalness: 0.0,
  roughness: 0.05,
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const geometryCache = new WeakMap();

function preparedBusGeometry(scene) {
  if (geometryCache.has(scene)) return geometryCache.get(scene);
  const source = scene.getObjectByProperty('isMesh', true);
  if (!source) return null;

  const geometry = source.geometry.clone();
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  geometry.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);
  const pos = geometry.attributes.position;
  const height = max.y - min.y;
  const index = geometry.index;

  if (index) {
    // Four zones: black rubber at the bottom, a lighter chassis skirt above
    // it, the painted flank, and the glazing. The source has no material IDs,
    // so a height fraction is the only handle there is.
    const groups = [[], [], [], [], []]; // tyres, body, chassis skirt, glass, roof
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / (3 * height);
      /*
       * The thin 0.32-0.37 band that used to carry the orange stripe is gone.
       * It was a fifth of a metre tall on a three-metre vehicle and it cut
       * straight across the sloped front, so on the nose it came out as a
       * diagonal wedge rather than a stripe -- which is what made the parked
       * buses look like the model was broken. Bands that survive here are the
       * ones that follow something real: rubber, skirt, flank, glass.
       */
      const slot = y < 0.20 ? 0 : y < 0.30 ? 2 : y < 0.52 ? 1 : y < 0.72 ? 3 : 4;
      groups[slot].push(a, b, c);
    }
    geometry.setIndex(groups.flat());
    geometry.clearGroups();
    let offset = 0;
    groups.forEach((faces, slot) => {
      if (faces.length) geometry.addGroup(offset, faces.length, slot);
      offset += faces.length;
    });
  }

  // The legacy GLB contains positions only. Lit PBR paint needs vertex normals;
  // without them every livery becomes a near-black silhouette in the factory.
  geometry.computeVertexNormals();

  geometryCache.set(scene, geometry);
  return geometry;
}

function BusModel({ position, rotation = Math.PI / 2, livery = 'pearl' }) {
  const { scene } = useGLTF(BUS_URL);
  const geometry = useMemo(() => preparedBusGeometry(scene), [scene]);
  // Painted panels are dielectric; keeping metalness low preserves their
  // livery colour under the warehouse lighting.
  const materials = useMemo(() => {
    const paint = LIVERIES[livery] || LIVERIES.pearl;
    // One paint colour over the flank and the roof, so the vehicle still reads
    // as a single colour; the chassis skirt a step off it rather than a second
    // livery colour; black rubber below; glazing transparent.
    const shell = new THREE.MeshStandardMaterial({
      color: paint.body, metalness: 0.05, roughness: 0.3, flatShading: true,
    });
    const skirt = new THREE.MeshStandardMaterial({
      color: paint.chassis, metalness: 0.05, roughness: 0.6, flatShading: true,
    });
    return [TYRE, shell, skirt, GLASS, shell];
  }, [livery]);

  if (!geometry) return null;
  return (
    <mesh
      geometry={geometry}
      material={materials}
      scale={BUS_SCALE}
      position={position}
      rotation={[0, rotation, 0]}
      castShadow={false}
      receiveShadow
    />
  );
}

useGLTF.preload(BUS_URL);

export default function Bus(props) {
  return <Suspense fallback={null}><BusModel {...props} /></Suspense>;
}

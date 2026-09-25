import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { OTOKAR_BODY_PALETTE } from './otokarCadPalette';

/*
 * Loader for the Otokar MATISSE cell's Draco-compressed GLB parts.
 *
 * These are converted from Otokar's STEP models by
 * scripts/otokar/build_otokar_meshes.sh -- see README, "Otokar MATISSE cell
 * asset sourcing". Two properties of that conversion matter here:
 *
 *  1. The GLBs are exported in METRES (the converter applies the mm->m factor),
 *     so unlike the STL meshes elsewhere in this project they need no
 *     scale={0.001}. They are also left in their original CAD world
 *     coordinates, which is what lets the separately-exported axis assemblies
 *     line up when mounted at identity.
 *  2. They carry POSITION and indices only, no NORMAL accessor. That is
 *     deliberate: these are machined parts, and smoothing normals across a
 *     milled edge makes them look melted. Rendering with flatShading gives the
 *     correct hard-edged look and keeps the files ~1/3 smaller.
 */

// Self-hosted rather than the gstatic CDN: this deployment is expected to run
// on the shop floor without reliable outbound internet (same reasoning as the
// RoomEnvironment choice in Scene.js).
const DRACO_PATH = process.env.PUBLIC_URL + '/draco/';

export const OTOKAR_MESH_BASE = process.env.PUBLIC_URL + '/meshes/otokar';
// Bump this whenever the STEP->GLB output or its frame interpretation changes.
// The static server still serves the same file for the query-string URL, while
// GLTFLoader's cache key and the browser cache see a new asset revision.
export const OTOKAR_ASSET_VERSION = '2026-09-25-fixtures-1';

export function otokarMeshUrl(group, part, lod = 'hi') {
  return `${OTOKAR_MESH_BASE}/${group}/${lod}/${part}.glb?v=${OTOKAR_ASSET_VERSION}`;
}

export function preloadOtokar(group, part, lod) {
  useGLTF.preload(otokarMeshUrl(group, part, lod), DRACO_PATH);
}

/*
 * Which palette colour a piece of the body carries.
 *
 * The rules are positional, not per-part: the CAD arrives as one undifferentiated
 * mesh with no material assignments, so the only thing available to tell a roof
 * rail from a sill from a pillar is where the geometry sits and which way it
 * runs. `direction` is the extent of the primitive along each CAD axis -- for an
 * edge that is the edge itself, for a triangle it is the triangle's box, which
 * on a tessellated structural member follows that member's run.
 */
function cadPartColor(midpoint, direction, minZ, heightSpan, centerY, halfWidth) {
  const height = THREE.MathUtils.clamp(
    (midpoint.z - minZ) / Math.max(heightSpan, 0.0001),
    0,
    1,
  );
  const side = Math.abs(midpoint.y - centerY) / Math.max(halfWidth, 0.0001);
  const [dx, dy, dz] = direction;

  // Roof panel and cant rail.
  if (height > 0.84) return OTOKAR_BODY_PALETTE.roof;
  // Vertical members: the outer ones are the pillars you see from the side.
  if (dz > Math.max(dx, dy) * 1.25) {
    return side > 0.58 ? OTOKAR_BODY_PALETTE.pillar : OTOKAR_BODY_PALETTE.inner;
  }
  // Members running the length of the vehicle: sills low down, waist and roof
  // rails on the flanks, floor and interior beams inboard.
  if (dx > dy && dx > dz) {
    if (height < 0.25) return OTOKAR_BODY_PALETTE.sill;
    return side > 0.7 ? OTOKAR_BODY_PALETTE.upper : OTOKAR_BODY_PALETTE.inner;
  }
  // Everything across the vehicle: floor cross members and roof bows.
  return height < 0.3 ? OTOKAR_BODY_PALETTE.sill : OTOKAR_BODY_PALETTE.crossMember;
}

/*
 * The body as BUILT SHEET AND SECTION, not as a drawing.
 *
 * This used to render the body as an EdgesGeometry line cloud -- the CAD
 * palette applied to edges only, with the surfaces hidden. It read as a
 * blueprint: you could see straight through the vehicle, and the colours
 * floated with nothing behind them.
 *
 * The same rules now paint the SURFACES. Each triangle is coloured from its own
 * centroid and run direction by cadPartColor, so the exact palette the edge
 * version used survives verbatim -- cream roof, green and magenta side
 * structure, blue pillars, dark red sill -- while the body becomes solid,
 * lit, and shadow-casting: painted metal on a production line rather than a
 * wireframe.
 *
 * Per-TRIANGLE colour needs one colour per vertex with no vertex shared between
 * triangles, hence toNonIndexed(). That trades index reuse for the ability to
 * hold a hard colour boundary at a panel edge, which is the whole point: a
 * smoothly interpolated version turns the structure into a tie-dye. The
 * geometry is built once per mesh and memoised with it.
 */
function createCadSurfaceGeometry(geometry) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = geo.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const bounds = new THREE.Box3().setFromBufferAttribute(position);
  const size = bounds.getSize(new THREE.Vector3());
  const centerY = (bounds.min.y + bounds.max.y) / 2;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  const color = new THREE.Color();

  for (let i = 0; i + 2 < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    midpoint.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const direction = [
      Math.max(a.x, b.x, c.x) - Math.min(a.x, b.x, c.x),
      Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y),
      Math.max(a.z, b.z, c.z) - Math.min(a.z, b.z, c.z),
    ];
    // Color.set() applies the sRGB -> linear conversion, the same one
    // material.color goes through, so vertex and uniform colours match.
    color.set(cadPartColor(midpoint, direction, bounds.min.z, size.z, centerY, size.y / 2));
    for (let v = 0; v < 3; v += 1) {
      colors[(i + v) * 3] = color.r;
      colors[(i + v) * 3 + 1] = color.g;
      colors[(i + v) * 3 + 2] = color.b;
    }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

export default function OtokarMesh({
  group,
  part,
  lod = 'hi',
  material,
  position,
  rotation,
  visible = true,
  cadColors = false,
  overrideMaterial,
  onGeometry,
}) {
  const url = otokarMeshUrl(group, part, lod);
  const { scene } = useGLTF(url, DRACO_PATH);

  // With cadColors the tint comes per-triangle off the geometry, so the
  // uniform stays white -- MeshStandardMaterial MULTIPLIES the two, and any
  // other base colour would wash the whole palette through it.
  const built = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: cadColors ? '#ffffff' : material.color,
        vertexColors: cadColors,
        metalness: material.metalness,
        roughness: material.roughness,
        flatShading: true,
      }),
    [cadColors, material.color, material.metalness, material.roughness],
  );
  /*
   * A caller may supply its own material instead -- the cable chain does, so it
   * can carry the vertex shader that folds it. Everything else about the mesh
   * is unchanged, so this stays an override rather than a separate code path.
   */
  const mat = overrideMaterial || built;

  // useGLTF caches one parsed scene per URL, so the same GLB mounted twice
  // (robot1 and robot2 share no files today, but the LOD pair and any future
  // mirrored part would) must not share a single Object3D -- re-parenting it
  // would yank it out of the first mount. clone() is cheap here because it
  // shares the underlying BufferGeometry.
  const object = useMemo(() => {
    const clone = scene.clone(true);
    const meshes = [];
    clone.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });

    for (const child of meshes) {
      if (onGeometry) {
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        onGeometry(child.geometry.boundingBox);
      }
      if (cadColors) {
        // Cache the recoloured geometry on the SHARED source geometry rather
        // than rebuilding it per mount: scene.clone() hands every instance the
        // same BufferGeometry, and the body is the heaviest mesh in the cell.
        const source = child.geometry;
        if (!source.userData.__otokarCadSurface) {
          source.userData.__otokarCadSurface = createCadSurfaceGeometry(source);
        }
        child.geometry = source.userData.__otokarCadSurface;
      }
      child.material = mat;
      child.castShadow = true;
      child.receiveShadow = true;
    }
    return clone;
  }, [scene, mat, cadColors, onGeometry]);

  return <primitive object={object} position={position} rotation={rotation} visible={visible} />;
}

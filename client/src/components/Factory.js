import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { ARCHITECTURE, LIGHTING, ROOM } from './scenePalette';
import { dressWarehouse } from './warehouseDressing';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * Full warehouse shell (building, shelving, pallets, lights) authored
 * separately in Blender and exported as glTF -- already Y-up and in real
 * meters, so unlike the STL facility props in EnvironmentElements it needs no
 * axis-flip group and no unit rescale.
 *
 * The repaired materials use the shared factory palette. An emissive mask
 * keeps the radiance on the ceiling tubes and window panes.
 */
const FACTORY_URL = process.env.PUBLIC_URL + '/assets/factory/warehouse_blender.blend.glb';

/*
 * ---------------------------------------------------------------------------
 * Compatibility shim for the ImageToStl.com-converted export
 * ---------------------------------------------------------------------------
 * warehouse_blender.blend.glb carries ~9x the geometry of the first export --
 * crucially the full ceiling lamp array and the long wall shelving that were
 * missing before -- but it did not come out of Blender's own glTF exporter
 * (asset.generator says "ImageToStl.com"). That converter cannot read Blender's
 * shader graph, so it degraded every material on the way through:
 *
 *   - baseColorFactor was replaced with a per-material debug colour (blue,
 *     green, yellow, red). glTF multiplies that into the base colour texture,
 *     so left alone the warehouse renders tinted those four colours.
 *   - emissive was dropped entirely (no emissiveTexture, no emissive strength),
 *     which is what switches the lamps and window panes off.
 *   - metallicFactor was rewritten to arbitrary values, making matte concrete
 *     and panelling read as polished metal.
 *   - the roughness maps survive inside the file but no material references
 *     them any more, so roughness is a flat 0.75 everywhere.
 *   - names were flattened to mat0..mat3 / Node0..Node27, and the whole scene
 *     came out 2.02157x oversized.
 *
 * The embedded wall, steel and details roughness maps are bound in the GLB.
 * The shim repairs the remaining material factors for the converted export.
 * A native Blender export with its own material names bypasses the shim.
 */
const CONVERTED_MATERIAL_NAMES = ['mat0', 'mat1', 'mat2', 'mat3'];

// Ratio measured off the building mesh's own bounds, which agree on all three
// axes between the two exports (the pallets disagree only because the converter
// baked their node rotations into the vertices).
const CONVERTED_SCALE = 1 / 2.02157;

// The converter dropped this map; it is extracted back out of the first export
// (identical UV layout, so it lines up on the new geometry) and re-attached.
const EMISSIVE_URL = process.env.PUBLIC_URL + '/assets/factory/details_Emissive.png';
const DETAILS_MATERIAL_INDEX = 3;
// The converted export packs both side walls' clerestory panes in Node4.
const CLERESTORY_NODE = 'Node4';

function collectMaterials(root) {
  const materials = [];
  const seen = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      if (mat && !seen.has(mat.uuid)) {
        seen.add(mat.uuid);
        materials.push(mat);
      }
    }
  });
  return materials;
}

const isConvertedExport = (materials) =>
  materials.some((mat) => CONVERTED_MATERIAL_NAMES.includes(mat?.name));

// Shadow flags are overridden even on a clean export, because our directional
// light is a Gazebo-derived *exterior* sun that predates the building. Letting
// the shell cast from it means the roof intercepts that sun and drops a huge
// shadow across its own floor -- and because the light's shadow camera only
// spans 20x20m (sized for the workcell) while the building is far larger,
// three.js's in-frustum test cuts that shadow off mid-floor, leaving a
// hard-edged dark quad that reads as a rendering fault. So nothing in the
// warehouse casts, and only the floor receives (which is what actually grounds
// the robots); the shell's own depth/AO is already baked into its maps.
const FLOOR_MATERIAL_NAMES = ['floor', 'mat0'];

/*
 * THE SHUTTER OPENINGS, CUT THROUGH.
 *
 * The far wall's two roller shutters are painted onto one continuous wall
 * sheet, and a girt runs straight across both. So a bus driving out met a solid
 * wall and simply vanished into it -- it looked like a portal. The building's
 * materials now discard every fragment inside the two openings (x = +/-(3.21 ..
 * 8.69), y < 3.63, at the far wall), which makes real holes through the
 * cladding and the steel, and the yard outside (Yard.js) shows through them.
 * GarageDoors.js puts a real curtain in each hole.
 */
export const SHUTTER_OPENINGS = Object.freeze({ inner: 3.21, outer: 8.69, top: 3.63, wallZ: -24.2 });

function cutShutterOpenings(material) {
  if (material.userData.shutterCut) return;
  material.userData.shutterCut = true;
  const { inner, outer, top, wallZ } = SHUTTER_OPENINGS;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vShutterWorld;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vShutterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vShutterWorld;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vShutterWorld.z < ${wallZ.toFixed(3)} && vShutterWorld.y < ${top.toFixed(3)}
            && abs(vShutterWorld.x) > ${inner.toFixed(3)} && abs(vShutterWorld.x) < ${outer.toFixed(3)}) discard;`);
  };
  material.customProgramCacheKey = () => 'shutter-openings';
  material.needsUpdate = true;
}

function WarehouseModel() {
  const { scene } = useGLTF(FACTORY_URL);
  const emissiveMap = useLoader(THREE.TextureLoader, EMISSIVE_URL);

  const materials = useMemo(() => collectMaterials(scene), [scene]);
  const converted = isConvertedExport(materials);

  useEffect(() => {
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const objMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
      objMaterials.forEach(cutShutterOpenings);
      obj.castShadow = false;
      obj.receiveShadow = objMaterials.some((mat) => FLOOR_MATERIAL_NAMES.includes(mat?.name));
    });

    if (!converted) return;

    // glTF textures are authored with the origin at the top-left, which
    // GLTFLoader encodes as flipY = false. TextureLoader defaults the other
    // way, so without this the re-attached map lands upside down.
    emissiveMap.flipY = false;
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    emissiveMap.needsUpdate = true;

    for (const mat of materials) {
      const slot = CONVERTED_MATERIAL_NAMES.indexOf(mat.name);
      if (slot === -1) continue;

      const surface = [ARCHITECTURE.roof, ARCHITECTURE.wall, ARCHITECTURE.steel, ARCHITECTURE.details][slot];
      mat.color.set(surface.color);
      mat.metalness = surface.metalness;
      mat.roughness = mat.roughnessMap ? 1 : surface.roughness;
      // The embedded images carry roughness in all three channels.
      mat.metalnessMap = null;

      if (slot === DETAILS_MATERIAL_INDEX) {
        mat.emissive.set(ROOM.lamp);
        mat.emissiveMap = emissiveMap;
        mat.emissiveIntensity = LIGHTING.lampEmission;
      }

      mat.needsUpdate = true;
    }

    const clerestory = scene.getObjectByName(CLERESTORY_NODE);
    const details = clerestory?.material;
    if (!clerestory?.isMesh || details?.name !== CONVERTED_MATERIAL_NAMES[DETAILS_MATERIAL_INDEX]) return;

    const windowFinish = details.clone();
    windowFinish.name = 'warehouse-clerestory';
    windowFinish.emissive.set(ROOM.daylight);
    windowFinish.emissiveIntensity = LIGHTING.windowEmission;
    windowFinish.roughness = 0.64;
    windowFinish.roughnessMap = null;
    clerestory.material = windowFinish;
    return () => {
      clerestory.material = details;
      windowFinish.dispose();
    };
  }, [scene, materials, converted, emissiveMap]);

  // Apply the same rack and pallet finishes in both viewer modes.
  const dressing = useRef(null);
  useEffect(() => {
    if (!converted) return;
    if (!dressing.current) {
      const base = materials.find((mat) => mat.name === CONVERTED_MATERIAL_NAMES[DETAILS_MATERIAL_INDEX]);
      if (base) dressing.current = dressWarehouse(scene, base);
    }
    dressing.current?.apply(true);
  }, [scene, materials, converted]);
  useEffect(() => () => {
    dressing.current?.dispose();
    dressing.current = null;
  }, [scene]);

  return <primitive object={scene} scale={converted ? CONVERTED_SCALE : 1} />;
}

useGLTF.preload(FACTORY_URL);

export default function Factory({ show = true }) {
  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <WarehouseModel />
    </Suspense>
  );
}

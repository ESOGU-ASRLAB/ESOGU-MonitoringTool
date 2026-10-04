import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { ARCHITECTURE, REALISM } from './scenePalette';
import { dressWarehouse } from './warehouseDressing';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * Full warehouse shell (building, shelving, pallets, lights) authored
 * separately in Blender and exported as glTF -- already Y-up and in real
 * meters, so unlike the STL facility props in EnvironmentElements it needs no
 * axis-flip group and no unit rescale.
 *
 * Materials are meant to be used exactly as authored. In particular the
 * "details" material's KHR_materials_emissive_strength: 35 is used in the
 * classic view. The realistic view uses a lower lamp strength with its camera
 * exposure and bloom. The emissive map is black except over the ceiling tubes
 * and window panes, so this adjustment only affects the bright fixtures.
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
 * Everything below repairs those five things at load time. It is deliberately
 * gated behind isConvertedExport(): a proper `File > Export > glTF 2.0` from
 * Blender keeps its real material names, colours and emissive strength, so the
 * shim sees nothing to fix and no-ops, and the asset can be swapped in by
 * changing FACTORY_URL alone.
 *
 * The one thing it cannot recover is the roughness maps -- rewiring those needs
 * the textures extracted out to their own files, which a correct re-export
 * makes unnecessary. Flat roughness is the visible cost of staying on this file.
 */
const CONVERTED_MATERIAL_NAMES = ['mat0', 'mat1', 'mat2', 'mat3'];

// Ratio measured off the building mesh's own bounds, which agree on all three
// axes between the two exports (the pallets disagree only because the converter
// baked their node rotations into the vertices).
const CONVERTED_SCALE = 1 / 2.02157;

/*
 * Colour and finish for mat0..mat3 (floor, wall, beams, details) now come from
 * ARCHITECTURE in scenePalette.js, applied below.
 *
 * Roughness matters here as much as colour, and it is the reason the shell
 * used to read as flat however it was lit: the converter dropped the roughness
 * maps -- they are still inside the file, but no material references them --
 * so every surface arrived at the default 1.0, uniformly and perfectly matte.
 * A sealed floor and a steel truss do not scatter light the same way, and with
 * one value for both there was no highlight anywhere to place the building by.
 */

// The converter dropped this map; it is extracted back out of the first export
// (identical UV layout, so it lines up on the new geometry) and re-attached.
const EMISSIVE_URL = process.env.PUBLIC_URL + '/assets/factory/details_Emissive.png';
const DETAILS_MATERIAL_INDEX = 3;
const EMISSIVE_STRENGTH = 35;
// The camera-like exposure in realistic mode needs less lamp radiance to keep
// tube detail and avoid a white wash across the roof.
const REALISTIC_EMISSIVE_STRENGTH = 22;

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

function WarehouseModel({ realism }) {
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

      /*
       * Base colours, finish included, from the shared scene palette.
       *
       * These had drifted to #ffffff, #fcfcfc, #fffcfc and #ffffff -- four
       * shades of white -- while the comment that used to sit here described
       * a cool darker floor and beams "a step darker and cooler than the
       * panels". The comment was right about what the hall needs; the values
       * were not doing it. Wall against beam measured 1.01:1, so the whole
       * distinction between cladding and the structure holding it up rested on
       * the texture map, and the floor was as bright as the walls, leaving the
       * dark cells sitting on a white field with nothing grounding them.
       *
       * ARCHITECTURE now carries all four, and verify_palette.mjs asserts the
       * separation that the old comment only claimed: floor/wall 2.25:1,
       * wall/steel 1.63:1, floor against the machines 2.3-2.8:1.
       *
       * Metalness comes from the palette too, replacing ORIGINAL_METALNESS.
       * Sealed concrete and coated panel are dielectrics and were at 0.12 and
       * 0.04 -- close enough -- but the "structural steel" slot was at 0.55,
       * half metal, which is why the frames took the room's colour instead of
       * their own. Rolled section is bare, so it keeps a little at 0.15.
       */
      const surface = [
        realism ? REALISM.architecture.roof : ARCHITECTURE.floor,
        // The realistic look (Realism.js) paints the shell the greys a plant's
        // cladding and steel actually are; its floor is laid over this one.
        realism ? REALISM.architecture.wall : ARCHITECTURE.wall,
        realism ? REALISM.architecture.steel : ARCHITECTURE.steel,
        realism ? REALISM.architecture.details : ARCHITECTURE.details,
      ][slot];
      mat.color.set(surface.color);
      mat.metalness = surface.metalness;
      mat.roughness = surface.roughness;

      if (slot === DETAILS_MATERIAL_INDEX) {
        mat.emissive.setRGB(1, 1, 1);
        mat.emissiveMap = emissiveMap;
        mat.emissiveIntensity = realism ? REALISTIC_EMISSIVE_STRENGTH : EMISSIVE_STRENGTH;
      }

      mat.needsUpdate = true;
    }
  }, [scene, materials, converted, emissiveMap, realism]);

  // The racking, pallets and loads, painted as in a real plant under the
  // realistic look (warehouseDressing.js).
  const dressing = useRef(null);
  useEffect(() => {
    if (!converted) return;
    if (!dressing.current) {
      const base = materials.find((mat) => mat.name === CONVERTED_MATERIAL_NAMES[DETAILS_MATERIAL_INDEX]);
      if (base) dressing.current = dressWarehouse(scene, base);
    }
    dressing.current?.apply(realism);
  }, [scene, materials, converted, realism]);
  useEffect(() => () => {
    dressing.current?.dispose();
    dressing.current = null;
  }, [scene]);

  return <primitive object={scene} scale={converted ? CONVERTED_SCALE : 1} />;
}

useGLTF.preload(FACTORY_URL);

export default function Factory({ show = true, realism = false }) {
  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <WarehouseModel realism={realism} />
    </Suspense>
  );
}

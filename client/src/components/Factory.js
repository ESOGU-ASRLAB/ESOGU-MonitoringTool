import React, { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * Full warehouse shell (building, shelving, pallets, lights) authored
 * separately in Blender and exported as glTF -- already Y-up and in real
 * meters, so unlike the STL facility props in EnvironmentElements it needs no
 * axis-flip group and no unit rescale.
 *
 * Materials are meant to be used exactly as authored. In particular the
 * "details" material's KHR_materials_emissive_strength: 35 looks alarming but
 * is correct -- its emissive map is black everywhere except a few small
 * rectangles over the ceiling lamp tubes and the window panes, so the strength
 * only ever multiplies those texels, and R3F's default ACES tone mapping rolls
 * them off into a lit-tube glow. Clamping it doesn't dim "too-bright pallets",
 * it just switches the lamps and windows off, because those sample the black
 * part of the same map.
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

// metallicFactor per material in the original export, in mat0..mat3 order
// (floor, wall, beams, details). Only the beams were ever metal.
const ORIGINAL_METALNESS = [0.1, 0, 2, 1];

// The converter dropped this map; it is extracted back out of the first export
// (identical UV layout, so it lines up on the new geometry) and re-attached.
const EMISSIVE_URL = process.env.PUBLIC_URL + '/assets/factory/details_Emissive.png';
const DETAILS_MATERIAL_INDEX = 3;
const EMISSIVE_STRENGTH = 35;

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

function WarehouseModel() {
  const { scene } = useGLTF(FACTORY_URL);
  const emissiveMap = useLoader(THREE.TextureLoader, EMISSIVE_URL);

  const materials = useMemo(() => collectMaterials(scene), [scene]);
  const converted = isConvertedExport(materials);

  useEffect(() => {
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const objMaterials = Array.isArray(obj.material) ? obj.material : [obj.material];
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

      mat.color.setRGB(1, 1, 1); // drop the debug tint
      mat.metalness = ORIGINAL_METALNESS[slot];

      if (slot === DETAILS_MATERIAL_INDEX) {
        mat.emissive.setRGB(1, 1, 1);
        mat.emissiveMap = emissiveMap;
        mat.emissiveIntensity = EMISSIVE_STRENGTH;
      }

      mat.needsUpdate = true;
    }
  }, [scene, materials, converted, emissiveMap]);

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

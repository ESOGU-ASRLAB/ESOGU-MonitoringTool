import * as THREE from 'three';
import { RENDER_FINISH } from './scenePalette';

export const HALL_LIGHTMAP_URL = process.env.PUBLIC_URL + '/assets/realism/hall-lightmap.webp';

// Atlas regions follow bake_hall_lightmap.py. Leave a gutter around every
// island for the lower mip levels.
const atlas = (coordinate) => 0.005 + 0.99 * coordinate / 3;
const saturate = (value) => THREE.MathUtils.clamp(value, 0, 1);

export function floorLightmapUV(geometry) {
  const uv = geometry.getAttribute('uv');
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(
    Array.from(uv.array, (value) => atlas(2 * value)), 2,
  ));
}

export function warehouseLightmapUV(mesh, rack = false) {
  const { geometry, matrixWorld } = mesh;
  const positions = geometry.getAttribute('position');
  const uv = new Float32Array(positions.count * 2);
  const point = new THREE.Vector3();
  mesh.updateWorldMatrix(true, false);
  for (let i = 0; i < positions.count; i += 1) {
    const { x, y, z } = point.fromBufferAttribute(positions, i).applyMatrix4(matrixWorld);
    const w = saturate(x / 32.54 + 0.5);
    const d = saturate(0.5 - z / 49.16);
    const h = saturate(y / 9.8);
    let u = 2 * w;
    let v = 2 * d;
    if (rack) { u = d; v = 2.51 + 0.49 * saturate(y / 5.4); }
    else if (y > 0.09 && x > 15.6) { u = 2 + d; v = 1 + h; }
    else if (y > 0.09 && x < -15.6) { u = 1 - d; v = 2 + 0.49 * h; }
    else if (y > 0.09 && Math.abs(z) > 23.9) { u = 2 + w; v = h; }
    else if (y > 5.25) { u = 1 + 2 * w; v = 3 - d; }
    uv[i * 2] = atlas(u);
    uv[i * 2 + 1] = atlas(v);
  }
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
}

export function applyBakedOcclusion(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', `
    #include <aomap_fragment>
    #ifdef USE_LIGHTMAP
      float bakedFill = texture2D(lightMap, vLightMapUv).r;
      reflectedLight.indirectDiffuse *= mix(1.0, bakedFill, ${RENDER_FINISH.bakedOcclusion.toFixed(3)});
    #endif
  `);
}

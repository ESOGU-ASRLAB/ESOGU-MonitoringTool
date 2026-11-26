import * as THREE from 'three';
import { FORKLIFT_AISLE } from './cellLayout';

export const HALL_FLOOR = { width: 32.54, length: 49.16, baysX: 6, baysZ: 8 };

function grainAt(x, z) {
  const seed = Math.imul(x, 73856093) ^ Math.imul(z, 19349663);
  return (Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0) / 0xffffffff;
}

function mottlingAt(x, z) {
  const column = Math.floor(x);
  const row = Math.floor(z);
  const { lerp, smoothstep } = THREE.MathUtils;
  const along = smoothstep(x - column, 0, 1);
  const across = smoothstep(z - row, 0, 1);
  return lerp(
    lerp(grainAt(column, row), grainAt(column + 1, row), along),
    lerp(grainAt(column, row + 1), grainAt(column + 1, row + 1), along),
    across,
  );
}

// One coarse map for the entire slab. The tiled maps supply close-up grain and
// joints. Channels store perimeter occlusion, diffuse variation and roughness.
export function createHallFloorFinish() {
  const width = 192;
  const height = 288;
  const data = new Uint8Array(width * height * 4);
  const { smoothstep } = THREE.MathUtils;
  const { width: span, length, baysX, baysZ } = HALL_FLOOR;
  const aisle = FORKLIFT_AISLE;

  for (let row = 0; row < height; row += 1) {
    const v = (row + 0.5) / height;
    const z = (0.5 - v) * length;
    const bayZ = Math.floor(v * baysZ);
    const traffic = smoothstep(z, aisle.fromZ, aisle.fromZ + 2)
      * (1 - smoothstep(z, aisle.toZ - 2, aisle.toZ));

    for (let column = 0; column < width; column += 1) {
      const u = (column + 0.5) / width;
      const x = (u - 0.5) * span;
      const bayX = Math.floor(u * baysX);
      const index = 4 * (row * width + column);

      const wallFalloff = smoothstep(span / 2 - Math.abs(x), 0.12, 1.8);
      const pour = Math.sin(bayX * 5.72 + bayZ * 8.31 + 0.9);
      const mottling = 0.7 * mottlingAt(x / 1.8, z / 2.5) + 0.3 * mottlingAt(x / 0.54, z / 0.72);
      const wheelOffset = Math.abs(x - aisle.x - 0.09 * Math.sin(z * 0.7));
      const tireWear = traffic * (1 - smoothstep(Math.abs(wheelOffset - 0.47), 0.09, 0.42));

      data[index] = Math.round(255 * (0.72 + 0.28 * wallFalloff));
      data[index + 1] = Math.round(255 * (0.28 + 0.10 * pour + 0.52 * mottling - 0.16 * tireWear));
      data[index + 2] = Math.round(255 * (0.7 + 0.3 * mottling - 0.48 * tireWear));
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height);
  texture.name = 'hall-floor-finish';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function applyHallFloorFinish(shader) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <map_fragment>', `#include <map_fragment>
      vec2 slabFinish = texture2D(aoMap, vAoMapUv).gb;
      diffuseColor.rgb = mix(diffuse, diffuseColor.rgb, 0.46) * mix(0.86, 1.10, slabFinish.x);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor *= mix(0.86, 1.0, slabFinish.y);`);
}

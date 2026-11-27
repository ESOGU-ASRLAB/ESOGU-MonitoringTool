import * as THREE from 'three';
import { SURFACE_FINISH } from './scenePalette';

const ATLAS_WIDTH = 1024;
const ATLAS_HEIGHT = 256;
const ROW_HEIGHT = 64;
const ROW_INSET = 4;
const SIDE_WINDOWS = [.045, .19, .35, .51, .67, .83, .958];

// Side, windscreen and rear window project differently onto the body shell.
// Keep both sides in the same atlas row so their mullions line up.
export function projectBusGlazing(triangle, halfLength, halfWidth) {
  const [a, b, c] = triangle;
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const centre = (a[0] + b[0] + c[0]) / 3;
  const endPanel = Math.abs(centre) > halfLength * .84 && Math.abs(nx) > Math.abs(nz);
  const row = endPanel ? (centre > 0 ? 1 : 2) : 0;
  const axis = endPanel ? 2 : 0;
  const half = endPanel ? halfWidth : halfLength;
  return { row, axis, half };
}

export function writeGlazingUv(uv, offset, point, projection, floor, height) {
  const { row, axis, half } = projection;
  const u = THREE.MathUtils.clamp((point[axis] + half) / (2 * half), 0, 1);
  const v = 1 - THREE.MathUtils.clamp((point[1] - floor) / height, 0, 1);
  uv[offset] = (.5 + u * (ATLAS_WIDTH - 1)) / ATLAS_WIDTH;
  uv[offset + 1] = (row * ROW_HEIGHT + ROW_INSET + v * (ROW_HEIGHT - 2 * ROW_INSET)) / ATLAS_HEIGHT;
}

export function alignGlazingNormals(geometry) {
  const glazing = geometry.groups.find((group) => group.materialIndex === 3);
  if (!glazing) return;
  const normals = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  // The imported layered panels have small differences in triangle angle.
  // The flat side and rear glazing reflect as a continuous plane. Keep the
  // actual normals at wrapped edges and on the raked windscreen.
  for (let i = glazing.start; i < glazing.start + glazing.count; i += 1) {
    const row = Math.floor(uv.getY(i) * (ATLAS_HEIGHT / ROW_HEIGHT));
    const x = normals.getX(i);
    const z = normals.getZ(i);
    if (row === 0 && Math.abs(z) > 0.9) normals.setXYZ(i, 0, 0, Math.sign(z));
    if (row === 2 && Math.abs(x) > 0.9) normals.setXYZ(i, Math.sign(x), 0, 0);
  }
}

function glazingAtlas(frame, pane) {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
  ctx.fillStyle = pane;
  const draw = (start, end, row) => {
    const top = row * ROW_HEIGHT + ROW_INSET + 5;
    ctx.beginPath();
    ctx.roundRect(start * ATLAS_WIDTH, top, (end - start) * ATLAS_WIDTH, 46, [7, 7, 5, 5]);
    ctx.fill();
  };
  SIDE_WINDOWS.slice(1).forEach((end, i) => draw(SIDE_WINDOWS[i] + .003, end - .003, 0));
  draw(.064, .936, 1);
  draw(.108, .892, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.anisotropy = 8;
  return texture;
}

export function createBusGlazing() {
  const map = glazingAtlas('#161a1d', '#0c1216');
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = glazingAtlas('#f1f1f1', '#353535');
  return new THREE.MeshPhysicalMaterial({
    name: 'bus-tinted-glazing',
    map,
    roughnessMap,
    roughness: 0.46,
    metalness: 0,
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: 0.11,
    specularIntensity: 0.8,
    onBeforeCompile(shader) {
      const lighting = THREE.ShaderChunk.lights_fragment_maps.replace(
        'radiance += getIBLRadiance', `radiance += ${SURFACE_FINISH.busGlassReflection.toFixed(2)} * getIBLRadiance`,
      );
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', lighting);
    },
  });
}

import React from 'react';
import * as THREE from 'three';
import { ACCENT } from './scenePalette';

/*
 * MACHINE GUARDING, AS IT IS BUILT: square posts, a top and bottom rail, and
 * welded wire mesh between them. The realistic look (Realism.js) draws the
 * cells' fences this way instead of from their STL.
 *
 * The STL panels are ~6,500 triangles each, 94% of them wires a few
 * millimetres thick. Thinner than a pixel from any normal viewpoint, they
 * broke up into a shimmering dot pattern that read as perforated sheet. Real
 * mesh at a distance is a dark veil you see through; here the wires are a
 * texture, so mipmapping averages them into exactly that -- about a fifth
 * covered at 3.5 mm wires on a 20 x 100 mm grid.
 *
 * Each panel fills the same box as the STL segment it replaces, in the same
 * raw room frame (millimetres, Z-up) EnvironmentElements places them in.
 */
export const FENCE_BOUNDS = Object.freeze({
  'barrier.stl': [[-409, -1055], [841, -955]],
  'barrier_closekabinet.stl': [[-1759, -1055], [-509, -955]],
  'barrier_closetable.stl': [[-409, 3195], [841, 3295]],
  'barrier_kaw1.stl': [[-2935, 1570], [-2834, 2820]],
  'barrier_kaw2.stl': [[-2935, 270], [-2834, 1520]],
  'barrier_kaw3.stl': [[-2935, -1030], [-2834, 220]],
});

const HEIGHT = 1.105;
const POST = 0.04;
const RAIL = 0.022;
const GAP = 0.12; // clear floor under the mesh, as real panels stand on their posts
const LENGTH = 1.25;
const MESH_W = LENGTH - 2 * POST;
const MESH_H = HEIGHT - GAP - RAIL;
const TILE = 0.2; // metres of mesh per texture repeat

// Safety-yellow uprights with dark powder-coated infill and crossbars.
const upright = new THREE.MeshStandardMaterial({ name: 'guard-upright', ...ACCENT.guardYellow });
const frame = { color: '#24292b', metalness: 0.03, roughness: 0.56 };
const crossbar = new THREE.MeshStandardMaterial({ name: 'guard-crossbar', ...frame });

function wireMaterial() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const px = size / (TILE * 1000); // pixels per millimetre
  const wire = 3.5 * px;
  ctx.fillStyle = '#ffffff';
  for (let mm = 0; mm < TILE * 1000; mm += 20) ctx.fillRect((mm + 10) * px - wire / 2, 0, wire, size);
  for (let mm = 0; mm < TILE * 1000; mm += 100) ctx.fillRect(0, (mm + 50) * px - wire / 2, size, wire);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(MESH_W / TILE, MESH_H / TILE);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Drawn after the solid scene and kept out of the depth buffer, so the
  // contact shadows (N8AO) work on the posts and on what is behind the mesh.
  return new THREE.MeshStandardMaterial({
    ...frame, map: texture,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}
let wires = null;

const postGeometry = new THREE.BoxGeometry(POST, POST, HEIGHT);
const railGeometry = new THREE.BoxGeometry(MESH_W, RAIL, RAIL);
const meshGeometry = new THREE.PlaneGeometry(MESH_W, MESH_H);

export default function MeshFencePanel({ bounds, position = [0, 0, 0], rotation = [0, 0, 0] }) {
  if (!wires) wires = wireMaterial();
  const [[x0, y0], [x1, y1]] = bounds.map((corner) => corner.map((mm) => mm / 1000));
  const alongX = x1 - x0 > y1 - y0;
  return (
    <group position={position} rotation={rotation}>
      <group position={[(x0 + x1) / 2, (y0 + y1) / 2, 0]} rotation={[0, 0, alongX ? 0 : Math.PI / 2]}>
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={postGeometry} material={upright} position={[side * (LENGTH - POST) / 2, 0, HEIGHT / 2]} castShadow receiveShadow />
        ))}
        {[HEIGHT - RAIL / 2, GAP - RAIL / 2].map((z) => (
          <mesh key={z} geometry={railGeometry} material={crossbar} position={[0, 0, z]} castShadow receiveShadow />
        ))}
        <mesh geometry={meshGeometry} material={wires} position={[0, 0, GAP + MESH_H / 2]} rotation={[Math.PI / 2, 0, 0]} />
      </group>
    </group>
  );
}

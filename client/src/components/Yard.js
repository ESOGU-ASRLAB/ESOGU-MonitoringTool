import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/*
 * The yard behind the far wall, seen through the open shutters (Factory.js
 * cuts the openings): asphalt with painted lane lines, a couple of
 * neighbouring sheds, a treeline and sky. It is what the buses drive out into,
 * so they leave the building and recede instead of vanishing at the wall.
 *
 * Only ever seen through two 5.5 x 3.6 m openings, so it is kept simple: one
 * ground plane, a few boxes, one backdrop.
 */
const WALL_Z = -24.6;
const DEPTH = 60;
const BACKDROP_Z = WALL_Z - DEPTH;

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 200);
  sky.addColorStop(0, '#8fbde6');
  sky.addColorStop(1, '#dde9f3');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 256);
  // Treeline along the horizon, in soft lumps.
  ctx.fillStyle = '#6f8f78';
  for (let x = 0; x < 1024; x += 18) {
    const h = 22 + Math.abs(Math.sin(x * 0.037) * 16 + Math.sin(x * 0.011) * 10);
    ctx.beginPath();
    ctx.ellipse(x, 214, 16, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(0, 214, 1024, 42);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function asphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6b7075';
  ctx.fillRect(0, 0, 512, 512);
  // Grain.
  for (let i = 0; i < 5000; i += 1) {
    const shade = 95 + Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 8})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  return texture;
}

const SHEDS = [
  { x: -22, z: -58, w: 26, h: 9, d: 14, color: '#b9c0c6' },
  { x: 14, z: -66, w: 30, h: 11, d: 16, color: '#c8ccd0' },
  { x: 30, z: -44, w: 14, h: 7, d: 12, color: '#aeb6bd' },
];

export default function Yard() {
  const textures = useMemo(() => ({ sky: skyTexture(), asphalt: asphaltTexture() }), []);
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, WALL_Z - DEPTH / 2]} receiveShadow>
        <planeGeometry args={[120, DEPTH]} />
        <meshStandardMaterial map={textures.asphalt} roughness={0.95} metalness={0} />
      </mesh>
      {/* Lane lines out from each shutter. */}
      {[-7.0, 7.0].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, WALL_Z - 14]}>
          <planeGeometry args={[0.12, 26]} />
          <meshStandardMaterial color="#e2c44a" roughness={0.8} />
        </mesh>
      ))}
      {SHEDS.map((shed) => (
        <mesh key={`${shed.x},${shed.z}`} position={[shed.x, shed.h / 2, shed.z]}>
          <boxGeometry args={[shed.w, shed.h, shed.d]} />
          <meshStandardMaterial color={shed.color} roughness={0.8} />
        </mesh>
      ))}
      {/* Sky and treeline: unlit and out of the hall's haze. */}
      <mesh position={[0, 18, BACKDROP_Z]}>
        <planeGeometry args={[220, 40]} />
        <meshBasicMaterial map={textures.sky} fog={false} />
      </mesh>
    </group>
  );
}

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { LIGHTING } from './scenePalette';
import { useRealism } from './realismContext';

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
  // The backdrop starts below the slab. Reserve only the bottom few metres
  // for trees so an eye-level view through the door actually sees the sky.
  const sky = ctx.createLinearGradient(0, 155, 0, 241);
  sky.addColorStop(0, '#89b1d3');
  sky.addColorStop(0.55, '#b2cadd');
  sky.addColorStop(1, '#edf2f3');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 256);
  // Treeline along the horizon, in soft lumps.
  ctx.fillStyle = '#9aaca6';
  for (let x = 0; x < 1024; x += 18) {
    const h = 2 + Math.abs(Math.sin(x * 0.037) * 4 + Math.sin(x * 0.011) * 2);
    ctx.beginPath();
    ctx.ellipse(x, 243, 16, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(0, 243, 1024, 13);
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
  { x: -29, z: -64, w: 20, h: 4, d: 14, color: '#aebbc3' },
  { x: 25, z: -69, w: 20, h: 4.5, d: 16, color: '#b4bfc8' },
  { x: 30, z: -44, w: 14, h: 4.3, d: 12, color: '#aeb6bd' },
];

export default function Yard() {
  const desktop = useRealism();
  const textures = useMemo(() => ({ sky: skyTexture(), asphalt: asphaltTexture() }), []);
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);

  return (
    <group name="factory-yard">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, WALL_Z - DEPTH / 2]} receiveShadow>
        <planeGeometry args={[120, DEPTH]} />
        <meshStandardMaterial map={textures.asphalt} roughness={0.95} metalness={0}
          emissive={desktop ? '#646e77' : '#000000'} emissiveMap={textures.asphalt} emissiveIntensity={1.4} />
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
          <meshStandardMaterial color={shed.color} roughness={0.8}
            emissive={desktop ? shed.color : '#000000'} emissiveIntensity={1.8} />
        </mesh>
      ))}
      {/* The sky retains HDR radiance through the open shutters. */}
      <mesh position={[0, 17, BACKDROP_Z]}>
        <planeGeometry args={[180, 38]} />
        <meshStandardMaterial color="#000000" emissive="#ffffff" emissiveMap={textures.sky}
          emissiveIntensity={desktop ? LIGHTING.yardEmission : 1} fog={false} />
      </mesh>
    </group>
  );
}

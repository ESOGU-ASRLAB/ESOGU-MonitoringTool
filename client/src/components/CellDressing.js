import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useRealism } from './realismContext';
import { ACCENT } from './scenePalette';

/*
 * What every real robot cell has and the CAD of this one does not: the
 * yellow-and-black hazard tape round its guarding, bolted fence feet, a stack
 * light on the controller, and a wired guard sensor. Only under the realistic
 * look (Realism.js). Cell-local coordinates, Y-up, south/front towards +z.
 */

// The guarding spans x -3.29..1.75 and z -3.65..1.21 (cabinet included); the
// tape runs 0.3 m outside it, 0.08 m wide, just over the realistic floor.
const TAPE = { x0: -3.6, x1: 2.05, z0: -3.95, z1: 1.5, width: 0.08, y: 0.007, tile: 0.32 };
// The controller cabinet's top (ServerCabinets.js: x -1.284, depth centre 1.0, 1.1 m tall).
const CABINET_TOP = [-1.284, 1.1, 1.0];
// The sign is tied to the mesh of the front fence's east panel, facing the aisle.
const SIGN = { position: [0.96, 0.74, 1.013], width: 0.3, height: 0.4 };
// These are the actual end posts of the front and north guarding panels.
const FENCE_FEET = Object.freeze([
  [-3.235, 1.025], [-2.786, 1.005], [-1.536, 1.005],
  [0.334, 1.005], [1.584, 1.005],
  [-2.866, -3.594], [-1.616, -3.594], [0.492, -3.594], [1.742, -3.594],
]);
const FOOT_PLATE = new THREE.BoxGeometry(0.14, 0.014, 0.14);
const FOOT_BOLT = new THREE.CylinderGeometry(0.007, 0.007, 0.006, 8);

function stripes() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e3b21a';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#16181a';
  for (let x = -64; x < 160; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 16, 32);
    ctx.lineTo(x + 48, 0);
    ctx.lineTo(x + 32, 0);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function warningSign() {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4f4f1';
  ctx.fillRect(0, 0, 300, 400);
  ctx.strokeStyle = '#1b1d1f';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 284, 384);
  // ISO 7010 W001, the general warning triangle.
  ctx.fillStyle = '#f2c200';
  ctx.strokeStyle = '#1b1d1f';
  ctx.lineWidth = 12;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(150, 34);
  ctx.lineTo(262, 222);
  ctx.lineTo(38, 222);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1b1d1f';
  ctx.fillRect(141, 92, 18, 78);
  ctx.beginPath();
  ctx.arc(150, 192, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = '800 34px "Segoe UI", Arial, sans-serif';
  ctx.fillText('CAUTION', 150, 275);
  ctx.font = '700 22px "Segoe UI", Arial, sans-serif';
  ctx.fillText('ROBOT IN OPERATION', 150, 312);
  ctx.font = '500 18px "Segoe UI", Arial, sans-serif';
  ctx.fillText('Authorised personnel only', 150, 350);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

let shared = null;
function materials() {
  if (shared) return shared;
  shared = {
    tapeMaterial: new THREE.MeshStandardMaterial({ map: stripes(), roughness: 0.65, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    sign: new THREE.MeshStandardMaterial({ map: warningSign(), roughness: 0.5, metalness: 0 }),
    pole: new THREE.MeshStandardMaterial({ color: '#8f969b', metalness: 0.6, roughness: 0.35 }),
    cap: new THREE.MeshStandardMaterial({ color: '#2a2d30', metalness: 0.2, roughness: 0.5 }),
    footing: new THREE.MeshStandardMaterial(ACCENT.guardYellow),
    bolt: new THREE.MeshStandardMaterial({ color: '#333b40', metalness: 0.7, roughness: 0.38 }),
    sensorCase: new THREE.MeshStandardMaterial({ color: '#d4aa39', metalness: 0.25, roughness: 0.48 }),
    sensorFace: new THREE.MeshStandardMaterial({ color: '#22292c', metalness: 0.2, roughness: 0.45 }),
    conduit: new THREE.MeshStandardMaterial({ color: '#42494d', metalness: 0.55, roughness: 0.52 }),
    sensorGreen: new THREE.MeshStandardMaterial({ color: '#39bd68', emissive: '#188c42', emissiveIntensity: 1.2 }),
    sensorAmber: new THREE.MeshStandardMaterial({ color: '#c58c2d', emissive: '#9b5f09', emissiveIntensity: 0.6 }),
  };
  return shared;
}

function FenceFootings() {
  const plateRef = useRef(null);
  const boltRef = useRef(null);
  const { footing, bolt } = materials();
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    let boltIndex = 0;
    FENCE_FEET.forEach(([x, z], plateIndex) => {
      matrix.makeTranslation(x, 0.008, z);
      plateRef.current.setMatrixAt(plateIndex, matrix);
      for (const dx of [-0.048, 0.048]) {
        for (const dz of [-0.048, 0.048]) {
          matrix.makeTranslation(x + dx, 0.019, z + dz);
          boltRef.current.setMatrixAt(boltIndex++, matrix);
        }
      }
    });
    plateRef.current.instanceMatrix.needsUpdate = true;
    boltRef.current.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <>
      <instancedMesh ref={plateRef} args={[FOOT_PLATE, footing, FENCE_FEET.length]} frustumCulled={false} receiveShadow dispose={null} />
      <instancedMesh ref={boltRef} args={[FOOT_BOLT, bolt, FENCE_FEET.length * 4]} frustumCulled={false} dispose={null} />
    </>
  );
}

/* A small interlock status sensor on the outer face of the east front post.
 * Its conduit follows the guard's low rail to the controller cabinet; neither
 * crosses the robot or the operator's working space. */
function GuardSensor({ running }) {
  const { sensorCase, sensorFace, conduit, sensorGreen, sensorAmber } = materials();
  return (
    <group>
      <mesh material={conduit} position={[0.31, 0.074, 1.075]} receiveShadow>
        <boxGeometry args={[2.78, 0.024, 0.024]} />
      </mesh>
      <mesh material={conduit} position={[1.7, 0.49, 1.075]} receiveShadow>
        <boxGeometry args={[0.024, 0.81, 0.024]} />
      </mesh>
      <group position={[1.7, 0.9, 1.1]}>
        <mesh material={sensorCase} castShadow>
          <boxGeometry args={[0.115, 0.14, 0.065]} />
        </mesh>
        <mesh material={sensorFace} position={[0, 0, 0.038]}>
          <boxGeometry args={[0.087, 0.106, 0.012]} />
        </mesh>
        <mesh material={running ? sensorGreen : sensorAmber} position={[0, 0.027, 0.045]}>
          <boxGeometry args={[0.035, 0.014, 0.004]} />
        </mesh>
      </group>
    </group>
  );
}

function HazardTape() {
  const { tapeMaterial } = materials();
  // Each side its own strip; the stripes run along it.
  const sides = useMemo(() => {
    const { x0, x1, z0, z1, width, tile } = TAPE;
    const strip = (length, position, yaw) => {
      const geometry = new THREE.PlaneGeometry(length, width);
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i += 1) uv.setX(i, uv.getX(i) * (length / tile));
      return { geometry, position, yaw };
    };
    return [
      strip(x1 - x0 + width, [(x0 + x1) / 2, TAPE.y, z0], 0),
      strip(x1 - x0 + width, [(x0 + x1) / 2, TAPE.y, z1], 0),
      strip(z1 - z0 - width, [x0, TAPE.y, (z0 + z1) / 2], Math.PI / 2),
      strip(z1 - z0 - width, [x1, TAPE.y, (z0 + z1) / 2], Math.PI / 2),
    ];
  }, []);
  return sides.map(({ geometry, position, yaw }, i) => (
    <mesh key={i} geometry={geometry} material={tapeMaterial} position={position} rotation={[-Math.PI / 2, 0, yaw]} receiveShadow />
  ));
}

/*
 * The controller's stack light: green while the cell runs, amber when it is
 * stopped. The lit lens glows enough to catch the eye, not to light the room.
 */
function StackLight({ running }) {
  const { pole, cap } = materials();
  const lenses = useMemo(() => [
    { color: '#c8302a', lit: false },
    { color: '#e8a21c', lit: !running },
    { color: '#2fb455', lit: running },
  ], [running]);
  const [x, y, z] = CABINET_TOP;
  return (
    <group position={[x + 0.14, y, z - 0.1]}>
      <mesh material={pole} position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.18, 12]} />
      </mesh>
      {lenses.map(({ color, lit }, i) => (
        <mesh key={color} position={[0, 0.21 + (2 - i) * 0.062, 0]} castShadow>
          <cylinderGeometry args={[0.034, 0.034, 0.058, 20]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={lit ? 7 : 0.04}
            roughness={0.35}
            metalness={0}
            transparent
            opacity={0.92}
          />
        </mesh>
      ))}
      <mesh material={cap} position={[0, 0.21 + 3 * 0.062 - 0.012, 0]}>
        <cylinderGeometry args={[0.03, 0.034, 0.03, 20]} />
      </mesh>
    </group>
  );
}

export default function CellDressing({ running }) {
  const realistic = useRealism();
  if (!realistic) return null;
  const { sign } = materials();
  return (
    <group>
      <HazardTape />
      <FenceFootings />
      <StackLight running={running} />
      <GuardSensor running={running} />
      <mesh material={sign} position={SIGN.position}>
        <planeGeometry args={[SIGN.width, SIGN.height]} />
      </mesh>
    </group>
  );
}

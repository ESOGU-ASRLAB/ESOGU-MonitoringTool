import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import Prop, { PROP_BASE } from './Prop';

/*
 * The hall's fire and first-aid equipment, where a real shed would keep it:
 * extinguishers at the far wall's clear spots and along both side walls, each
 * under its sign; the exit sign over the one pedestrian door; first aid beside
 * that door. Nothing stands loose on the floor:
 * every extinguisher is on a wall bracket, where a real shed keeps them.
 *
 * Far-wall positions are read off the wall itself (see WallLogos.js for the
 * survey): cladding at z = -24.57, the shutters at x = +/-(3.21..8.69) up to
 * y = 3.63, the pedestrian door at x = -2.33..-1.13 up to y = 1.96, steel posts
 * at x = +/-2.97 and +/-8.99, girts at y = 2.41-2.61 and 3.77-3.95. Nothing
 * here overlaps a shutter or a door, and nothing sits across a girt.
 */
const FAR_WALL_Z = -24.55;
const WEST_WALL_X = -16.2;
const EAST_WALL_X = 16.2;

const FACING = {
  north: 0, // on the far wall, facing into the hall (+z)
  east: Math.PI / 2, // on the west wall, facing +x
  west: -Math.PI / 2, // on the east wall, facing -x
};

// Bracket-mounted extinguishers: [x, z, facing]. Handle height about 1.2 m.
const WALL_EXTINGUISHERS = [
  [-2.62, FAR_WALL_Z, 'north'],
  [-10.2, FAR_WALL_Z, 'north'],
  [10.2, FAR_WALL_Z, 'north'],
  [WEST_WALL_X, -6.0, 'east'],
  [WEST_WALL_X, 10.0, 'east'],
  [EAST_WALL_X, -16.0, 'west'],
  [EAST_WALL_X, 21.0, 'west'],
];

export const EXTINGUISHER_COUNT = WALL_EXTINGUISHERS.length;

const EXTINGUISHER_HEIGHT = 0.62;
const EXTINGUISHER_MOUNT_Y = 0.75;
const SIGN_SIZE = 0.3;

// ISO 7010-style pictogram plates, painted once and shared.
function paintSign(draw) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function drawExtinguisherSign(ctx, s) {
  ctx.fillStyle = '#d0202a';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.05;
  // Cylinder with a domed top.
  ctx.beginPath();
  ctx.roundRect(s * 0.34, s * 0.34, s * 0.22, s * 0.52, [s * 0.1, s * 0.1, s * 0.03, s * 0.03]);
  ctx.fill();
  // Valve, lever and hose.
  ctx.fillRect(s * 0.41, s * 0.24, s * 0.08, s * 0.12);
  ctx.beginPath();
  ctx.moveTo(s * 0.45, s * 0.24);
  ctx.lineTo(s * 0.66, s * 0.16);
  ctx.moveTo(s * 0.49, s * 0.28);
  ctx.quadraticCurveTo(s * 0.72, s * 0.3, s * 0.7, s * 0.58);
  ctx.stroke();
  // Flame, top right.
  ctx.beginPath();
  ctx.moveTo(s * 0.8, s * 0.1);
  ctx.quadraticCurveTo(s * 0.95, s * 0.28, s * 0.84, s * 0.38);
  ctx.quadraticCurveTo(s * 0.72, s * 0.3, s * 0.8, s * 0.1);
  ctx.fill();
}

function drawFirstAidSign(ctx, s) {
  ctx.fillStyle = '#0a8f4a';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(s * 0.4, s * 0.18, s * 0.2, s * 0.64);
  ctx.fillRect(s * 0.18, s * 0.4, s * 0.64, s * 0.2);
}

function SignPlate({ texture, position, rotation }) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[SIGN_SIZE, SIGN_SIZE]} />
      <meshStandardMaterial map={texture} roughness={0.5} metalness={0} />
    </mesh>
  );
}

// Offset along the wall's normal, so a plate stands just proud of it.
function proud(x, z, facing, distance) {
  const yaw = FACING[facing];
  return [x + Math.sin(yaw) * distance, z + Math.cos(yaw) * distance];
}

export default function SafetyEquipment() {
  const signs = useMemo(() => ({
    extinguisher: paintSign(drawExtinguisherSign),
    firstAid: paintSign(drawFirstAidSign),
  }), []);
  useEffect(() => () => Object.values(signs).forEach((texture) => texture.dispose()), [signs]);

  return (
    <group>
      {WALL_EXTINGUISHERS.map(([x, z, facing]) => {
        const [sx, sz] = proud(x, z, facing, 0.01);
        return (
          <group key={`${x},${z}`}>
            <Prop
              url={PROP_BASE + 'extinguisher.glb'}
              height={EXTINGUISHER_HEIGHT}
              anchor="wall"
              position={[x, EXTINGUISHER_MOUNT_Y, z]}
              rotation={[0, FACING[facing], 0]}
            />
            <SignPlate
              texture={signs.extinguisher}
              position={[sx, EXTINGUISHER_MOUNT_Y + EXTINGUISHER_HEIGHT + 0.35, sz]}
              rotation={[0, FACING[facing], 0]}
            />
          </group>
        );
      })}

      {/* Over the pedestrian door, between its head (1.96) and the girt (2.41). */}
      <Prop
        url={PROP_BASE + 'fire_exit.glb'}
        height={0.3}
        anchor="wall"
        position={[-1.73, 2.04, FAR_WALL_Z]}
      />

      {/* First aid beside the door, under its sign. */}
      <Prop
        url={PROP_BASE + 'first_aid.glb'}
        height={0.34}
        anchor="wall"
        position={[-0.45, 1.15, FAR_WALL_Z]}
      />
      <SignPlate texture={signs.firstAid} position={[-0.45, 1.85, FAR_WALL_Z + 0.01]} rotation={[0, 0, 0]} />

      {/* Wet-floor sign where the scrubber is working. */}
      <Prop url={PROP_BASE + 'wetfloor.glb'} height={0.62} position={[12.3, 0, 9.5]} rotation={[0, -0.6, 0]} />
    </group>
  );
}

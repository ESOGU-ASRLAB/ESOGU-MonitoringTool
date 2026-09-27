import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { METAL } from './scenePalette';
import { doorOpenness } from './busRoute';

/*
 * Working roller shutters on the far wall.
 *
 * The two shutters in the warehouse model are painted into the wall texture,
 * so they cannot open. Each gets a real curtain laid over its painted one --
 * x = +/-(3.21..8.69), y = 0..3.63, measured off the texture (see
 * WallLogos.js). Factory.js cuts the opening itself through the wall, and
 * the yard behind it is real (Yard.js). The curtain rolls up into a
 * housing at the head of the opening and back down, timed to the graphite
 * bus leaving through the east door and returning through the west one
 * (busRoute.js).
 *
 * Everything stands in front of the wall's girts (front face z = -24.40), so
 * an open door is not crossed by the girt that runs behind it.
 */
const DOORS = [{ centreX: -5.95 }, { centreX: 5.95 }];
const WIDTH = 8.69 - 3.21;
const HEIGHT = 3.63;
const Z = { curtain: -24.37, frame: -24.33 };

// Ribbed galvanised slats, with a heavier bottom rail.
function curtainTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const slats = 28;
  const pitch = canvas.height / slats;
  for (let i = 0; i < slats; i += 1) {
    const y = i * pitch;
    const gradient = ctx.createLinearGradient(0, y, 0, y + pitch);
    gradient.addColorStop(0, '#5d646b');
    gradient.addColorStop(0.45, '#8a929a');
    gradient.addColorStop(0.9, '#4a5057');
    gradient.addColorStop(1, '#2c3035');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, canvas.width, pitch);
  }
  ctx.fillStyle = '#1f2327';
  ctx.fillRect(0, canvas.height - 10, canvas.width, 10);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(8, 1);
  return texture;
}

function Door({ centreX, curtain, clip }) {
  const curtainRef = useRef(null);

  useFrame(({ clock }) => {
    // The curtain slides up behind the housing; the clip plane at the head of
    // the opening hides whatever has rolled away.
    if (curtainRef.current) curtainRef.current.position.y = HEIGHT / 2 + doorOpenness(centreX, clock.getElapsedTime()) * (HEIGHT - 0.12);
  });

  return (
    <group position={[centreX, 0, 0]}>
      <mesh ref={curtainRef} position={[0, HEIGHT / 2, Z.curtain]}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshStandardMaterial map={curtain} metalness={0.35} roughness={0.55} clippingPlanes={clip} />
      </mesh>
      {/* Coil housing across the head, and the two guide channels. */}
      <mesh position={[0, HEIGHT + 0.16, Z.frame]} castShadow>
        <boxGeometry args={[WIDTH + 0.3, 0.36, 0.34]} />
        <meshStandardMaterial color="#3a4046" metalness={0.3} roughness={0.5} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (WIDTH / 2 + 0.06), HEIGHT / 2, Z.frame]}>
          <boxGeometry args={[0.12, HEIGHT, 0.12]} />
          <meshStandardMaterial {...METAL.galvanised} />
        </mesh>
      ))}
    </group>
  );
}

export default function GarageDoors() {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const previous = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = previous;
    };
  }, [gl]);

  const textures = useMemo(() => ({ curtain: curtainTexture() }), []);
  useEffect(() => () => Object.values(textures).forEach((texture) => texture.dispose()), [textures]);
  // Keep y <= HEIGHT: the curtain disappears into the housing.
  const clip = useMemo(() => [new THREE.Plane(new THREE.Vector3(0, -1, 0), HEIGHT)], []);

  return DOORS.map((door) => (
    <Door key={door.centreX} {...door} curtain={textures.curtain} clip={clip} />
  ));
}

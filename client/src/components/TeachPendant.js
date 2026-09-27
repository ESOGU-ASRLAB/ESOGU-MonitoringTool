import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/*
 * A UR teach pendant, as held: a dark tablet housing with a touch screen
 * running a PolyScope-style program view, the red emergency stop on its
 * yellow collar at the top corner, and the cable dropping from the top edge.
 *
 * Built in its own frame: screen facing -z (towards whoever holds it), top
 * edge +y. 0.30 x 0.23 x 0.05 m, like the real one.
 */
const W = 0.3;
const H = 0.23;
const T = 0.045;

function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 170;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(0, 0, 256, 170);
  // Header bar with the UR mark and a run state.
  ctx.fillStyle = '#1f4f8f';
  ctx.fillRect(0, 0, 256, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Arial';
  ctx.fillText('UR', 8, 16);
  ctx.font = '10px Arial';
  ctx.fillText('PROGRAM  pick_and_place.urp', 34, 15);
  ctx.fillStyle = '#35e07a';
  ctx.beginPath();
  ctx.arc(244, 11, 5, 0, Math.PI * 2);
  ctx.fill();
  // Program tree.
  ctx.fillStyle = '#1b2430';
  ctx.font = '9px Arial';
  ['Robot Program', '  MoveJ  Home', '  MoveL  Above belt', '  Camera  Locate box', '  Gripper  Close', '  MoveL  Table spot', '  Gripper  Open']
    .forEach((line, i) => {
      if (i === 3) {
        ctx.fillStyle = '#cfe0f7';
        ctx.fillRect(4, 30 + i * 15 - 10, 126, 13);
        ctx.fillStyle = '#1b2430';
      }
      ctx.fillText(line, 8, 30 + i * 15);
    });
  // Joint readouts on the right.
  ctx.fillStyle = '#5d6877';
  ['Base', 'Shoulder', 'Elbow', 'Wrist 1', 'Wrist 2', 'Wrist 3'].forEach((label, i) => {
    const y = 34 + i * 17;
    ctx.fillText(label, 140, y);
    ctx.fillStyle = '#d5dbe3';
    ctx.fillRect(186, y - 7, 62, 6);
    ctx.fillStyle = '#2060cd';
    ctx.fillRect(186, y - 7, 18 + ((i * 23) % 40), 6);
    ctx.fillStyle = '#5d6877';
  });
  // Footer: play / pause / stop.
  ctx.fillStyle = '#dde3ea';
  ctx.fillRect(0, 146, 256, 24);
  ['#35a86b', '#d9a520', '#c93b3b'].forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(160 + i * 30, 151, 22, 14);
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export default function TeachPendant(props) {
  const screen = useMemo(screenTexture, []);
  useEffect(() => () => screen.dispose(), [screen]);

  return (
    <group {...props}>
      <mesh castShadow>
        <boxGeometry args={[W, H, T]} />
        <meshStandardMaterial color="#2a2e33" roughness={0.55} metalness={0.1} />
      </mesh>
      {/* Grip ridges on the back. */}
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, -0.01, T / 2 + 0.008]}>
          <boxGeometry args={[0.05, H * 0.8, 0.016]} />
          <meshStandardMaterial color="#1c1f23" roughness={0.8} />
        </mesh>
      ))}
      {/* Screen, lit. */}
      <mesh position={[-0.012, -0.004, -T / 2 - 0.001]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.235, 0.157]} />
        <meshBasicMaterial map={screen} toneMapped={false} />
      </mesh>
      {/* Emergency stop: yellow collar, red mushroom, top right. */}
      <group position={[W / 2 - 0.03, H / 2 - 0.03, -T / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0.006, 0]}>
          <cylinderGeometry args={[0.024, 0.024, 0.012, 24]} />
          <meshStandardMaterial color="#f2c230" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.018, 0.015, 0.018, 24]} />
          <meshStandardMaterial color="#d62020" roughness={0.35} />
        </mesh>
      </group>
      {/* Cable leaving the top edge and falling away. */}
      <mesh position={[-W / 2 + 0.04, H / 2 + 0.05, 0]}>
        <cylinderGeometry args={[0.007, 0.007, 0.1, 8]} />
        <meshStandardMaterial color="#15181b" roughness={0.7} />
      </mesh>
    </group>
  );
}

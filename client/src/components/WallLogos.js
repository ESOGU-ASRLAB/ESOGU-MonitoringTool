import React, { useEffect, useState } from 'react';
import * as THREE from 'three';

const SIGN = { width: 5.2, height: 1.98, depth: 0.045 };
const CENTER = [0, 6.0, -24.31];
const PX_W = 2048;
const PX_H = Math.round(PX_W * SIGN.height / SIGN.width);
const PAPER = '#e8e9e5';

function makeFace() {
  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = PX_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PX_W, PX_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#162c41';
  ctx.font = '800 348px system-ui, sans-serif';
  ctx.fillText('MATISSE', PX_W / 2, 354, PX_W - 192);

  ctx.fillStyle = '#a0a7a8';
  ctx.fillRect(136, 437, PX_W - 272, 4);
  ctx.fillStyle = '#1e282b';
  ctx.font = '750 226px system-ui, sans-serif';
  ctx.fillText('ASRLab', PX_W * 0.251, 670, 870);
  ctx.fillText('IFARLAB', PX_W * 0.749, 670, 870);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export default function WallLogos() {
  const [face, setFace] = useState(null);
  useEffect(() => {
    const texture = makeFace();
    setFace(texture);
    return () => texture.dispose();
  }, []);

  return (
    <group name="factory-identification-sign" position={CENTER}>
      <mesh>
        <boxGeometry args={[SIGN.width, SIGN.height, SIGN.depth]} />
        <meshStandardMaterial color="#555851" metalness={0.35} roughness={0.57} />
      </mesh>
      {face && (
        <mesh position={[0, 0, SIGN.depth / 2 + 0.003]}>
          <planeGeometry args={[SIGN.width - 0.018, SIGN.height - 0.018]} />
          <meshStandardMaterial map={face} roughness={0.82} metalness={0} />
        </mesh>
      )}
      {[-2.2, 2.2].map((x) => (
        <mesh key={x} position={[x, 0, -0.106]}>
          <boxGeometry args={[0.07, 1.83, 0.17]} />
          <meshStandardMaterial color="#464a48" metalness={0.2} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

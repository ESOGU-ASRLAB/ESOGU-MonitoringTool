import React, { useEffect, useState } from 'react';
import * as THREE from 'three';

const SIGN = { width: 5.55, height: 2.12, depth: 0.06 };
const CENTER = [0, 6.03, -24.12];
const PX_W = 2048;
const PX_H = Math.round(PX_W * SIGN.height / SIGN.width);
const PAPER = '#f3f5f4';
const BLUE = '#142e53';

function makeFace() {
  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = PX_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PX_W, PX_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = BLUE;
  ctx.font = '800 354px system-ui, sans-serif';
  ctx.fillText('MATISSE', PX_W / 2, 370, PX_W - 156);

  ctx.fillRect(0, 454, PX_W, PX_H - 454);
  ctx.fillStyle = '#6e88a4';
  ctx.fillRect(PX_W / 2 - 2, 529, 4, 184);
  ctx.fillStyle = '#f6f8fb';
  ctx.font = '800 224px system-ui, sans-serif';
  ctx.fillText('ASRLab', PX_W * 0.25, 690, 868);
  ctx.fillText('IFARLAB', PX_W * 0.75, 690, 868);
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
        <mesh position={[0, 0, SIGN.depth / 2 + 0.008]}>
          <planeGeometry args={[SIGN.width - 0.018, SIGN.height - 0.018]} />
          <meshStandardMaterial map={face} roughness={0.82} metalness={0} />
        </mesh>
      )}
      {[-2.28, 2.28].map((x) => (
        <mesh key={x} position={[x, 0, -0.2]}>
          <boxGeometry args={[0.07, 1.94, 0.34]} />
          <meshStandardMaterial color="#464a48" metalness={0.2} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

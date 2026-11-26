import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { METAL } from './scenePalette';

const LOGOS = process.env.PUBLIC_URL + '/assets/logo/';
const WALL_Z = -23.75;
const DEPTH = 0.16;
const RIM = 0.035;
const BLUE = '#0a4f86';
const ACCENT = '#5aa9e6';
const FONT = 'system-ui, sans-serif';
const SIGNS = [
  { id: 'matisse', label: 'MATISSE', logo: 'logo.svg', width: 4.6, height: 1.5, y: 7.65 },
  { id: 'asrlab', label: 'ASRLab', logo: 'asrlab-wall.webp', width: 4.2, height: 1.3, y: 5.9 },
  { id: 'ifarlab', label: 'IFARLAB', logo: 'ifarlab-wall.webp', width: 4.2, height: 1.3, y: 4.25 },
];

function loadLogo(file) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = LOGOS + file;
  });
}

function drawLab(ctx, label, image, width, height) {
  const diameter = image ? height * 0.77 : 0;
  const gap = image ? height * 0.21 : 0;
  ctx.font = `750 ${Math.round(height * 0.41)}px ${FONT}`;
  const labelWidth = Math.min(ctx.measureText(label).width, width * 0.88 - diameter - gap);
  const left = (width - diameter - gap - labelWidth) / 2;
  const centreY = height / 2;

  ctx.fillStyle = '#f6f9ff';
  if (image) {
    const centreX = left + diameter / 2;
    ctx.beginPath();
    ctx.arc(centreX, centreY, diameter / 2, 0, Math.PI * 2);
    ctx.fill();
    const scale = (diameter - 12) / Math.max(image.width, image.height);
    const [w, h] = [image.width * scale, image.height * scale];
    ctx.drawImage(image, centreX - w / 2, centreY - h / 2, w, h);
    ctx.fillRect(left + diameter + gap / 2, height * 0.24, 3, height * 0.52);
  }
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + diameter + gap, centreY, labelWidth);
}

function makeFace(sign, image) {
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = Math.round(canvas.width * (sign.height - 2 * RIM) / (sign.width - 2 * RIM));
  const { width, height } = canvas;
  const band = Math.round(height * 0.045);
  const faceHeight = height - band;
  const ctx = canvas.getContext('2d');

  if (sign.id === 'matisse' && image) {
    // Use the official wordmark silhouette in white on the blue face.
    const scale = Math.min(width * 0.8 / image.width, faceHeight * 0.74 / image.height);
    const [w, h] = [image.width * scale, image.height * scale];
    ctx.drawImage(image, (width - w) / 2, (faceHeight - h) / 2, w, h);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-over';
  }
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, faceHeight, width, band);
  if (sign.id !== 'matisse' || !image) {
    drawLab(ctx, sign.label, image, width, faceHeight);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function HangingSign({ sign, face, top }) {
  const { id, width, height, y } = sign;
  const cableLength = top - (y + height / 2);
  return (
    <group name={`factory-sign-${id}`} position={[0, y, 0]}>
      <mesh>
        <boxGeometry args={[width, height, DEPTH]} />
        <meshStandardMaterial color="#48545e" metalness={0.55} roughness={0.51} />
      </mesh>
      <mesh position={[0, 0, DEPTH / 2 + 0.004]}>
        <planeGeometry args={[width - 2 * RIM, height - 2 * RIM]} />
        <meshStandardMaterial
          map={face} roughness={0.58} metalness={0}
          emissive="#ffffff" emissiveMap={face} emissiveIntensity={0.65}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 - 0.4), (height + cableLength) / 2, 0]}>
          <cylinderGeometry args={[0.012, 0.012, cableLength, 8]} />
          <meshStandardMaterial {...METAL.galvanised} />
        </mesh>
      ))}
    </group>
  );
}

export default function WallLogos() {
  const [faces, setFaces] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let textures;
    Promise.all(SIGNS.map(({ logo }) => loadLogo(logo))).then((images) => {
      if (cancelled) return;
      textures = SIGNS.map((sign, index) => makeFace(sign, images[index]));
      setFaces(textures);
    });
    return () => {
      cancelled = true;
      textures?.forEach((texture) => texture.dispose());
    };
  }, []);

  return (
    <group name="factory-identification-sign" position={[0, 0, WALL_Z]}>
      {faces && SIGNS.map((sign, index) => {
        // The headline hangs from the roof and each lab board from the one above.
        const above = SIGNS[index - 1];
        const top = above ? above.y - above.height / 2 : 9.97;
        return <HangingSign key={sign.id} sign={sign} face={faces[index]} top={top} />;
      })}
    </group>
  );
}

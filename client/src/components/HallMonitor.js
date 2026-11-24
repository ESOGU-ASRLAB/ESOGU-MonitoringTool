import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { METAL } from './scenePalette';
import { inspection, ifarlab } from './inspectionState';
import { runWhileVisible } from './pageActivity';

const SCREENS = [
  { page: 'hall', centre: [-5.7, 6.03, -24.28] },
  { page: 'cells', centre: [5.7, 6.03, -24.28] },
];
const WIDTH = 2.65;
const HEIGHT = WIDTH * 9 / 16;
const BEZEL = 0.028;
const DEPTH = 0.065;
const PX_W = 960;
const PX_H = 540;
const FONT = 'system-ui, sans-serif';
const BG = '#1b1e20';
const RULE = '#3e4547';
const INK = '#e0e4e2';
const MUTED = '#a4adad';
const ACTIVE = '#93b0a4';

function text(ctx, copy, x, y, { size = 25, weight = 500, color = INK, align = 'left' } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(copy, x, y);
}

function rule(ctx, y) {
  ctx.fillStyle = RULE;
  ctx.fillRect(30, y, 900, 2);
}

function drawHeader(ctx, title) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, PX_W, PX_H);
  text(ctx, title, 30, 48, { size: 37, weight: 650 });
  text(ctx, 'MATISSE', 930, 48, { size: 25, weight: 600, color: MUTED, align: 'right' });
  rule(ctx, 83);
}

function drawOverview(ctx) {
  drawHeader(ctx, 'Production overview');
  text(ctx, 'Station', 30, 118, { color: MUTED });
  text(ctx, 'State', 930, 118, { color: MUTED, align: 'right' });
  rule(ctx, 144);

  [
    ['Bus body inspection', inspection.status],
    ['UR10e pick & place', ifarlab.ur],
    ['Kawasaki chassis inspection', ifarlab.kawasaki],
  ].forEach(([name, state], index) => {
    const y = 195 + index * 99;
    text(ctx, name, 30, y, { size: 31, weight: 550 });
    text(ctx, state, 930, y, { size: 25, color: state === 'IDLE' ? MUTED : ACTIVE, align: 'right' });
    rule(ctx, y + 49);
  });
  text(ctx, 'Simulation', 30, 491, { size: 22, color: MUTED });
}

function drawCounters(ctx) {
  drawHeader(ctx, 'Workcell counters');
  const progress = THREE.MathUtils.clamp(inspection.progress, 0, 1);
  text(ctx, 'Bus inspection', 30, 139, { size: 31, weight: 600 });
  text(ctx, `${Math.round(progress * 100)}%`, 930, 139, { size: 38, weight: 600, align: 'right' });
  ctx.fillStyle = RULE;
  ctx.fillRect(30, 179, 900, 10);
  ctx.fillStyle = ACTIVE;
  ctx.fillRect(30, 179, 900 * progress, 10);
  text(ctx, `Body ${String(inspection.cycle).padStart(3, '0')}   /   ${inspection.defects} findings`, 30, 222, { color: MUTED });
  rule(ctx, 267);
  text(ctx, 'Boxes transferred', 30, 324, { size: 31 });
  text(ctx, String(ifarlab.picks), 930, 324, { size: 38, weight: 600, align: 'right' });
  rule(ctx, 382);
  text(ctx, 'Chassis bays checked', 30, 433, { size: 31 });
  text(ctx, String(ifarlab.scans), 930, 433, { size: 38, weight: 600, align: 'right' });
  text(ctx, `${ifarlab.findings} findings`, 30, 485, { color: MUTED });
}

function WorkcellDisplay({ page, centre }) {
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = PX_W;
    canvas.height = PX_H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { canvas, texture };
  }, []);

  useEffect(() => {
    const ctx = canvas.getContext('2d');
    const draw = page === 'hall' ? drawOverview : drawCounters;
    const paint = () => {
      draw(ctx);
      texture.needsUpdate = true;
    };
    let timer;
    const stop = runWhileVisible(() => {
      paint();
      timer = setInterval(paint, 1000);
    }, () => clearInterval(timer));
    return () => {
      stop();
      texture.dispose();
    };
  }, [canvas, texture, page]);

  return (
    <group name={`factory-display-${page}`} position={centre}>
      <mesh>
        <boxGeometry args={[WIDTH + BEZEL * 2, HEIGHT + BEZEL * 2, DEPTH]} />
        <meshStandardMaterial color="#242625" roughness={0.67} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, DEPTH / 2 + 0.002]}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshStandardMaterial color="#101212" roughness={0.38} metalness={0}
          emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.68} />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 0.03, -0.11]}>
          <boxGeometry args={[0.07, HEIGHT - 0.12, 0.17]} />
          <meshStandardMaterial {...METAL.galvanised} />
        </mesh>
      ))}
    </group>
  );
}

export default function HallMonitor() {
  return SCREENS.map((screen) => <WorkcellDisplay key={screen.page} {...screen} />);
}

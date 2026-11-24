import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { METAL } from './scenePalette';
import { inspection, ifarlab } from './inspectionState';
import { runWhileVisible } from './pageActivity';

const SCREENS = [
  { page: 'hall', centre: [-5.6, 6.03, -24.12] },
  { page: 'cells', centre: [5.6, 6.03, -24.12] },
];
const WIDTH = 3.22;
const HEIGHT = WIDTH * 9 / 16;
const BEZEL = 0.035;
const DEPTH = 0.075;
const PX_W = 960;
const PX_H = 540;
const FONT = 'system-ui, sans-serif';
const EDGE = 36;
const BG = '#102032';
const CARD = '#1a3048';
const INK = '#f4f8ff';
const MUTED = '#bfcedf';
const ACTIVE = '#7be1f3';
const COMPLETE = '#9ce5bd';

function text(ctx, copy, x, y, { size = 25, weight = 500, color = INK, align = 'left' } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(copy, x, y);
}

function panel(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fill();
}

function drawHeader(ctx, title) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, PX_W, PX_H);
  ctx.fillStyle = '#21466a';
  ctx.fillRect(0, 0, PX_W, 96);
  ctx.fillStyle = ACTIVE;
  ctx.fillRect(0, 96, PX_W, 4);
  text(ctx, title, EDGE, 48, { size: 44, weight: 700 });
  text(ctx, 'Simulation', PX_W - EDGE, 48, { size: 25, color: MUTED, align: 'right' });
}

function drawOverview(ctx) {
  drawHeader(ctx, 'Production overview');
  [
    ['Bus body inspection', inspection.status],
    ['UR10e pick & place', ifarlab.ur],
    ['Kawasaki inspection', ifarlab.kawasaki],
  ].forEach(([name, state], index) => {
    const y = 126 + index * 128;
    panel(ctx, EDGE, y, PX_W - 2 * EDGE, 102, CARD);
    const color = state === 'IDLE' ? MUTED : (state === 'COMPLETE' ? COMPLETE : ACTIVE);
    ctx.fillStyle = color;
    ctx.fillRect(EDGE + 17, y + 24, 6, 54);
    text(ctx, name, EDGE + 39, y + 51, { size: 38, weight: 600 });
    text(ctx, state, PX_W - EDGE - 23, y + 51, { size: 29, weight: 700, color, align: 'right' });
  });
}

function drawCounters(ctx) {
  drawHeader(ctx, 'Workcell counters');
  const progress = THREE.MathUtils.clamp(inspection.progress, 0, 1);
  panel(ctx, EDGE, 126, PX_W - 2 * EDGE, 172, CARD);
  text(ctx, 'Bus inspection', 62, 170, { size: 39, weight: 650 });
  text(ctx, `${Math.round(progress * 100)}%`, 898, 170, { size: 51, weight: 750, color: ACTIVE, align: 'right' });
  ctx.fillStyle = '#355069';
  ctx.fillRect(62, 213, 836, 14);
  ctx.fillStyle = ACTIVE;
  ctx.fillRect(62, 213, 836 * progress, 14);
  text(ctx, `Body ${String(inspection.cycle).padStart(3, '0')}   /   ${inspection.defects} findings`, 62, 261, { size: 27, color: MUTED });

  const counters = [
    ['Boxes moved', ifarlab.picks],
    ['Chassis bays checked', ifarlab.scans, `${ifarlab.findings} findings`],
  ];
  counters.forEach(([label, value, detail], index) => {
    const x = EDGE + index * 454;
    panel(ctx, x, 326, 434, 178, CARD);
    text(ctx, label, x + 25, 374, { size: 31, weight: 600, color: MUTED });
    text(ctx, String(value), x + 25, 451, { size: 64, weight: 750 });
    if (detail) text(ctx, detail, x + 410, 451, { size: 26, color: MUTED, align: 'right' });
  });
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
      <mesh position={[0, 0, DEPTH / 2 + 0.006]}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshStandardMaterial color="#08111b" roughness={0.58} metalness={0}
          emissive="#ffffff" emissiveMap={texture} emissiveIntensity={1.18} />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 0.03, -0.2]}>
          <boxGeometry args={[0.07, HEIGHT - 0.12, 0.34]} />
          <meshStandardMaterial {...METAL.galvanised} />
        </mesh>
      ))}
    </group>
  );
}

export default function HallMonitor() {
  return SCREENS.map((screen) => <WorkcellDisplay key={screen.page} {...screen} />);
}

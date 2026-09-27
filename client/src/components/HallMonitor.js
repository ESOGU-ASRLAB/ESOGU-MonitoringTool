import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { METAL } from './scenePalette';
import { EXTINGUISHER_COUNT } from './SafetyEquipment';
import { inspection, ifarlab } from './inspectionState';

/*
 * The hall's status displays: two video walls on the far wall.
 *
 * Flush on the wall they would sit across the girts at y = 4.68-4.89 and
 * 6.73-6.93, so they are mounted proud of them on stand-off arms: the girts'
 * front face is z = -24.40, the screens' backs are at -24.26.
 *
 * Each picture is a canvas redrawn twice a second. The hall page is a status
 * list for everything working in the hall, with status lamps that flash, a
 * cursor stepping down the list, a running clock and an alert bar that blinks;
 * the cells page follows the three robot tasks as they run.
 */
/*
 * Two large-format displays, one over each shutter, 4.4 x 2.48 m, hung high
 * (bottom 5.8 m) so from the opening camera they sit above the Otokar gantry
 * column rather than behind it, and drawn in towards the lab signs: inner
 * edges at x = +/-2.9, 0.8 m off the signs (which reach +/-2.1). The west one is the hall overview; the east one follows the
 * two cells' work.
 */
export const SCREENS = [
  { page: 'hall', centre: [-5.1, 7.05, -24.24] },
  { page: 'cells', centre: [5.1, 7.05, -24.24] },
];
const SCREEN = { width: 4.4, height: 2.475 }; // a 200" panel
const BEZEL = 0.035; // a slim modern frame
const DEPTH = 0.06;
// Drawn in a 1280 x 720 layout, rendered at 1.5x for the larger wall.
const PX_W = 1280;
const PX_H = 720;
const RENDER_SCALE = 1.5;
const TICK_MS = 500;
// Blinks change every BLINK_TICKS repaints: a slow 1.5 s pulse, not a flicker.
const BLINK_TICKS = 3;

/*
 * Screen colours from the hall's own palette rather than a navy-violet UI
 * theme: a dark neutral slate ground, the building's steel blue (#0471ba) for
 * rules and highlights, and the MATISSE cyan as the one accent.
 *
 * One accent colour for every status, lamp and blink: several signal colours
 * flashing at once on a screen this size pulled the eye from everything else
 * in the hall. States are told apart by their words.
 */
const ACCENT = '#19a7ce';
const ACCENT_DIM = '#0e4a5a';
const OK = ACCENT;
const WARN = ACCENT;
const INFO = ACCENT;
const TEXT = '#e6edf7';
const MUTED = '#8fa3ad';

const ROWS = [
  { name: 'Otokar Gantry R1', status: 'RUNNING', color: OK, detail: 'Body inspection · axis 1' },
  { name: 'Otokar Gantry R2', status: 'RUNNING', color: OK, detail: 'Body inspection · axis 1' },
  { name: 'UR10e Workcell', status: 'RUNNING', color: OK, detail: 'Pick & place · rail' },
  { name: 'Kawasaki RS005L / AGV', status: 'RUNNING', color: OK, detail: 'Rail transfer' },
  { name: 'Forklift FL-01', status: 'MOVING', color: WARN, blink: true, detail: 'West aisle · pallet run' },
  { name: 'Floor Scrubber', status: 'CLEANING', color: INFO, blink: true, detail: 'Zone E · east floor' },
  { name: 'Fire Extinguishers', status: `${EXTINGUISHER_COUNT}/${EXTINGUISHER_COUNT} OK`, color: OK, detail: 'Monthly check done' },
  { name: 'Emergency Exits', status: 'CLEAR', color: OK, detail: 'Doors unlocked' },
  { name: 'PPE Compliance', status: '100 %', color: OK, detail: 'Hard hats · vests' },
];

const ALERTS = [
  { text: 'FORKLIFT OPERATING IN WEST AISLE — KEEP CLEAR', color: WARN },
  { text: 'WET FLOOR IN ZONE E — CLEANING IN PROGRESS', color: INFO },
  { text: 'BUS TRANSFER IN PROGRESS — MIND THE AISLES', color: WARN },
];

const FONT = '"SF Pro Display", -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function drawScreen(ctx, tick) {
  const on = Math.floor(tick / BLINK_TICKS) % 2 === 0;
  ctx.fillStyle = '#0b1418';
  ctx.fillRect(0, 0, PX_W, PX_H);

  // Header.
  const header = 84;
  const gradient = ctx.createLinearGradient(0, 0, PX_W, 0);
  gradient.addColorStop(0, '#101c22');
  gradient.addColorStop(1, '#13242b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PX_W, header);
  ctx.fillStyle = '#0471ba';
  ctx.fillRect(0, header - 4, PX_W, 4);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT;
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText('MATISSE  ·  HALL MONITOR', 36, header / 2);

  const now = new Date();
  const clock = now.toLocaleTimeString('en-GB');
  ctx.font = `600 32px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(clock, PX_W - 36, header / 2);
  ctx.fillStyle = on ? ACCENT : ACCENT_DIM;
  ctx.beginPath();
  ctx.arc(PX_W - 250, header / 2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = on ? ACCENT : MUTED;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('LIVE', PX_W - 180, header / 2);
  ctx.textAlign = 'left';

  // Body inspection, live from the Otokar cell (BodyInspection.js): body
  // number, status, a progress bar and the defects found so far.
  const panelY = header + 12;
  const panelH = 62;
  const done = inspection.status === 'COMPLETE';
  ctx.fillStyle = '#122027';
  ctx.fillRect(24, panelY, PX_W - 48, panelH);
  ctx.fillStyle = TEXT;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(`BODY INSPECTION  #${String(inspection.cycle).padStart(3, '0')}`, 44, panelY + 20);
  ctx.fillStyle = done || on ? ACCENT : ACCENT_DIM;
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText(done ? 'COMPLETE' : 'SCANNING', 44, panelY + 46);
  const barX = 420;
  const barW = 520;
  ctx.fillStyle = '#1a2c33';
  ctx.fillRect(barX, panelY + 20, barW, 22);
  ctx.fillStyle = done ? OK : INFO;
  ctx.fillRect(barX, panelY + 20, barW * inspection.progress, 22);
  ctx.fillStyle = TEXT;
  ctx.font = `700 20px ${FONT}`;
  ctx.fillText(`${Math.round(inspection.progress * 100)} %`, barX + barW + 16, panelY + 31);
  ctx.textAlign = 'right';
  ctx.fillStyle = TEXT;
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText(`${inspection.defects} DEFECTS`, PX_W - 44, panelY + 31);
  ctx.textAlign = 'left';

  // Column heads.
  const top = panelY + panelH + 14;
  const cols = [70, 560, 800];
  ctx.fillStyle = MUTED;
  ctx.font = `700 18px ${FONT}`;
  ['EQUIPMENT', 'STATUS', 'DETAIL'].forEach((label, i) => ctx.fillText(label, cols[i], top + 12));

  // Rows, with a cursor stepping down the list.
  const rowH = 45;
  const first = top + 34;
  const cursor = tick % ROWS.length;
  ROWS.forEach((row, i) => {
    const y = first + i * rowH;
    ctx.fillStyle = i === cursor ? '#173540' : i % 2 ? '#0f1b20' : '#0d171b';
    ctx.fillRect(24, y, PX_W - 48, rowH - 6);
    if (i === cursor) {
      ctx.fillStyle = '#0471ba';
      ctx.fillRect(24, y, 5, rowH - 6);
    }

    const lampOn = !row.blink || on;
    ctx.fillStyle = lampOn ? row.color : ACCENT_DIM;
    ctx.beginPath();
    ctx.arc(48, y + (rowH - 6) / 2, 9, 0, Math.PI * 2);
    ctx.fill();

    const mid = y + (rowH - 6) / 2;
    ctx.fillStyle = TEXT;
    ctx.font = `600 25px ${FONT}`;
    ctx.fillText(row.name, cols[0], mid);
    ctx.fillStyle = lampOn ? row.color : MUTED;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(row.status, cols[1], mid);
    ctx.fillStyle = MUTED;
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(row.detail, cols[2], mid);
  });

  // Alert bar, alternating messages, blinking.
  const barY = PX_H - 64;
  const alert = ALERTS[Math.floor(tick / 6) % ALERTS.length];
  ctx.fillStyle = on ? ACCENT : '#122027';
  ctx.fillRect(0, barY, PX_W, 64);
  ctx.fillStyle = on ? '#ffffff' : ACCENT;
  ctx.font = `800 26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`⚠  ${alert.text}`, PX_W / 2, barY + 32);
  ctx.textAlign = 'left';
}

function drawCells(ctx, tick) {
  const on = Math.floor(tick / BLINK_TICKS) % 2 === 0;
  ctx.fillStyle = '#0b1418';
  ctx.fillRect(0, 0, PX_W, PX_H);

  const header = 84;
  const gradient = ctx.createLinearGradient(0, 0, PX_W, 0);
  gradient.addColorStop(0, '#101c22');
  gradient.addColorStop(1, '#13242b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PX_W, header);
  ctx.fillStyle = '#0471ba';
  ctx.fillRect(0, header - 4, PX_W, 4);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT;
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText('CELL MONITOR  ·  ROBOT TASKS', 36, header / 2);
  ctx.textAlign = 'right';
  ctx.font = `600 32px ${FONT}`;
  ctx.fillText(new Date().toLocaleTimeString('en-GB'), PX_W - 36, header / 2);
  ctx.textAlign = 'left';

  // Three task cards: the Otokar inspection, UR10e pick & place, Kawasaki
  // chassis inspection. Each: title, live state, one big number and a bar.
  const cards = [
    {
      title: 'OTOKAR · BODY INSPECTION',
      state: inspection.status,
      stateColor: inspection.status === 'COMPLETE' ? OK : INFO,
      big: `${Math.round(inspection.progress * 100)} %`,
      sub: `Body #${String(inspection.cycle).padStart(3, '0')}  ·  ${inspection.defects} defects`,
      bar: inspection.progress,
      alert: inspection.defects > 0,
    },
    {
      title: 'UR10e · PICK & PLACE',
      state: ifarlab.ur,
      stateColor: OK,
      big: `${ifarlab.picks}`,
      sub: 'boxes conveyor → table',
      bar: (ifarlab.picks % 4) / 4,
    },
    {
      title: 'KAWASAKI · CHASSIS INSPECTION',
      state: ifarlab.kawasaki,
      stateColor: INFO,
      big: `${ifarlab.scans}`,
      sub: `bays inspected  ·  ${ifarlab.findings} findings`,
      bar: (ifarlab.scans % 6) / 6,
      alert: ifarlab.findings > 0,
    },
  ];
  const top = header + 24;
  const cardH = 176;
  cards.forEach((card, i) => {
    const y = top + i * (cardH + 14);
    ctx.fillStyle = '#122027';
    ctx.fillRect(24, y, PX_W - 48, cardH);
    ctx.fillStyle = '#0471ba';
    ctx.fillRect(24, y, 6, cardH);
    ctx.fillStyle = TEXT;
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(card.title, 52, y + 34);
    ctx.fillStyle = on || card.state === 'COMPLETE' ? card.stateColor : ACCENT_DIM;
    ctx.font = `800 22px ${FONT}`;
    ctx.fillText(`● ${card.state}`, 52, y + 74);
    ctx.fillStyle = TEXT;
    ctx.font = `800 72px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(card.big, PX_W - 52, y + 66);
    ctx.fillStyle = MUTED;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(card.sub, PX_W - 52, y + 122);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1a2c33';
    ctx.fillRect(52, y + 140, PX_W - 104, 14);
    ctx.fillStyle = card.stateColor;
    ctx.fillRect(52, y + 140, (PX_W - 104) * card.bar, 14);
  });
}

const PAGES = { hall: drawScreen, cells: drawCells };

export default function HallMonitor() {
  return SCREENS.map((screen) => <VideoWall key={screen.page} {...screen} />);
}

function VideoWall({ page, centre }) {
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = PX_W * RENDER_SCALE;
    c.height = PX_H * RENDER_SCALE;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { canvas: c, texture: t };
  }, []);

  useEffect(() => {
    const ctx = canvas.getContext('2d');
    let tick = 0;
    const draw = PAGES[page];
    const paint = () => {
      ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
      draw(ctx, tick);
      texture.needsUpdate = true;
      tick += 1;
    };
    paint();
    const id = setInterval(paint, TICK_MS);
    return () => {
      clearInterval(id);
      texture.dispose();
    };
  }, [canvas, texture, page]);

  const [x, y, z] = centre;
  const outerW = SCREEN.width + BEZEL * 2;
  const outerH = SCREEN.height + BEZEL * 2;
  return (
    <group position={[x, y, z]}>
      {/* Slim black cabinet with a thin brushed-metal rim round its edge. */}
      <mesh castShadow>
        <boxGeometry args={[outerW + 0.012, outerH + 0.012, DEPTH * 0.6]} />
        <meshStandardMaterial color="#5b6168" roughness={0.35} metalness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <boxGeometry args={[outerW, outerH, DEPTH]} />
        <meshStandardMaterial color="#0a0b0d" roughness={0.45} metalness={0.3} />
      </mesh>
      {/* The panel itself. */}
      <mesh position={[0, 0, DEPTH / 2 + 0.008]}>
        <planeGeometry args={[SCREEN.width, SCREEN.height]} />
        {/* An emitting panel: no fog and no tone mapping, or the hall's haze
            greys it out from the far end of the building. */}
        <meshBasicMaterial map={texture} toneMapped={false} fog={false} />
      </mesh>
      {/* Cover glass: a faint gloss catching the hall's lights. */}
      <mesh position={[0, 0, DEPTH / 2 + 0.012]}>
        <planeGeometry args={[SCREEN.width, SCREEN.height]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.025} roughness={0.05} metalness={0.9} depthWrite={false} fog={false} />
      </mesh>
      {/* Maker's badge and standby lamp on the lower bezel. */}
      <mesh position={[0, -outerH / 2 + BEZEL / 2, DEPTH / 2 + 0.009]}>
        <planeGeometry args={[0.18, 0.012]} />
        <meshBasicMaterial color="#8a9099" toneMapped={false} />
      </mesh>
      <mesh position={[outerW / 2 - 0.12, -outerH / 2 + BEZEL / 2, DEPTH / 2 + 0.009]}>
        <circleGeometry args={[0.006, 12]} />
        <meshBasicMaterial color="#19a7ce" toneMapped={false} />
      </mesh>
      {/* Wall bracket, hidden behind the cabinet. */}
      {[-1.4, 1.4].map((dx) => (
        <mesh key={dx} position={[dx, 0, -DEPTH / 2 - 0.02]}>
          <boxGeometry args={[0.1, 1.2, 0.08]} />
          <meshStandardMaterial {...METAL.galvanised} />
        </mesh>
      ))}
    </group>
  );
}

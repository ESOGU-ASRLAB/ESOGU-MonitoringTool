import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * STEP-BY-STEP INSTRUCTIONS, SHOWN IN THE HALL.
 *
 * The first hands-on test asked for the trainee to be told what to do, one
 * move at a time, with arrows: "grab it", "carry it", "let go". <Guide> is
 * that, for any station:
 *
 *   a chip     a small card floating over the thing to act on, turned to the
 *              wearer: the step count, an icon for the move, a few words, and
 *              the button to use
 *   arrows     chevrons streaming from what is held to where it goes
 *   a pointer  an arrow at the edge of the view when the chip is out of
 *              sight, turning the wearer towards it
 *
 * `anchor(out)` and `path(from, to)` are read every frame (return false to
 * hide); the text only redraws when it changes.
 */

const CANVAS_W = 1024;
const CANVAS_H = 300;
const CHIP_W = 0.46;
const CHIP_H = (CHIP_W * CANVAS_H) / CANVAS_W;
const FONT = '"Segoe UI", Arial, sans-serif';
const TONES = {
  grab: '#2060cd', carry: '#2060cd', release: '#16a34a', watch: '#475569', press: '#2060cd',
  wear: '#d97706', alert: '#dc2626', done: '#16a34a',
};

/* --------------------------------- icons --------------------------------- */

function drawIcon(ctx, icon, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = r / 60;
  ctx.scale(s, s);
  if (icon === 'grab') {
    // A closed fist: the knuckles over a palm, the thumb across.
    ctx.beginPath();
    ctx.roundRect(-34, -18, 68, 52, 14);
    ctx.fill();
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(-25 + i * 17, -22, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 7;
    ctx.strokeStyle = TONES.grab;
    ctx.beginPath();
    ctx.moveTo(-26, 6);
    ctx.lineTo(10, 6);
    ctx.stroke();
  } else if (icon === 'release') {
    // An open hand: palm and five spread fingers.
    ctx.beginPath();
    ctx.roundRect(-26, -4, 52, 46, 16);
    ctx.fill();
    ctx.lineWidth = 13;
    [[-20, -44], [-7, -52], [7, -52], [20, -44]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x * 0.8, 0);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-22, 16);
    ctx.lineTo(-46, -4);
    ctx.stroke();
  } else if (icon === 'carry') {
    // A bold arrow.
    ctx.beginPath();
    ctx.moveTo(-44, -12);
    ctx.lineTo(8, -12);
    ctx.lineTo(8, -34);
    ctx.lineTo(46, 0);
    ctx.lineTo(8, 34);
    ctx.lineTo(8, 12);
    ctx.lineTo(-44, 12);
    ctx.closePath();
    ctx.fill();
  } else if (icon === 'watch') {
    // An eye.
    ctx.beginPath();
    ctx.moveTo(-48, 0);
    ctx.quadraticCurveTo(0, -46, 48, 0);
    ctx.quadraticCurveTo(0, 46, -48, 0);
    ctx.fill();
    ctx.fillStyle = TONES.watch;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
  } else if (icon === 'press') {
    // A button with a finger's push onto it.
    ctx.beginPath();
    ctx.ellipse(0, 26, 38, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(0, 0);
    ctx.moveTo(-16, -16);
    ctx.lineTo(0, 0);
    ctx.lineTo(16, -16);
    ctx.stroke();
  } else if (icon === 'wear') {
    // A safety helmet.
    ctx.beginPath();
    ctx.arc(0, 12, 38, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-50, 10, 100, 12, 6);
    ctx.fill();
    ctx.fillStyle = TONES.wear;
    ctx.fillRect(-4, -24, 8, 34);
  } else if (icon === 'alert') {
    // A warning triangle.
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(48, 38);
    ctx.lineTo(-48, 38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = TONES.alert;
    ctx.fillRect(-5, -16, 10, 32);
    ctx.beginPath();
    ctx.arc(0, 28, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A tick.
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(-36, 2);
    ctx.lineTo(-10, 28);
    ctx.lineTo(38, -26);
    ctx.stroke();
  }
  ctx.restore();
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function paintChip(canvas, { step, icon, text, button }) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.beginPath();
  ctx.roundRect(6, 6, CANVAS_W - 12, CANVAS_H - 12, 44);
  ctx.fill();
  // The icon in a coloured disc on the left.
  const tone = TONES[icon] || TONES.grab;
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(150, CANVAS_H / 2, 104, 0, Math.PI * 2);
  ctx.fill();
  drawIcon(ctx, icon, 150, CANVAS_H / 2, 62);

  const x = 290;
  const width = CANVAS_W - x - 44;
  let y = 64;
  if (step) {
    ctx.fillStyle = '#64748b';
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(step.toUpperCase(), x, y);
    y += 20;
  }
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 50px ${FONT}`;
  const lines = wrapLines(ctx, text, width, button ? 2 : 3);
  lines.forEach((line) => {
    y += 56;
    ctx.fillText(line, x, y);
  });
  if (button) {
    ctx.font = `600 30px ${FONT}`;
    const w = ctx.measureText(button).width + 40;
    y += 20;
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 46, 23);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(button, x + 20, y + 33);
  }
}

/* ------------------------------ the pieces ------------------------------- */

const CHEVRONS = 10;
const CHEVRON_GAP = 0.13;
const FLOW = 0.35; // m/s

// Chevrons streaming from `from` to `to` while path(from, to) returns true.
function PathArrows({ path, color }) {
  const group = useRef(null);
  const from = useMemo(() => new THREE.Vector3(), []);
  const to = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const shown = path(from, to);
    g.visible = Boolean(shown);
    if (!shown) return;
    dir.subVectors(to, from);
    const length = dir.length();
    dir.normalize();
    const t = clock.getElapsedTime();
    g.children.forEach((chevron, i) => {
      const s = (t * FLOW + i * CHEVRON_GAP) % (CHEVRONS * CHEVRON_GAP);
      chevron.visible = length > 0.12 && s < length - 0.06 && s > 0.06;
      if (!chevron.visible) return;
      chevron.position.copy(from).addScaledVector(dir, s);
      chevron.quaternion.setFromUnitVectors(up, dir);
      chevron.material.opacity = Math.min(1, s / 0.2, (length - s) / 0.2) * 0.9;
    });
  });
  return (
    <group ref={group} visible={false}>
      {Array.from({ length: CHEVRONS }, (_, i) => (
        <mesh key={i}>
          <coneGeometry args={[0.028, 0.06, 3]} />
          <meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// An arrow at the edge of the view pointing to `target` when it is off to the side.
function OffscreenPointer({ anchor, color }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const arrow = useMemo(() => {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.018, 0.045, 3),
      new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, toneMapped: false }),
    );
    mesh.renderOrder = 999;
    mesh.visible = false;
    return mesh;
  }, [color]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const inverse = useMemo(() => new THREE.Matrix4(), []);
  useEffect(() => {
    camera.add(arrow);
    return () => {
      camera.remove(arrow);
      arrow.geometry.dispose();
      arrow.material.dispose();
    };
  }, [camera, arrow]);
  useFrame(() => {
    if (!anchor(target)) {
      arrow.visible = false;
      return;
    }
    // The target in the head's own frame (the XR camera when presenting).
    const head = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
    head.updateMatrixWorld();
    inverse.copy(head.matrixWorld).invert();
    target.applyMatrix4(inverse);
    const angle = Math.acos(THREE.MathUtils.clamp(-target.z / target.length(), -1, 1));
    arrow.visible = angle > 0.6; // ~35 degrees off the line of sight
    if (!arrow.visible) return;
    let x = target.x;
    let y = target.y;
    const len = Math.hypot(x, y) || 1;
    x /= len;
    y /= len;
    arrow.position.set(x * 0.13, y * 0.1 - 0.02, -0.55);
    arrow.rotation.set(0, 0, Math.atan2(y, x) - Math.PI / 2);
  });
  return null;
}

/**
 * The instructions for one step. step: "Box 1 of 3"; icon: grab | carry |
 * release | watch | press | wear | alert | done; text: a few words; button:
 * which to use, if any. anchor(out) places the chip (false hides it);
 * path(from, to) draws the arrows.
 */
export default function Guide({ step, icon, text, button, anchor, path = () => false }) {
  const camera = useThree((state) => state.camera);
  const chip = useRef(null);
  const at = useMemo(() => new THREE.Vector3(), []);
  const head = useMemo(() => new THREE.Vector3(), []);
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: c, texture: t };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    paintChip(canvas, { step, icon, text, button });
    texture.needsUpdate = true;
  }, [canvas, texture, step, icon, text, button]);

  useFrame(({ clock }) => {
    const c = chip.current;
    if (!c) return;
    const shown = anchor(at);
    c.visible = Boolean(shown);
    if (!shown) return;
    c.position.copy(at);
    c.position.y += 0.03 * Math.sin(clock.getElapsedTime() * 2);
    camera.getWorldPosition(head);
    c.rotation.set(0, Math.atan2(head.x - c.position.x, head.z - c.position.z), 0);
  });

  const tone = TONES[icon] || TONES.grab;
  return (
    <>
      <mesh ref={chip} visible={false} renderOrder={10}>
        <planeGeometry args={[CHIP_W, CHIP_H]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <PathArrows path={path} color={tone} />
      <OffscreenPointer anchor={anchor} color={tone} />
    </>
  );
}

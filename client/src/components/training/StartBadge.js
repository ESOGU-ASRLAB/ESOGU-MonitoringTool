import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { playClick } from '../vrAudio';

/*
 * THE ROUND BUTTON THAT FLOATS BY A TRAINING STATION.
 *
 *   start   a play sign and the station's name: walk up, press it, begin
 *   exit    a cross inside a ring that fills as the training goes on -- the
 *           progress, with no words
 *   again   a circular arrow: done, press to go again
 *
 * Press it by pointing and pulling the trigger, or by reaching out and
 * closing a hand on it. It turns to face the wearer and swells under the ray.
 * Unmount it rather than hide it: an invisible mesh still takes the ray.
 */

const CANVAS = 512;
const LABEL_H = 110;
const TOUCH_REACH = 0.14;
const FONT = '"Segoe UI", Arial, sans-serif';

function paint(canvas, { icon, label, progress, hover }) {
  const ctx = canvas.getContext('2d');
  const r = CANVAS / 2 - 16;
  const c = CANVAS / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // The disc.
  const fill = ctx.createLinearGradient(0, 0, 0, CANVAS);
  const tones = icon === 'exit' ? ['#475569', '#334155'] : ['#2f74e0', '#1a4fb0'];
  fill.addColorStop(0, hover ? '#3b82f6' : tones[0]);
  fill.addColorStop(1, tones[1]);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();

  // Progress around the rim.
  if (progress != null) {
    ctx.lineWidth = 22;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(c, c, r - 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#22c55e';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c, c, r - 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, progress));
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  if (icon === 'start') {
    ctx.beginPath();
    ctx.moveTo(c - 60, c - 90);
    ctx.lineTo(c + 100, c);
    ctx.lineTo(c - 60, c + 90);
    ctx.closePath();
    ctx.fill();
  } else if (icon === 'exit') {
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c - 70, c - 70);
    ctx.lineTo(c + 70, c + 70);
    ctx.moveTo(c + 70, c - 70);
    ctx.lineTo(c - 70, c + 70);
    ctx.stroke();
  } else {
    ctx.lineWidth = 30;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c, c, 95, -Math.PI * 0.35, Math.PI * 1.35);
    ctx.stroke();
    // The arrow head at the arc's end.
    const a = -Math.PI * 0.35;
    const x = c + Math.cos(a) * 95;
    const y = c + Math.sin(a) * 95;
    ctx.beginPath();
    ctx.moveTo(x + 40, y - 20);
    ctx.lineTo(x - 5, y + 45);
    ctx.lineTo(x - 30, y - 30);
    ctx.closePath();
    ctx.fill();
  }

  if (label) {
    ctx.font = `600 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.min(CANVAS - 8, ctx.measureText(label).width + 60);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect((CANVAS - w) / 2, CANVAS + 14, w, LABEL_H - 22, 40);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, c, CANVAS + LABEL_H / 2 + 3);
  }
}

export default function StartBadge({ position, icon = 'start', label = null, progress = null, size = 0.3, hands, onPress }) {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef(null);
  const [hover, setHover] = useState(false);
  const grow = useRef(0);
  const head = useMemo(() => new THREE.Vector3(), []);
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = CANVAS;
    c.height = CANVAS + LABEL_H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: c, texture: t };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    paint(canvas, { icon, label, progress, hover });
    texture.needsUpdate = true;
  }, [canvas, texture, icon, label, progress, hover]);

  const press = () => {
    playClick();
    onPress();
  };

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    // Pop in, bob a little, face the wearer, swell under the ray.
    grow.current = Math.min(1, grow.current + Math.min(delta, 0.1) * 4);
    const s = grow.current * (hover ? 1.12 : 1);
    group.scale.setScalar(s);
    camera.getWorldPosition(head);
    group.rotation.y = Math.atan2(head.x - group.position.x, head.z - group.position.z);
    // A hand closed on it presses it too.
    for (const hand of hands || []) {
      if (hand.pressed && !hand.holding && hand.position.distanceTo(group.position) < TOUCH_REACH + size / 2) {
        press();
        break;
      }
    }
  });

  const height = size * ((CANVAS + LABEL_H) / CANVAS);
  return (
    <group ref={groupRef} position={position}>
      <mesh
        position={[0, -(height - size) / 2, 0]}
        onClick={(event) => {
          event.stopPropagation();
          press();
        }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <planeGeometry args={[size, height]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

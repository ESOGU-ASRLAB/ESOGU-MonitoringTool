import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * Head, tail and reversing lamps for the hall's vehicles.
 *
 * `modeRef.current` is what the vehicle is doing -- 'forward', 'reverse' or
 * 'off' -- and the lamps follow it the way a real vehicle's do:
 *
 *   forward   headlamps on, tail lamps at running brightness
 *   reverse   tail lamps bright, white reversing lamps on, headlamps dipped
 *   off       everything dark
 *
 * Each lamp is an emissive lens (not tone-mapped, so it reads as a light
 * source rather than a painted patch) with a soft additive glow in front of
 * it. No real light sources: a dozen extra lights would cost more than the
 * whole hall's lighting rig, and at viewing distance the glow is what reads.
 */
const COLORS = { head: '#fff6df', tail: '#ff2a1f', reverse: '#ffffff' };
const LEVELS = {
  forward: { head: 1, tail: 0.45, reverse: 0 },
  reverse: { head: 0.15, tail: 1, reverse: 1 },
  off: { head: 0, tail: 0, reverse: 0 },
};
const GLOW_SIZE = { head: 0.9, tail: 0.5, reverse: 0.45 };
const FADE_RATE = 8; // 1/s: lamps come up and go down quickly, not instantly

let glowTexture = null;
function glow() {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

/*
 * `lamps`: [{ kind: 'head'|'tail'|'reverse', position, size: [w, h, d],
 * facing: [x, y, z] }], in the vehicle's own frame; `facing` is the outward
 * normal of the lens, along which the glow sits just proud of it.
 */
export default function VehicleLamps({ lamps, modeRef }) {
  const materials = useMemo(() => Object.fromEntries(Object.entries(COLORS).map(([kind, color]) => [kind, {
    lens: new THREE.MeshBasicMaterial({ color: '#2a2a2a', toneMapped: false }),
    glow: new THREE.SpriteMaterial({
      map: glow(), color, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }),
    on: new THREE.Color(color),
    off: new THREE.Color('#2a2a2a'),
    level: 0,
  }])), []);
  const levelsRef = useRef(materials);

  useFrame((_, delta) => {
    const target = LEVELS[modeRef.current] || LEVELS.off;
    const step = 1 - Math.exp(-delta * FADE_RATE);
    for (const [kind, m] of Object.entries(levelsRef.current)) {
      m.level += (target[kind] - m.level) * step;
      m.lens.color.copy(m.off).lerp(m.on, m.level);
      m.glow.opacity = m.level * 0.9;
    }
  });

  return lamps.map(({ kind, position, size, facing }, i) => {
    const m = materials[kind];
    const glowAt = position.map((v, k) => v + facing[k] * 0.06);
    return (
      <group key={i}>
        <mesh position={position} material={m.lens}>
          <boxGeometry args={size} />
        </mesh>
        <sprite position={glowAt} scale={[GLOW_SIZE[kind], GLOW_SIZE[kind], 1]} material={m.glow} />
      </group>
    );
  });
}

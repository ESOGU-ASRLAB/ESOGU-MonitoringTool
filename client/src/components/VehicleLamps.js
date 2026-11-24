import React, { useEffect, useMemo } from 'react';
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
 * The lens reflects the hall when off and emits when on. Highlights pass
 * through the same exposure and tone mapping as the rest of the factory.
 */
const COLORS = { head: '#fff6df', tail: '#ff2a1f', reverse: '#ffffff' };
const OFF_COLORS = { head: '#aeb9ba', tail: '#742a28', reverse: '#859397' };
const LEVELS = {
  forward: { head: 1, tail: 0.45, reverse: 0 },
  reverse: { head: 0.15, tail: 1, reverse: 1 },
  off: { head: 0, tail: 0, reverse: 0 },
};
const EMISSION = { head: 4, tail: 3.2, reverse: 2.8 };
const FADE_RATE = 8; // 1/s: lamps come up and go down quickly, not instantly

export default function VehicleLamps({ lamps, modeRef }) {
  const materials = useMemo(() => Object.fromEntries(Object.entries(COLORS).map(([kind, color]) => [kind, {
    lens: new THREE.MeshStandardMaterial({
      color: OFF_COLORS[kind], roughness: 0.25, emissive: color, emissiveIntensity: 0,
    }),
    level: 0,
  }])), []);

  useEffect(() => () => {
    Object.values(materials).forEach(({ lens }) => lens.dispose());
  }, [materials]);

  useFrame((_, delta) => {
    const target = LEVELS[modeRef.current] || LEVELS.off;
    const step = 1 - Math.exp(-delta * FADE_RATE);
    for (const [kind, m] of Object.entries(materials)) {
      m.level += (target[kind] - m.level) * step;
      m.lens.emissiveIntensity = m.level * EMISSION[kind];
    }
  });

  return lamps.map(({ kind, position, size }, index) => (
    <mesh key={index} name={`vehicle-lamp-${kind}`} position={position} material={materials[kind].lens}>
      <boxGeometry args={size} />
    </mesh>
  ));
}

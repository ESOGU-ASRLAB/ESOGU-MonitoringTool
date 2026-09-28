import { useCallback, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * WHAT THE TRAINING SHOWS INSTEAD OF WORDS.
 *
 *   useBurst       sparks thrown up from a point: something done
 *   BobArrow       an amber arrow bobbing over what to take next
 *   ghostMaterial  a see-through copy of a part where it has to go, blue
 *                  while it is far and green once it is close enough
 *   setGlow        a pulsing light on the part to take
 */

const BURST_COUNT = 90;
const BURST_LIFE_S = 1.3;
const BURST_COLORS = ['#2060cd', '#19a7ce', '#22c55e', '#f59e0b'].map((c) => new THREE.Color(c));

/** Sparks thrown up from a point: `fire(x, y, z, scale)`; mount `points`. */
export function useBurst() {
  const points = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_COUNT * 3), 3));
    const colors = new Float32Array(BURST_COUNT * 3);
    for (let i = 0; i < BURST_COUNT; i += 1) BURST_COLORS[i % BURST_COLORS.length].toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, depthWrite: false });
    const p = new THREE.Points(geometry, material);
    p.frustumCulled = false;
    p.visible = false;
    return p;
  }, []);
  const state = useRef({ age: BURST_LIFE_S, velocities: new Float32Array(BURST_COUNT * 3) });

  const fire = useCallback((x, y, z, scale = 1) => {
    const pos = points.geometry.getAttribute('position');
    const v = state.current.velocities;
    for (let i = 0; i < BURST_COUNT; i += 1) {
      pos.setXYZ(i, x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const out = (0.4 + Math.random() * 1.2) * scale;
      v[i * 3] = Math.cos(angle) * out;
      v[i * 3 + 1] = (1.5 + Math.random() * 2.5) * scale;
      v[i * 3 + 2] = Math.sin(angle) * out;
    }
    pos.needsUpdate = true;
    state.current.age = 0;
    points.visible = true;
  }, [points]);

  useFrame((_, delta) => {
    const s = state.current;
    if (s.age >= BURST_LIFE_S) return;
    const dt = Math.min(delta, 0.1);
    s.age += dt;
    const pos = points.geometry.getAttribute('position');
    for (let i = 0; i < BURST_COUNT; i += 1) {
      s.velocities[i * 3 + 1] -= 6 * dt;
      pos.setXYZ(
        i,
        pos.getX(i) + s.velocities[i * 3] * dt,
        pos.getY(i) + s.velocities[i * 3 + 1] * dt,
        pos.getZ(i) + s.velocities[i * 3 + 2] * dt,
      );
    }
    pos.needsUpdate = true;
    points.material.opacity = Math.max(0, 1 - s.age / BURST_LIFE_S);
    if (s.age >= BURST_LIFE_S) points.visible = false;
  });

  return { points, fire };
}

/**
 * An arrow bobbing over whatever `getTarget(out)` puts in `out` (the top of
 * the thing to take next); hidden while it returns false.
 */
export function BobArrow({ getTarget, color = '#f59e0b' }) {
  const ref = useRef(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const arrow = ref.current;
    if (!arrow) return;
    const shown = getTarget(target);
    arrow.visible = Boolean(shown);
    if (!shown) return;
    const t = clock.getElapsedTime();
    arrow.position.set(target.x, target.y + 0.22 + 0.06 * Math.sin(t * 4), target.z);
    arrow.rotation.y = t * 1.5;
  });
  return (
    <mesh ref={ref} rotation-x={Math.PI} visible={false}>
      <coneGeometry args={[0.06, 0.14, 4]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

const GHOST_FAR = new THREE.Color('#4f8fff');
const GHOST_NEAR = new THREE.Color('#22c55e');

/** A see-through stand-in for where a part goes. */
export function ghostMaterial() {
  return new THREE.MeshBasicMaterial({
    color: GHOST_FAR.clone(), transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false,
  });
}

/** Blue while the part is far, green once letting go would seat it. */
export function setGhostNear(material, near, time) {
  material.color.copy(near ? GHOST_NEAR : GHOST_FAR);
  material.opacity = near ? 0.45 : 0.22 + 0.1 * Math.sin(time * 4);
}

/**
 * Every standard material under `object`, cloned once so a glow on one part
 * does not light the others that share it; returns them for setGlow.
 */
export function ownMaterials(object) {
  const list = [];
  object.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.material = o.material.clone();
    if (o.material.emissive) list.push(o.material);
  });
  return list;
}

const GLOW = new THREE.Color('#19a7ce');

/** A pulsing glow (strength 0..1) on the materials from ownMaterials. */
export function setGlow(materials, strength, time) {
  const level = strength > 0 ? strength * (0.35 + 0.25 * Math.sin(time * 5)) : 0;
  for (const m of materials) {
    m.emissive.copy(GLOW);
    m.emissiveIntensity = level;
  }
}

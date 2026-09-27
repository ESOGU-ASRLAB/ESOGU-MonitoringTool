import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * Server cabinets: a steel frame with a glass door, rack servers inside and
 * their status LEDs blinking, lit from within by a strip under the roof of the
 * cabinet. `CABINETS` stand in the hall; `IfarlabCabinet` is the workcell's
 * own mini cabinet, which also runs the power and data cables to both robots.
 *
 * The LEDs are one instanced mesh per cabinet. Each LED has its own rate and
 * phase, and a fraction of them flicker like disk activity, so the rack reads
 * as busy without any pattern repeating in step.
 */
const FRAME = '#1c2126';
const UNIT = '#2b3137';
const BEZEL = '#3a424a';
const LED_COLORS = ['#35e07a', '#35e07a', '#35e07a', '#3aa0ff', '#ffb020'];

function Cabinet({ width, height, depth, units, seed = 1 }) {
  const ledRef = useRef(null);
  const inner = { w: width - 0.08, h: height - 0.16, d: depth - 0.06 };
  const unitH = inner.h / units;

  // Per LED: position on a unit's front, colour, and blink timing.
  const leds = useMemo(() => {
    let state = seed * 9973;
    const random = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    const list = [];
    for (let u = 0; u < units; u += 1) {
      const y = -inner.h / 2 + unitH * (u + 0.5);
      const count = 2 + Math.floor(random() * 3);
      for (let i = 0; i < count; i += 1) {
        list.push({
          position: [inner.w / 2 - 0.05 - i * 0.022, y, inner.d / 2 + 0.002],
          color: new THREE.Color(LED_COLORS[Math.floor(random() * LED_COLORS.length)]),
          rate: 0.6 + random() * 5,
          phase: random() * 10,
          flicker: random() < 0.35,
        });
      }
    }
    return list;
  }, [units, seed, inner.h, inner.w, inner.d, unitH]);

  useEffect(() => {
    const mesh = ledRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    leds.forEach((led, i) => {
      m.makeTranslation(...led.position);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, led.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [leds]);

  const off = useMemo(() => new THREE.Color('#0d1a12'), []);
  const tick = useRef(0);
  useFrame(({ clock }, delta) => {
    tick.current += delta;
    if (tick.current < 0.06 || !ledRef.current) return; // ~16 Hz is plenty
    tick.current = 0;
    const t = clock.getElapsedTime();
    const mesh = ledRef.current;
    leds.forEach((led, i) => {
      const on = led.flicker ? Math.random() < 0.55 : Math.sin(t * led.rate + led.phase) > -0.2;
      mesh.setColorAt(i, on ? led.color : off);
    });
    mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      {/* Frame: back, sides, roof and plinth; the front is the glass door. */}
      <mesh position={[0, height / 2, -depth / 2 + 0.01]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.02]} />
        <meshStandardMaterial color={FRAME} roughness={0.6} metalness={0.4} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 - 0.01), height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.02, height, depth]} />
          <meshStandardMaterial color={FRAME} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      <mesh position={[0, height - 0.02, 0]} castShadow>
        <boxGeometry args={[width, 0.04, depth]} />
        <meshStandardMaterial color={FRAME} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[width, 0.1, depth]} />
        <meshStandardMaterial color="#111417" roughness={0.7} />
      </mesh>

      {/* Servers: a stack of units, each with a bezel stripe across its face. */}
      <group position={[0, 0.1 + inner.h / 2 + 0.02, -0.02]}>
        {Array.from({ length: units }, (_, u) => {
          const y = -inner.h / 2 + unitH * (u + 0.5);
          return (
            <group key={u} position={[0, y, 0]}>
              <mesh>
                <boxGeometry args={[inner.w, unitH * 0.9, inner.d]} />
                <meshStandardMaterial color={UNIT} roughness={0.5} metalness={0.5} />
              </mesh>
              <mesh position={[-inner.w * 0.12, 0, inner.d / 2 + 0.001]}>
                <planeGeometry args={[inner.w * 0.6, unitH * 0.35]} />
                <meshStandardMaterial color={BEZEL} roughness={0.4} metalness={0.6} />
              </mesh>
            </group>
          );
        })}
        <instancedMesh ref={ledRef} args={[null, null, leds.length]} frustumCulled={false}>
          <boxGeometry args={[0.012, 0.008, 0.004]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      </group>

      {/* Light strip under the roof, lighting the rack from inside. */}
      <mesh position={[0, height - 0.06, depth / 2 - 0.06]}>
        <boxGeometry args={[width - 0.08, 0.015, 0.02]} />
        <meshBasicMaterial color="#8fd0ff" toneMapped={false} />
      </mesh>
      <pointLight position={[0, height - 0.15, depth / 2 - 0.1]} color="#8fd0ff" intensity={0.6} distance={Math.max(height, 1.2)} decay={2} />

      {/* Glass door with a thin frame and a handle. */}
      <mesh position={[0, height / 2, depth / 2]}>
        <planeGeometry args={[width - 0.04, height - 0.04]} />
        <meshStandardMaterial color="#b9d6e6" transparent opacity={0.14} roughness={0.05} metalness={0.2} depthWrite={false} />
      </mesh>
      {[
        [0, height - 0.03, width, 0.03],
        [0, 0.12, width, 0.03],
      ].map(([x, y, w, h]) => (
        <mesh key={y} position={[x, y, depth / 2 + 0.005]}>
          <boxGeometry args={[w, h, 0.012]} />
          <meshStandardMaterial color={FRAME} roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[width / 2 - 0.05, height / 2, depth / 2 + 0.02]}>
        <boxGeometry args={[0.015, Math.min(0.3, height * 0.2), 0.02]} />
        <meshStandardMaterial color="#9aa1a8" roughness={0.3} metalness={0.9} />
      </mesh>
    </group>
  );
}

/*
 * Two full racks against the far wall under the lab signs, between the
 * pedestrian door's first-aid station (x ~ -0.3) and the middle bay's post
 * (x 2.97), below the lowest girt (2.41 m). Backs to the cladding at z -24.57.
 */
const CABINETS = [
  { position: [0.4, 0, -24.15], seed: 3 },
  { position: [1.05, 0, -24.15], seed: 7 },
];

export default function ServerCabinets() {
  return CABINETS.map(({ position, seed }) => (
    <group key={seed} position={position}>
      <Cabinet width={0.6} height={2.0} depth={0.8} units={14} seed={seed} />
    </group>
  ));
}

/*
 * The IFARLAB workcell's mini cabinet, standing in the 0.5 m gap in its front
 * fence line (between the fence before the AGV and the one before the chassis:
 * workcell x -1.536 .. -1.032, fence line y -1.0), fence height, facing the
 * hall. It feeds both robots: a power cable (black) and a data cable (blue) run
 * along the floor to the start of each robot's rail -- the UR10e's at
 * (-0.25, 0), the AGV's at (-2.3, -0.445).
 *
 * Placed in the workcell group, which is Y-up: workcell (x, y) is (x, -y) here.
 */
const MINI = { x: -1.284, y: -1.0, width: 0.44, depth: 0.42, height: 1.1 };
const CABLE_Y = 0.025;

function floorCable(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, CABLE_Y, -y)), false, 'centripetal', 0.3);
  return new THREE.TubeGeometry(curve, 64, radius, 8, false);
}

export function IfarlabCabinet() {
  const cables = useMemo(() => {
    const back = MINI.y + MINI.depth / 2 - 0.02; // leave from the cabinet's back
    return [
      // UR10e: across behind the fence line to its rail's start.
      { geometry: floorCable([[MINI.x + 0.08, back], [MINI.x + 0.4, back + 0.25], [-0.6, -0.55], [-0.25, -0.12], [-0.25, 0.02]], 0.018), color: '#15181b' },
      { geometry: floorCable([[MINI.x + 0.12, back], [MINI.x + 0.45, back + 0.2], [-0.58, -0.6], [-0.2, -0.16], [-0.2, 0.02]], 0.01), color: '#2060cd' },
      // Kawasaki: out the other way to the AGV rail's start.
      { geometry: floorCable([[MINI.x - 0.08, back], [MINI.x - 0.4, back + 0.3], [-2.05, -0.62], [-2.3, -0.5]], 0.018), color: '#15181b' },
      { geometry: floorCable([[MINI.x - 0.12, back], [MINI.x - 0.45, back + 0.25], [-2.1, -0.66], [-2.36, -0.5]], 0.01), color: '#2060cd' },
    ];
  }, []);
  useEffect(() => () => cables.forEach((c) => c.geometry.dispose()), [cables]);

  return (
    <group>
      <group position={[MINI.x, 0, -MINI.y]}>
        <Cabinet width={MINI.width} height={MINI.height} depth={MINI.depth} units={7} seed={11} />
      </group>
      {cables.map(({ geometry, color }, i) => (
        <mesh key={i} geometry={geometry} receiveShadow>
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

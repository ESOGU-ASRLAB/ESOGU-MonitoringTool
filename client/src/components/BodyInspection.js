import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { inspection } from './inspectionState';
import { trackHeads } from './otokarHeads';

/*
 * WHAT THE MATISSE CELL IS FOR, MADE VISIBLE.
 *
 * Each gantry's camera head casts a scan beam onto the bus body and lights the
 * patch it is looking at. As the heads travel the runway the covered length
 * builds up into the inspection's progress; now and then a "defect" is found
 * where a head is looking and counted on the hall monitor. When the whole
 * length has been covered the inspection completes, holds so it can be read,
 * and starts over on the next body. The hall monitor reports all of it
 * (inspectionState.js).
 *
 * The heads are the gantries' own "camera-mount" nodes (OtokarGantryRobot.js),
 * read each frame, so the beams follow the machines whatever drives them --
 * the engine or the manual sliders.
 *
 * The body is aimed at as its box rather than ray-cast mesh by mesh: the
 * body-in-white mesh is the heaviest thing in the scene and a per-frame ray
 * cast into it is not worth it for a scan window. Its bounds in the hall,
 * from scripts/otokar/verify_cell_fit.mjs:
 */
const BODY = new THREE.Box3(new THREE.Vector3(-5.18, 1.51, -8.23), new THREE.Vector3(-2.66, 4.36, 3.74));

const BINS = 48; // the body's length in coverage cells
const DEFECT_EVERY = [4, 10]; // s between finds while scanning
const MAX_DEFECTS = 7;
const HOLD_COMPLETE = 8; // s the finished result stays up
const SCAN_COLOR = '#35d0ff';

// Where on the body a head at `from` is looking, and the outward face normal.
function aimAt(from, spot, normal) {
  spot.copy(from).clamp(BODY.min, BODY.max);
  if (spot.distanceToSquared(from) < 1e-6) {
    // Inside the box: out to the nearest face.
    const d = [
      [from.x - BODY.min.x, 'x', BODY.min.x, -1], [BODY.max.x - from.x, 'x', BODY.max.x, 1],
      [from.y - BODY.min.y, 'y', BODY.min.y, -1], [BODY.max.y - from.y, 'y', BODY.max.y, 1],
    ].sort((a, b) => a[0] - b[0])[0];
    spot[d[1]] = d[2];
    normal.set(0, 0, 0)[d[1]] = d[3];
    return;
  }
  normal.subVectors(from, spot);
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) normal.set(Math.sign(normal.x), 0, 0);
  else if (ay >= az) normal.set(0, Math.sign(normal.y), 0);
  else normal.set(0, 0, Math.sign(normal.z));
}

function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/*
 * The scan light, drawn the way a structured-light scanner's light looks:
 *
 *   beam   a volumetric cone, bright at the lens and fading towards the body,
 *          soft at its edges, with faint bands running down it towards the
 *          surface
 *   spot   a patch lit brightest in the middle and falling off to its rim,
 *          with a thin laser line sweeping back and forth across it
 *
 * Both share one time uniform. Additive and unfogged, so they read as light.
 */
const beamTime = { value: 0 };

const BEAM_VERTEX = `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FRAGMENT = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    float alongToLens = vUv.y;                       // 1 at the lens, 0 at the body
    float falloff = 0.08 + 0.55 * pow(alongToLens, 1.6);
    float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
    float soft = smoothstep(0.0, 0.55, facing);      // fade the silhouette edges
    float bands = 0.75 + 0.25 * sin((alongToLens * 18.0 + uTime * 3.0) * 3.14159);
    gl_FragColor = vec4(uColor, falloff * soft * bands * 0.55);
  }
`;
const SPOT_FRAGMENT = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float glow = pow(1.0 - r, 1.8) * 0.75;
    float sweep = sin(uTime * 2.2) * 0.85;
    float line = exp(-pow((p.x - sweep) * 38.0, 2.0)) * (1.0 - r * 0.6);
    gl_FragColor = vec4(uColor * (1.0 + line), glow + line * 1.2);
  }
`;
const SPOT_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function scanMaterial(vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: beamTime, uColor: { value: new THREE.Color(SCAN_COLOR) } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function Beam({ beamRef, spotRef, ringRef }) {
  const materials = useMemo(() => ({
    beam: scanMaterial(BEAM_VERTEX, BEAM_FRAGMENT),
    spot: scanMaterial(SPOT_VERTEX, SPOT_FRAGMENT),
  }), []);
  return (
    <>
      {/* Beam: a cone from the head to the patch, opened along +y then aimed. */}
      <mesh ref={beamRef} visible={false} material={materials.beam}>
        <coneGeometry args={[0.42, 1, 32, 1, true]} />
      </mesh>
      {/* Lit patch on the body, and a ring that pulses out from it. */}
      <mesh ref={spotRef} visible={false} material={materials.spot}>
        <planeGeometry args={[0.9, 0.9]} />
      </mesh>
      <mesh ref={ringRef} visible={false}>
        <ringGeometry args={[0.46, 0.5, 48]} />
        <meshBasicMaterial
          color={SCAN_COLOR} transparent opacity={0.8} side={THREE.DoubleSide}
          depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false}
        />
      </mesh>
    </>
  );
}

export default function BodyInspection() {
  const scene = useThree((state) => state.scene);
  const headCache = useRef({});
  const beamRefs = useMemo(
    () => [0, 1].map(() => ({ beamRef: React.createRef(), spotRef: React.createRef(), ringRef: React.createRef() })),
    [],
  );
  const defectGroup = useRef(null);
  const run = useRef({ covered: new Set(), nextFind: 6, completedAt: null });
  const random = useMemo(() => makeRandom(20260927), []);


  const scratch = useMemo(() => ({
    head: new THREE.Vector3(), spot: new THREE.Vector3(), normal: new THREE.Vector3(),
    mid: new THREE.Vector3(), dir: new THREE.Vector3(),
  }), []);

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime();
    beamTime.value = now;
    // The heads load with the gantry meshes; look them up until both exist.
    const heads = trackHeads(scene, now, headCache.current);

    const state = run.current;
    const { head, spot, normal, mid, dir } = scratch;

    // Finished: hold the result, then clear the body and start the next one.
    if (state.completedAt !== null) {
      if (now - state.completedAt > HOLD_COMPLETE) {
        state.completedAt = null;
        state.covered.clear();
        state.nextFind = now + 4;
        defectGroup.current?.clear();
        inspection.defects = 0;
        inspection.progress = 0;
        inspection.cycle += 1;
        inspection.status = 'SCANNING';
      }
    }

    beamRefs.forEach(({ beamRef, spotRef, ringRef }, i) => {
      if (!heads[i]) for (const ref of [beamRef, spotRef, ringRef]) if (ref.current) ref.current.visible = false;
    });
    heads.forEach((mount, i) => {
      if (!mount) return;
      const { beamRef, spotRef, ringRef } = beamRefs[i];
      mount.getWorldPosition(head);
      /*
       * The first stations of both programmes sit just past the body's rear
       * end (heads at z 4..6.8 against a body ending at 3.74), so a tight test
       * here left the first scans without a beam -- the "long wait" at the
       * start. Within 3.2 m of the body the beam reaches in to its nearest
       * point, angled, as a real scanner does at the end of a vehicle.
       */
      const alongBody = head.z > BODY.min.z - 3.2 && head.z < BODY.max.z + 3.2;
      const visible = alongBody && state.completedAt === null;
      for (const ref of [beamRef, spotRef, ringRef]) if (ref.current) ref.current.visible = visible;
      if (!visible) return;

      /*
       * A head up in the body -- the roof program works through the window
       * band -- looks at the roof above it: the beam goes straight up to the
       * roof's underside. A head below the body looks up at the floor pan;
       * any other is aimed at the nearest face.
       */
      if (head.y > BODY.min.y + 0.3 && head.x > BODY.min.x - 1.5 && head.x < BODY.max.x + 1.5) {
        spot.set(
          THREE.MathUtils.clamp(head.x, BODY.min.x + 0.2, BODY.max.x - 0.2),
          BODY.max.y - 0.05,
          THREE.MathUtils.clamp(head.z, BODY.min.z + 0.2, BODY.max.z - 0.2),
        );
        normal.set(0, -1, 0);
      } else {
        aimAt(head, spot, normal);
      }
      spot.addScaledVector(normal, 0.02);

      // Beam from the head to the patch.
      // The beam starts a little behind the lens, so it reads as coming out of
      // the head rather than off its face, and runs the full way to the body.
      dir.subVectors(spot, head).normalize();
      head.addScaledVector(dir, -0.015);
      dir.subVectors(spot, head);
      const length = dir.length();
      mid.addVectors(head, spot).multiplyScalar(0.5);
      beamRef.current.position.copy(mid);
      beamRef.current.scale.set(1, length, 1);
      // The cone opens along -y from its tip at +y: tip on the head, base on the body.
      beamRef.current.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize().negate());

      for (const disc of [spotRef.current, ringRef.current]) {
        disc.position.copy(spot);
        disc.quaternion.setFromUnitVectors(Z_AXIS, normal);
      }
      const pulse = (now * 1.2 + i * 0.5) % 1;
      ringRef.current.scale.setScalar(0.7 + pulse * 0.9);
      ringRef.current.material.opacity = 0.8 * (1 - pulse);

      // Coverage along the body's length.
      const bin = Math.floor(((spot.z - BODY.min.z) / (BODY.max.z - BODY.min.z)) * BINS);
      if (bin >= 0 && bin < BINS) state.covered.add(bin);

      // Now and then, a find where this head is looking -- counted for the
      // monitor, not marked on the body.
      if (now >= state.nextFind && inspection.defects < MAX_DEFECTS && defectGroup.current) {
        state.nextFind = now + DEFECT_EVERY[0] + random() * (DEFECT_EVERY[1] - DEFECT_EVERY[0]);
        inspection.defects += 1;
      }
    });

    if (state.completedAt === null) {
      inspection.progress = state.covered.size / BINS;
      if (state.covered.size >= BINS) {
        state.completedAt = now;
        inspection.status = 'COMPLETE';
      } else {
        inspection.status = 'SCANNING';
      }
    }

  });

  return (
    <group>
      {beamRefs.map((refs, i) => <Beam key={i} {...refs} />)}
      <group ref={defectGroup} />
    </group>
  );
}

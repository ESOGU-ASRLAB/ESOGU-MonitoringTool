import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';
import { playDrop, playFanfare, playGrab, playSnap, playSuccess, pulseController } from '../vrAudio';
import { IS_TEST_HOST } from '../xrSession';
import StartBadge from './StartBadge';
import { BobArrow, ghostMaterial, ownMaterials, setGhostNear, setGlow, useBurst } from './effects';
import { grabCenter, makeGrabbable, releaseAll, updateGrabs } from './grab';
import { MESH_URLS, PIECES, buildTrainerArm } from './trainerArm';

/*
 * TAKE THE ARM APART, PUT IT BACK: THE ASSEMBLY TRAINING.
 *
 * In front of the IFARLAB fence a UR10e stands on a pedestal beside a parts
 * bench. Press start and the tool end lights up: take it off (grip or
 * trigger) and lay it where its see-through twin shows on the bench -- it
 * seats with a click when close enough. Then the wrist, the forearm, the
 * upper arm and the shoulder, outermost first, the way the arm really comes
 * apart. With the base bare, the order turns round: shoulder first, each
 * piece back onto the arm where its twin shows. The rebuilt arm waves.
 * No text: the glowing piece, the arrow, the twin (blue far, green close)
 * and the sounds lead the way; the ring on the exit button fills as it goes.
 */

const PEDESTAL = { x: 4.0, z: 13.0, h: 0.45, r: 0.2 };
const BENCH = { x: 2.975, z: 13.0, w: 1.25, d: 0.8, top: 0.78 };
// Where each piece lies on the bench (hall x, z), spaced so no two touch:
// measured footprints leave 1-3 cm between neighbours.
const SLOTS = {
  upperarm: [2.51, 13.0],
  forearm: [3.02, 12.78],
  shoulder: [2.95, 13.2],
  wrist: [3.25, 13.2],
  tool: [3.47, 12.92],
};
const BADGE_AT = [4.75, 1.55, 13.45];
// The arm's pose on the pedestal: the IFARLAB program's start pose -- upper
// arm up, forearm level, wrist down -- turned to reach east, along the fence.
const POSE = [0, -95, 100, -95, -90, 0];
const SNAP_M = 0.13;
const SHOW_WITHIN = 9;
const ABORT_BEYOND = 20;
const TWEEN_S = 0.3;
const WAVE_S = 3.6;

// Disassembly outermost first, then assembly the other way.
const STEPS = [
  ...PIECES.map((piece) => ({ piece, to: 'rest' })),
  ...[...PIECES].reverse().map((piece) => ({ piece, to: 'home' })),
];

const pedestalMaterial = new THREE.MeshStandardMaterial({ color: '#374151', metalness: 0.4, roughness: 0.6 });
const benchMaterial = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.2, roughness: 0.6 });
const legMaterial = new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.5, roughness: 0.5 });
const matMaterial = new THREE.MeshStandardMaterial({ color: '#1e3a5f', roughness: 0.9 });

function Furniture() {
  return (
    <group>
      <mesh position={[PEDESTAL.x, PEDESTAL.h / 2, PEDESTAL.z]} material={pedestalMaterial}>
        <cylinderGeometry args={[PEDESTAL.r, PEDESTAL.r * 1.2, PEDESTAL.h, 28]} />
      </mesh>
      <group position={[BENCH.x, 0, BENCH.z]}>
        <mesh position={[0, BENCH.top - 0.02, 0]} material={benchMaterial}>
          <boxGeometry args={[BENCH.w, 0.04, BENCH.d]} />
        </mesh>
        {/* A dark mat on top, so the parts read against it. */}
        <mesh position={[0, BENCH.top + 0.001, 0]} rotation-x={-Math.PI / 2} material={matMaterial}>
          <planeGeometry args={[BENCH.w - 0.06, BENCH.d - 0.06]} />
        </mesh>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
          <mesh key={`${sx}${sz}`} position={[sx * (BENCH.w / 2 - 0.05), (BENCH.top - 0.04) / 2, sz * (BENCH.d / 2 - 0.05)]} material={legMaterial}>
            <boxGeometry args={[0.05, BENCH.top - 0.04, 0.05]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// A see-through copy of a piece, for where it goes.
function ghostOf(piece, material) {
  const ghost = piece.clone(true);
  ghost.traverse((o) => {
    if (o.isMesh) {
      o.material = material;
      o.castShadow = false;
    }
  });
  ghost.visible = false;
  return ghost;
}

export default function AssemblyStation({ hands, busy, onRunning }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const geometries = useLoader(STLLoader, MESH_URLS);
  const ghostMat = useMemo(() => ghostMaterial(), []);

  // The arm, its pieces placed in the hall, and where each piece belongs.
  const kit = useMemo(() => {
    const arm = buildTrainerArm(geometries);
    arm.setAngles(POSE);
    // Turn the arm so the tool reaches east (+x), in profile to the wearer.
    const toolAt = new THREE.Vector3().setFromMatrixPosition(arm.pieceMatrix('tool', new THREE.Matrix4()));
    const mount = new THREE.Matrix4().compose(
      new THREE.Vector3(PEDESTAL.x, PEDESTAL.h, PEDESTAL.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(toolAt.z, toolAt.x)),
      new THREE.Vector3(1, 1, 1),
    );
    const home = {};
    const rest = {};
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const tip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    for (const name of ['base', ...PIECES]) {
      const piece = arm.pieces[name];
      const m = new THREE.Matrix4().multiplyMatrices(mount, arm.pieceMatrix(name, new THREE.Matrix4()));
      home[name] = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
      m.decompose(home[name].position, home[name].quaternion, size);
      piece.position.copy(home[name].position);
      piece.quaternion.copy(home[name].quaternion);
      piece.updateMatrixWorld(true);
      if (name === 'base') continue;
      // On the bench: laid down if it stands tall, bottom on the mat, centred
      // on its slot.
      box.setFromObject(piece).getSize(size);
      const q = home[name].quaternion.clone();
      if (size.y > 1.4 * Math.max(size.x, size.z)) q.premultiply(tip);
      piece.quaternion.copy(q);
      piece.updateMatrixWorld(true);
      box.setFromObject(piece);
      box.getCenter(mid);
      const [sx, sz] = SLOTS[name];
      rest[name] = {
        position: piece.position.clone().add(new THREE.Vector3(sx - mid.x, BENCH.top + 0.003 - box.min.y, sz - mid.z)),
        quaternion: q,
      };
      // Back on the arm until the training starts.
      piece.position.copy(home[name].position);
      piece.quaternion.copy(home[name].quaternion);
    }
    const ghosts = Object.fromEntries(PIECES.map((name) => [name, ghostOf(arm.pieces[name], ghostMat)]));
    return { arm, mount, home, rest, ghosts };
  }, [geometries, ghostMat]);

  const [phase, setPhaseState] = useState('idle'); // idle | running | done
  const phaseRef = useRef('idle');
  const setPhase = (value) => {
    phaseRef.current = value;
    setPhaseState(value);
  };
  const [progress, setProgress] = useState(0);
  const [nearby, setNearby] = useState(false);
  const run = useRef({ step: 0, tweens: new Map(), pauseUntil: 0, wave: -1 });
  const items = useRef(null);
  const glows = useMemo(() => Object.fromEntries(PIECES.map((name) => [name, ownMaterials(kit.arm.pieces[name])])), [kit]);
  const burst = useBurst();
  const scratch = useMemo(() => ({
    head: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(), m: new THREE.Matrix4(), s: new THREE.Vector3(),
  }), []);

  const buzz = (hand, strength = 0.6, ms = 60) => pulseController(gl.xr.getSession(), hand?.handedness ?? 'right', strength, ms);

  const place = (name, where) => {
    const piece = kit.arm.pieces[name];
    piece.position.copy(where.position);
    piece.quaternion.copy(where.quaternion);
  };

  // Where a piece's centre would be at a target transform.
  const centerAt = (name, where, out) => {
    const item = items.current.find((i) => i.object === kit.arm.pieces[name]);
    scratch.m.compose(where.position, where.quaternion, kit.arm.pieces[name].scale);
    return out.copy(item.localCenter).applyMatrix4(scratch.m);
  };

  const target = (step) => (step.to === 'home' ? kit.home[step.piece] : kit.rest[step.piece]);

  // Automated emulator runs follow the station; never on production.
  if (IS_TEST_HOST) window.__assembly = { kit, run, items, STEPS, centerAt, target, phase: () => phaseRef.current };

  const tween = (name, to, done) => {
    const piece = kit.arm.pieces[name];
    run.current.tweens.set(name, { from: piece.position.clone(), fromQ: piece.quaternion.clone(), to, t: 0, done });
  };

  const resetArm = () => {
    run.current.tweens.clear();
    for (const name of PIECES) place(name, kit.home[name]);
    kit.arm.setAngles(POSE);
  };

  const stop = (finished) => {
    if (items.current) releaseAll(hands, items.current);
    if (!finished) resetArm();
    setPhase(finished ? 'done' : 'idle');
    onRunning(false);
  };

  const start = () => {
    resetArm();
    run.current = { step: 0, tweens: new Map(), pauseUntil: 0, wave: -1 };
    setProgress(0);
    setPhase('running');
    onRunning(true);
  };

  useEffect(() => {
    items.current = PIECES.map((name) => makeGrabbable(kit.arm.pieces[name], {
      enabled: () => {
        const r = run.current;
        const step = STEPS[r.step];
        return phaseRef.current === 'running' && step?.piece === name && !r.tweens.has(name) && performance.now() >= r.pauseUntil;
      },
      onGrab: (hand) => {
        playGrab();
        buzz(hand, 0.4, 30);
      },
      onRelease: (hand) => {
        const step = STEPS[run.current.step];
        const item = items.current.find((i) => i.object === kit.arm.pieces[name]);
        const here = grabCenter(item, scratch.c);
        const there = centerAt(name, target(step), scratch.t);
        if (here.distanceTo(there) < SNAP_M) {
          playSnap();
          buzz(hand, 0.8, 70);
          tween(name, target(step), () => {
            const r = run.current;
            burst.fire(there.x, there.y, there.z, 0.4);
            r.step += 1;
            setProgress(r.step / STEPS.length);
            if (r.step === PIECES.length) {
              // Stripped to the base: a breath, then back together.
              playSuccess();
              r.pauseUntil = performance.now() + 900;
            } else if (r.step >= STEPS.length) {
              playFanfare();
              burst.fire(PEDESTAL.x, 1.4, PEDESTAL.z, 1.2);
              r.wave = 0;
            }
          });
        } else {
          // Not there: it floats back to where it was taken from.
          playDrop();
          tween(name, step.to === 'home' ? kit.rest[name] : kit.home[name]);
        }
      },
    }));
    return () => {
      items.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit]);

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const r = run.current;
    const dt = Math.min(delta, 0.25);

    for (const [name, tw] of r.tweens) {
      const piece = kit.arm.pieces[name];
      tw.t = Math.min(1, tw.t + dt / TWEEN_S);
      const u = tw.t * tw.t * (3 - 2 * tw.t);
      piece.position.lerpVectors(tw.from, tw.to.position, u);
      piece.quaternion.slerpQuaternions(tw.fromQ, tw.to.quaternion, u);
      if (tw.t >= 1) {
        r.tweens.delete(name);
        tw.done?.();
      }
    }

    // The rebuilt arm waves: the skeleton moves and every piece follows it.
    if (r.wave >= 0) {
      r.wave += dt;
      const w = Math.min(1, r.wave / WAVE_S);
      const s = Math.sin(w * Math.PI * 2);
      kit.arm.setAngles([POSE[0] + 35 * s, POSE[1] + 8 * s, POSE[2] - 14 * s, POSE[3], POSE[4], POSE[5] + 360 * w]);
      for (const name of PIECES) {
        scratch.m.multiplyMatrices(kit.mount, kit.arm.pieceMatrix(name, scratch.m));
        scratch.m.decompose(kit.arm.pieces[name].position, kit.arm.pieces[name].quaternion, scratch.s);
      }
      if (w >= 1) {
        r.wave = -1;
        resetArm();
        stop(true);
      }
    }

    if (items.current) updateGrabs(hands, items.current);

    camera.getWorldPosition(scratch.head);
    const distance = Math.hypot(scratch.head.x - PEDESTAL.x, scratch.head.z - PEDESTAL.z);
    const isNear = distance < SHOW_WITHIN;
    if (isNear !== nearby) setNearby(isNear);
    if (phaseRef.current === 'running' && distance > ABORT_BEYOND) stop(false);

    // The piece to take glows; its twin shows where it goes while held.
    const running = phaseRef.current === 'running' && r.wave < 0;
    const step = running ? STEPS[r.step] : null;
    const ready = step && performance.now() >= r.pauseUntil;
    for (const name of PIECES) {
      const item = items.current?.find((i) => i.object === kit.arm.pieces[name]);
      const current = ready && step.piece === name && !r.tweens.has(name);
      setGlow(glows[name], current && !item?.held ? (item?.near ? 1.6 : 1) : 0, t);
      const ghost = kit.ghosts[name];
      ghost.visible = Boolean(current && item?.held);
      if (ghost.visible) {
        const where = target(step);
        ghost.position.copy(where.position);
        ghost.quaternion.copy(where.quaternion);
        setGhostNear(ghostMat, grabCenter(item, scratch.c).distanceTo(centerAt(name, where, scratch.t)) < SNAP_M, t);
      }
    }
  });

  const arrowTarget = (out) => {
    const r = run.current;
    if (phaseRef.current !== 'running' || r.wave >= 0 || performance.now() < r.pauseUntil) return false;
    const step = STEPS[r.step];
    if (!step || !items.current || r.tweens.has(step.piece)) return false;
    const item = items.current.find((i) => i.object === kit.arm.pieces[step.piece]);
    if (item.held) centerAt(step.piece, target(step), out);
    else grabCenter(item, out);
    out.y += item.radius * 0.6;
    return true;
  };

  return (
    <group>
      <Furniture />
      {['base', ...PIECES].map((name) => <primitive key={name} object={kit.arm.pieces[name]} />)}
      {PIECES.map((name) => <primitive key={`ghost-${name}`} object={kit.ghosts[name]} />)}
      <BobArrow getTarget={arrowTarget} />
      <primitive object={burst.points} />
      {nearby && phase === 'idle' && !busy && (
        <StartBadge position={BADGE_AT} icon="start" label="Assemble the arm" hands={hands} onPress={start} />
      )}
      {phase === 'running' && (
        <StartBadge position={BADGE_AT} icon="exit" progress={progress} size={0.22} hands={hands} onPress={() => stop(false)} />
      )}
      {nearby && phase === 'done' && !busy && (
        <StartBadge position={BADGE_AT} icon="again" label="Assemble the arm" hands={hands} onPress={start} />
      )}
    </group>
  );
}

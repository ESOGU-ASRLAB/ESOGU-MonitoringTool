import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { IS_TEST_HOST } from '../xrSession';
import {
  playDrop, playFanfare, playGrab, playSnap, pulseController, setMuffled,
} from '../vrAudio';
import StartBadge from './StartBadge';
import Guide from './guide';
import { BobArrow, ownMaterials, setGlow, useBurst } from './effects';
import { grabCenter, makeGrabbable, releaseAll, updateGrabs } from './grab';

/*
 * SUIT UP: THE SAFETY-GEAR TRAINING.
 *
 * Before the shop floor, the gear: a table east of the IFARLAB cell holds a
 * safety helmet, glasses, ear defenders and a hi-vis vest. One at a time,
 * each lights up; pick it up and bring it where it is worn -- the helmet to
 * the top of the head, the glasses to the eyes, the defenders over the ears,
 * the vest to the chest -- and it goes on with a click. With the ear
 * defenders on, the hall's recordings are muffled (vrAudio setMuffled): the
 * wearer hears what they are for, while alarms and feedback stay clear. The
 * gear stays on until the training is run again or the session ends.
 */

const TABLE = { x: 10.9, z: 14.5, w: 1.2, d: 0.5, top: 0.9 };
const BADGE_AT = [11.9, 1.55, 14.55];
const SHOW_WITHIN = 9;
const ABORT_BEYOND = 20;
const TWEEN_S = 0.3;

// Each piece of gear: where it lies, where on the body it is worn (from the
// head: `up` metres above, `forward` in front), and how close counts.
const GEAR = [
  { id: 'helmet', name: 'safety helmet', at: [10.45, 0.07], wear: { up: 0.13, forward: 0 }, reach: 0.2, target: 'your head', verb: 'it' },
  { id: 'glasses', name: 'safety glasses', at: [10.75, 0.03], wear: { up: -0.01, forward: 0.09 }, reach: 0.18, target: 'your eyes', verb: 'them' },
  { id: 'ears', name: 'ear defenders', at: [11.05, 0.05], wear: { up: 0.03, forward: 0 }, reach: 0.2, target: 'your ears', verb: 'them' },
  { id: 'vest', name: 'hi-vis vest', at: [11.35, 0.02], wear: { up: -0.42, forward: 0.12 }, reach: 0.26, target: 'your chest', verb: 'it' },
];

const tableMaterial = new THREE.MeshStandardMaterial({ color: '#d1d5db', roughness: 0.6, metalness: 0.2 });
const legMaterial = new THREE.MeshStandardMaterial({ color: '#4b5563', roughness: 0.5, metalness: 0.5 });

function Helmet() {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.115, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#facc15" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <cylinderGeometry args={[0.15, 0.15, 0.012, 28]} />
        <meshStandardMaterial color="#eab308" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.025, 0.1, 0.2]} />
        <meshStandardMaterial color="#eab308" roughness={0.4} />
      </mesh>
    </group>
  );
}

function Glasses() {
  const frame = <meshStandardMaterial color="#111827" roughness={0.4} />;
  return (
    <group>
      {[-0.035, 0.035].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.058, 0.036, 0.006]} />
          <meshStandardMaterial color="#60a5fa" transparent opacity={0.55} roughness={0.1} />
        </mesh>
      ))}
      <mesh position={[0, 0.012, 0]}>
        <boxGeometry args={[0.14, 0.008, 0.008]} />
        {frame}
      </mesh>
      {[-0.07, 0.07].map((x) => (
        <mesh key={x} position={[x, 0.01, -0.055]}>
          <boxGeometry args={[0.006, 0.006, 0.11]} />
          {frame}
        </mesh>
      ))}
    </group>
  );
}

function EarDefenders() {
  return (
    <group>
      {[-0.085, 0.085].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.042, 0.042, 0.035, 18]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.005, 0]}>
        <torusGeometry args={[0.085, 0.008, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Vest() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.34, 0.02, 0.42]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} />
      </mesh>
      {[-0.08, 0.08].map((z) => (
        <mesh key={z} position={[0, 0.011, z]}>
          <boxGeometry args={[0.345, 0.004, 0.03]} />
          <meshStandardMaterial color="#e5e7eb" emissive="#9ca3af" emissiveIntensity={0.4} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

const MODELS = { helmet: Helmet, glasses: Glasses, ears: EarDefenders, vest: Vest };

export default function SafetyGearStation({ hands, busy, onRunning }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const [phase, setPhaseState] = useState('idle'); // idle | running | done
  const phaseRef = useRef('idle');
  const setPhase = (value) => {
    phaseRef.current = value;
    setPhaseState(value);
  };
  const [nearby, setNearby] = useState(false);
  const [guideKey, setGuideKey] = useState('');
  const guideRef = useRef('');
  const refs = useRef([]);
  const items = useRef(null);
  const glows = useRef([]);
  const run = useRef({ index: 0, tweens: new Map() });
  const burst = useBurst();
  const scratch = useMemo(() => ({
    head: new THREE.Vector3(), forward: new THREE.Vector3(), quat: new THREE.Quaternion(), c: new THREE.Vector3(), w: new THREE.Vector3(),
  }), []);
  const homes = useMemo(() => GEAR.map((g) => new THREE.Vector3(g.at[0], TABLE.top + g.at[1], TABLE.z)), []);

  const buzz = (hand, strength = 0.6, ms = 60) => pulseController(gl.xr.getSession(), hand?.handedness ?? 'right', strength, ms);

  // Where a piece of gear is worn right now, from the head's pose.
  const wornAt = (gear, out) => {
    const head = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
    head.getWorldPosition(out);
    head.getWorldQuaternion(scratch.quat);
    scratch.forward.set(0, 0, -1).applyQuaternion(scratch.quat).setY(0).normalize();
    return out.addScaledVector(scratch.forward, gear.wear.forward).setY(out.y + gear.wear.up);
  };

  const resetGear = () => {
    run.current.tweens.clear();
    refs.current.forEach((object, i) => {
      if (!object) return;
      object.position.copy(homes[i]);
      object.quaternion.identity();
      object.visible = true;
    });
    setMuffled(false);
  };

  const stop = (finished) => {
    if (items.current) releaseAll(hands, items.current);
    if (!finished) resetGear();
    setPhase(finished ? 'done' : 'idle');
    onRunning(false);
  };

  const start = () => {
    resetGear();
    run.current = { index: 0, tweens: new Map() };
    setPhase('running');
    onRunning(true);
  };

  // Out of the headset: the defenders come off with it.
  useEffect(() => () => setMuffled(false), []);

  if (IS_TEST_HOST) {
    window.__gear = {
      run, items, refs, GEAR, phase: () => phaseRef.current, wornAt: (i, out) => wornAt(GEAR[i], out),
    };
  }

  const wear = (i, hand) => {
    const r = run.current;
    releaseAll(hands, [items.current[i]]);
    refs.current[i].visible = false;
    playSnap();
    buzz(hand, 0.7, 70);
    if (GEAR[i].id === 'ears') setMuffled(true);
    r.index += 1;
    if (r.index >= GEAR.length) {
      playFanfare();
      burst.fire(TABLE.x, TABLE.top + 0.4, TABLE.z, 0.8);
      stop(true);
    }
  };

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const r = run.current;

    if (!items.current && refs.current.length === GEAR.length && refs.current.every(Boolean)) {
      resetGear();
      glows.current = refs.current.map((object) => ownMaterials(object));
      items.current = refs.current.map((object, i) => makeGrabbable(object, {
        enabled: () => phaseRef.current === 'running' && run.current.index === i && !run.current.tweens.has(i),
        onGrab: (hand) => {
          playGrab();
          buzz(hand, 0.4, 30);
        },
        onRelease: () => {
          // Let go short of the body: back to the table.
          playDrop();
          const object = refs.current[i];
          run.current.tweens.set(i, { from: object.position.clone(), fromQ: object.quaternion.clone(), t: 0 });
        },
      }));
    }

    for (const [i, tw] of r.tweens) {
      const object = refs.current[i];
      tw.t = Math.min(1, tw.t + Math.min(delta, 0.25) / TWEEN_S);
      const u = tw.t * tw.t * (3 - 2 * tw.t);
      object.position.lerpVectors(tw.from, homes[i], u);
      object.quaternion.copy(tw.fromQ).slerp(new THREE.Quaternion(), u);
      if (tw.t >= 1) r.tweens.delete(i);
    }

    if (items.current) updateGrabs(hands, items.current);

    // Brought where it is worn: it goes on, no need to let go.
    const item = items.current?.[r.index];
    if (phaseRef.current === 'running' && item?.held) {
      const gear = GEAR[r.index];
      if (grabCenter(item, scratch.c).distanceTo(wornAt(gear, scratch.w)) < gear.reach) wear(r.index, item.held);
    }

    camera.getWorldPosition(scratch.head);
    const distance = Math.hypot(scratch.head.x - TABLE.x, scratch.head.z - TABLE.z);
    const isNear = distance < SHOW_WITHIN;
    if (isNear !== nearby) setNearby(isNear);
    if (phaseRef.current === 'running' && distance > ABORT_BEYOND) stop(false);

    const current = phaseRef.current === 'running' ? r.index : -1;
    glows.current.forEach((materials, i) => setGlow(materials, i === current && !items.current?.[i]?.held ? (items.current?.[i]?.near ? 1.6 : 1) : 0, t));

    let key = '';
    if (phaseRef.current === 'running' && r.index < GEAR.length) key = `${r.index}:${items.current?.[r.index]?.held ? 'wear' : 'grab'}`;
    if (key !== guideRef.current) {
      guideRef.current = key;
      setGuideKey(key);
    }
  });

  const [guideIndex, guideMove] = guideKey.split(':');
  const gear = GEAR[Number(guideIndex)];
  let guide = null;
  if (guideKey && gear) {
    const step = `Safety gear · ${Number(guideIndex) + 1} of ${GEAR.length}`;
    const item = () => items.current?.[run.current.index];
    if (guideMove === 'grab') {
      const heard = gear.id === 'vest' ? 'Hear it? Ear defenders on. ' : '';
      guide = {
        step,
        icon: 'grab',
        text: `${heard}Pick up the ${gear.name}`,
        button: 'Grip or trigger',
        anchor: (out) => out.copy(homes[run.current.index]).setY(TABLE.top + 0.45),
        path: (from, to) => {
          to.copy(homes[run.current.index]);
          const hand = hands.filter((h) => h.tracked).sort((a, b) => a.position.distanceTo(to) - b.position.distanceTo(to))[0];
          if (!hand) return false;
          from.copy(hand.position);
          return true;
        },
      };
    } else {
      guide = {
        step,
        icon: 'wear',
        text: `Put ${gear.verb} on: bring ${gear.verb} to ${gear.target}`,
        anchor: (out) => {
          const it = item();
          if (!it) return false;
          grabCenter(it, out);
          out.y += 0.25;
          return true;
        },
        path: (from, to) => {
          const it = item();
          if (!it) return false;
          grabCenter(it, from);
          wornAt(GEAR[run.current.index], to);
          return true;
        },
      };
    }
  }

  const arrowTarget = (out) => {
    if (phaseRef.current !== 'running' || guideRef.current.endsWith('wear')) return false;
    const home = homes[run.current.index];
    if (!home) return false;
    out.copy(home).setY(home.y + 0.08);
    return true;
  };

  return (
    <group>
      <group position={[TABLE.x, 0, TABLE.z]}>
        <mesh position={[0, TABLE.top - 0.02, 0]} material={tableMaterial}>
          <boxGeometry args={[TABLE.w, 0.04, TABLE.d]} />
        </mesh>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
          <mesh key={`${sx}${sz}`} position={[sx * (TABLE.w / 2 - 0.05), (TABLE.top - 0.04) / 2, sz * (TABLE.d / 2 - 0.05)]} material={legMaterial}>
            <boxGeometry args={[0.04, TABLE.top - 0.04, 0.04]} />
          </mesh>
        ))}
      </group>
      {GEAR.map((g, i) => {
        const Model = MODELS[g.id];
        return (
          <group key={g.id} ref={(el) => { refs.current[i] = el; }} position={homes[i]}>
            <Model />
          </group>
        );
      })}
      <BobArrow getTarget={arrowTarget} />
      {guide && <Guide {...guide} />}
      <primitive object={burst.points} />
      {nearby && phase === 'idle' && !busy && (
        <StartBadge position={BADGE_AT} icon="start" label="Safety gear" hands={hands} onPress={start} />
      )}
      {phase === 'running' && (
        <StartBadge position={BADGE_AT} icon="exit" progress={run.current.index / GEAR.length} size={0.22} hands={hands} onPress={() => stop(false)} />
      )}
      {nearby && phase === 'done' && !busy && (
        <StartBadge position={BADGE_AT} icon="again" label="Safety gear" hands={hands} onPress={start} />
      )}
    </group>
  );
}

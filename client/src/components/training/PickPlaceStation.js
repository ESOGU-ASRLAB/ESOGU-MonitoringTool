import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { IFARLAB_OFFSET } from '../cellLayout';
import { IS_TEST_HOST } from '../xrSession';
import {
  loadSample, playDrop, playFanfare, playGrab, playSample, playSnap, playSuccess, pulseController,
} from '../vrAudio';
import StartBadge from './StartBadge';
import { cellTraining } from './cellTraining';
import { BobArrow, ghostMaterial, ownMaterials, setGhostNear, setGlow, useBurst } from './effects';
import { grabCenter, makeGrabbable, releaseAll, updateGrabs } from './grab';

/*
 * HAND THE ROBOT A BOX: THE PICK-AND-PLACE TRAINING.
 *
 * Outside the IFARLAB fence, where the belt comes out through it, stand a
 * small table with three boxes and a roller infeed that runs in to the
 * conveyor. Press the start button; one box lights up with an arrow over it.
 * Pick it up (grip or trigger), carry it to the glowing square at the end of
 * the infeed and let go: it seats with a click, rolls in through the fence,
 * and the UR10e does the rest -- looks at it, grips it, carries it down its
 * rail and sets it on the table. Then the next box. Three boxes and it is
 * done. No text: the lit box, the arrow, the ghost box where it goes (green
 * when close enough) and the sounds say what to do.
 *
 * The arm is taken over through cellTraining.js (see IfarlabTasks.js).
 * Positions are in the hall's frame, off the workcell's: its belt runs along
 * x = 6.92 and starts at z 11.4, the fence stands at z 12.0.
 */

const [CELL_X, , CELL_Z] = IFARLAB_OFFSET;
const BELT_X = CELL_X + 0.742; // the pick point's line (IfarlabTasks PICK)
const BELT_TOP = 0.845;
const INFEED_FROM = CELL_Z + 0.35; // where the belt proper starts
const INFEED_TO = 12.95;
const INFEED_W = 0.36;
const DROP = new THREE.Vector3(BELT_X, BELT_TOP + 0.06, 12.7);
const DROP_REACH = 0.22;
const BOX = { w: 0.1, h: 0.12, d: 0.1 };
const TABLE = { x: 6.15, z: 12.75, w: 0.6, d: 0.55, top: 0.8 };
const SUPPLY = [[6.0, 12.62], [6.3, 12.62], [6.15, 12.9]].map(([x, z]) => new THREE.Vector3(x, TABLE.top + BOX.h / 2, z));
const BADGE_AT = [6.55, 1.5, 13.05];
// Over the aluminium table, where the arm puts them.
const TABLE_CENTER = new THREE.Vector3(CELL_X + 0.696, 0.95, CELL_Z - 2.465);
const SHOW_WITHIN = 9;
const ABORT_BEYOND = 20;
const TWEEN_S = 0.25;

const frameMaterial = new THREE.MeshStandardMaterial({ color: '#8a939c', metalness: 0.6, roughness: 0.45 });
const rollerMaterial = new THREE.MeshStandardMaterial({ color: '#c4cad0', metalness: 0.7, roughness: 0.3 });
const tableMaterial = new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 0.3, roughness: 0.5 });
const legMaterial = new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.5, roughness: 0.5 });

function Infeed() {
  const length = INFEED_TO - INFEED_FROM;
  const midZ = (INFEED_FROM + INFEED_TO) / 2;
  const rollers = [];
  for (let z = INFEED_FROM + 0.05; z < INFEED_TO; z += 0.1) rollers.push(z);
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[BELT_X + side * (INFEED_W / 2 + 0.015), BELT_TOP - 0.01, midZ]} material={frameMaterial}>
          <boxGeometry args={[0.03, 0.08, length]} />
        </mesh>
      ))}
      {rollers.map((z) => (
        <mesh key={z} position={[BELT_X, BELT_TOP - 0.022, z]} rotation-z={Math.PI / 2} material={rollerMaterial}>
          <cylinderGeometry args={[0.02, 0.02, INFEED_W, 10]} />
        </mesh>
      ))}
      {[12.3, INFEED_TO - 0.05].flatMap((z) => [-1, 1].map((side) => (
        <mesh key={`${z}-${side}`} position={[BELT_X + side * (INFEED_W / 2), (BELT_TOP - 0.05) / 2, z]} material={legMaterial}>
          <boxGeometry args={[0.035, BELT_TOP - 0.05, 0.035]} />
        </mesh>
      )))}
    </group>
  );
}

function SupplyTable() {
  return (
    <group position={[TABLE.x, 0, TABLE.z]}>
      <mesh position={[0, TABLE.top - 0.02, 0]} material={tableMaterial}>
        <boxGeometry args={[TABLE.w, 0.04, TABLE.d]} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[sx * (TABLE.w / 2 - 0.04), (TABLE.top - 0.04) / 2, sz * (TABLE.d / 2 - 0.04)]} material={legMaterial}>
          <boxGeometry args={[0.04, TABLE.top - 0.04, 0.04]} />
        </mesh>
      ))}
    </group>
  );
}

const boxMaterial = new THREE.MeshStandardMaterial({ color: '#c49a62', roughness: 0.8 });
const tapeMaterial = new THREE.MeshStandardMaterial({ color: '#2060cd', roughness: 0.6 });

export default function PickPlaceStation({ hands, busy, onRunning }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const [phase, setPhaseState] = useState('idle'); // idle | running | done
  // The same, for the frame loop and the grab rules, which outlive a render.
  const phaseRef = useRef('idle');
  const setPhase = (value) => {
    phaseRef.current = value;
    setPhaseState(value);
  };
  const [progress, setProgress] = useState(0);
  const [nearby, setNearby] = useState(false);
  const boxRefs = useRef([]);
  const zoneRef = useRef(null);
  const ghostRef = useRef(null);
  const items = useRef(null);
  const glows = useRef([]);
  const run = useRef({ index: 0, stage: 'fetch', base: 0, feed: null, tweens: new Map() });
  const burst = useBurst();
  const ghost = useMemo(() => ghostMaterial(), []);
  const scratch = useMemo(() => ({ head: new THREE.Vector3(), c: new THREE.Vector3() }), []);

  const buzz = (hand, strength = 0.6, ms = 60) => pulseController(gl.xr.getSession(), hand?.handedness ?? 'right', strength, ms);

  // Glide a box somewhere (seated, or back to its place), then `done`.
  const tween = (i, to, done) => {
    const object = boxRefs.current[i];
    run.current.tweens.set(i, { from: object.position.clone(), fromQ: object.quaternion.clone(), to: to.clone(), t: 0, done });
  };

  const resetBoxes = () => {
    run.current.tweens.clear();
    boxRefs.current.forEach((object, i) => {
      if (!object) return;
      object.position.copy(SUPPLY[i]);
      object.quaternion.identity();
      object.visible = true;
    });
  };

  const stop = (finished) => {
    if (items.current) releaseAll(hands, items.current);
    cellTraining.active = false;
    cellTraining.feeds = [];
    run.current.feed = null;
    resetBoxes();
    setPhase(finished ? 'done' : 'idle');
    onRunning(false);
  };

  const start = () => {
    resetBoxes();
    cellTraining.active = true;
    cellTraining.run += 1;
    cellTraining.feeds = [];
    run.current = { index: 0, stage: 'fetch', base: cellTraining.placed, feed: null, tweens: new Map() };
    setProgress(0);
    setPhase('running');
    onRunning(true);
  };

  // Leaving the headset mid-training hands the arm back.
  useEffect(() => {
    loadSample('conveyor-roll');
    return () => {
      cellTraining.active = false;
      cellTraining.feeds = [];
    };
  }, []);

  // Automated emulator runs follow the station; never on production.
  if (IS_TEST_HOST) window.__pickplace = { run, items, boxRefs, DROP, cellTraining, phase: () => phaseRef.current };

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const r = run.current;

    // The boxes become grabbable once they exist.
    if (!items.current && boxRefs.current.length === SUPPLY.length && boxRefs.current.every(Boolean)) {
      resetBoxes();
      glows.current = boxRefs.current.map((object) => ownMaterials(object));
      items.current = boxRefs.current.map((object, i) => makeGrabbable(object, {
        enabled: () => phaseRef.current === 'running' && run.current.stage === 'fetch' && run.current.index === i && !run.current.tweens.has(i),
        onGrab: (hand) => {
          playGrab();
          buzz(hand, 0.4, 30);
        },
        onRelease: (hand) => {
          const c = grabCenter(items.current[i], scratch.c);
          const onZone = Math.hypot(c.x - DROP.x, c.z - DROP.z) < DROP_REACH && c.y > BELT_TOP - 0.05 && c.y < BELT_TOP + 0.5;
          if (onZone) {
            playSnap();
            buzz(hand, 0.8, 70);
            run.current.stage = 'seating';
            tween(i, DROP, () => {
              // On the infeed: the arm's program takes it from here.
              run.current.feed = { y: CELL_Z - DROP.z, taken: false };
              cellTraining.feeds.push(run.current.feed);
              // The rollers taking it in (a recording, see vrAudio.js).
              playSample('conveyor-roll', { gain: 0.8 });
              run.current.stage = 'handover';
              setProgress((run.current.index + 0.5) / SUPPLY.length);
            });
          } else {
            playDrop();
            tween(i, SUPPLY[i]);
          }
        },
      }));
    }

    // Tweens: position eased, rotation back to upright.
    for (const [i, tw] of r.tweens) {
      const object = boxRefs.current[i];
      tw.t = Math.min(1, tw.t + Math.min(delta, 0.25) / TWEEN_S);
      const u = tw.t * tw.t * (3 - 2 * tw.t);
      object.position.lerpVectors(tw.from, tw.to, u);
      object.quaternion.copy(tw.fromQ).slerp(new THREE.Quaternion(), u);
      if (tw.t >= 1) {
        r.tweens.delete(i);
        tw.done?.();
      }
    }

    if (items.current) updateGrabs(hands, items.current);

    // Is the wearer near enough to be offered it (or far enough to drop it)?
    camera.getWorldPosition(scratch.head);
    const distance = Math.hypot(scratch.head.x - BADGE_AT[0], scratch.head.z - BADGE_AT[2]);
    const isNear = distance < SHOW_WITHIN;
    if (isNear !== nearby) setNearby(isNear);
    if (phaseRef.current === 'running' && distance > ABORT_BEYOND) stop(false);

    if (phaseRef.current === 'running') {
      // The handed-over box leaves the station once the arm's program has it.
      if (r.stage === 'handover' && r.feed?.taken && boxRefs.current[r.index]?.visible) boxRefs.current[r.index].visible = false;
      // Set on the table: next box, or done.
      if (r.stage === 'handover' && cellTraining.placed >= r.base + r.index + 1) {
        playSuccess();
        buzz(null, 0.6, 80);
        burst.fire(TABLE_CENTER.x, TABLE_CENTER.y, TABLE_CENTER.z, 0.7);
        r.index += 1;
        r.feed = null;
        setProgress(r.index / SUPPLY.length);
        if (r.index >= SUPPLY.length) {
          playFanfare();
          burst.fire(BADGE_AT[0], BADGE_AT[1], BADGE_AT[2], 1.2);
          stop(true);
        } else {
          r.stage = 'fetch';
        }
      }
    }

    // What to take lights up; where it goes shows as a ghost.
    const fetching = phaseRef.current === 'running' && r.stage === 'fetch';
    const item = items.current?.[r.index];
    const carrying = fetching && Boolean(item?.held);
    glows.current.forEach((materials, i) => setGlow(materials, fetching && i === r.index && !item?.held ? (item?.near ? 1.6 : 1) : 0, t));
    if (zoneRef.current) {
      zoneRef.current.visible = fetching;
      zoneRef.current.material.opacity = 0.5 + 0.35 * Math.sin(t * 4);
    }
    if (ghostRef.current) {
      ghostRef.current.visible = carrying;
      if (carrying) {
        const c = grabCenter(item, scratch.c);
        setGhostNear(ghost, Math.hypot(c.x - DROP.x, c.z - DROP.z) < DROP_REACH && c.y < BELT_TOP + 0.5, t);
      }
    }
  });

  const arrowTarget = (out) => {
    const r = run.current;
    if (phaseRef.current !== 'running' || r.stage !== 'fetch') return false;
    const item = items.current?.[r.index];
    if (!item) return false;
    if (item.held) out.set(DROP.x, DROP.y + 0.05, DROP.z);
    else out.copy(boxRefs.current[r.index].position).setY(boxRefs.current[r.index].position.y + BOX.h / 2);
    return true;
  };

  return (
    <group>
      <Infeed />
      <SupplyTable />
      {SUPPLY.map((spot, i) => (
        <group key={i} ref={(el) => { boxRefs.current[i] = el; }} position={spot}>
          <mesh material={boxMaterial} castShadow>
            <boxGeometry args={[BOX.w, BOX.h, BOX.d]} />
          </mesh>
          <mesh position={[0, BOX.h / 2 + 0.001, 0]} material={tapeMaterial}>
            <boxGeometry args={[BOX.w * 0.3, 0.002, BOX.d + 0.002]} />
          </mesh>
        </group>
      ))}
      <mesh ref={zoneRef} position={[DROP.x, BELT_TOP + 0.004, DROP.z]} rotation={[-Math.PI / 2, 0, Math.PI / 4]} visible={false}>
        <ringGeometry args={[0.13, 0.17, 4]} />
        <meshBasicMaterial color="#19a7ce" transparent opacity={0.8} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ghostRef} position={DROP} material={ghost} visible={false}>
        <boxGeometry args={[BOX.w, BOX.h, BOX.d]} />
      </mesh>
      <BobArrow getTarget={arrowTarget} />
      <primitive object={burst.points} />
      {nearby && phase === 'idle' && !busy && (
        <StartBadge position={BADGE_AT} icon="start" label="Pick & place" hands={hands} onPress={start} />
      )}
      {phase === 'running' && (
        <StartBadge position={BADGE_AT} icon="exit" progress={progress} size={0.22} hands={hands} onPress={() => stop(false)} />
      )}
      {nearby && phase === 'done' && !busy && (
        <StartBadge position={BADGE_AT} icon="again" label="Pick & place" hands={hands} onPress={start} />
      )}
    </group>
  );
}

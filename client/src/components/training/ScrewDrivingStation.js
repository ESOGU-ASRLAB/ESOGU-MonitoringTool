import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { IFARLAB_COPY_OFFSET } from '../cellLayout';
import { SCREW_POINTS, SCREW_SUPPLY, windowCellWorld } from '../windowUsecaseLayout';
import { IS_TEST_HOST } from '../xrSession';
import { playDrop, playFanfare, playGrab, playScrewDrive, playSnap, playSuccess, pulseController } from '../vrAudio';
import { BobArrow, ghostMaterial, ownMaterials, setGhostNear, setGlow, useBurst } from './effects';
import { grabCenter, makeGrabbable, releaseAll, updateGrabs } from './grab';
import Guide from './guide';
import StartBadge from './StartBadge';
import { screwTraining } from './screwTraining';

const SUPPLY = SCREW_SUPPLY.map(([x, y]) => new THREE.Vector3(...windowCellWorld(x, y, 0.92)));
const TARGETS = SCREW_POINTS.map(([x, y]) => new THREE.Vector3(...windowCellWorld(x, y, 0.915)));
const DRIVER_REST = new THREE.Vector3(...windowCellWorld(1.37, 2.4, 1.07));
const BADGE = [IFARLAB_COPY_OFFSET[0] + 2.0, 1.5, IFARLAB_COPY_OFFSET[2] - 2.0];
const SHOW_WITHIN = 7;
const ABORT_BEYOND = 15;
const SEAT_REACH = 0.095;
const TIP_REACH = 0.09;
const DRIVE_SECONDS = 1.3;
const DOWN = new THREE.Vector3(0, -1, 0);

const screwMetal = new THREE.MeshStandardMaterial({ color: '#c0cbd2', metalness: 0.82, roughness: 0.23 });
const gripBlue = new THREE.MeshStandardMaterial({ color: '#2475a4', metalness: 0.28, roughness: 0.42 });
const driverDark = new THREE.MeshStandardMaterial({ color: '#263640', metalness: 0.45, roughness: 0.38 });

function LooseScrew({ at, objectRef }) {
  return (
    <group ref={objectRef} position={at} visible={false}>
      <mesh position={[0, -0.011, 0]} material={screwMetal} castShadow>
        <cylinderGeometry args={[0.006, 0.006, 0.025, 12]} />
      </mesh>
      <mesh position={[0, 0.006, 0]} material={screwMetal} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.009, 16]} />
      </mesh>
      {/* The coloured pickup ring makes a small screw easy to find in VR. */}
      <mesh position={[0, 0.016, 0]} material={gripBlue}>
        <torusGeometry args={[0.02, 0.005, 6, 16]} />
      </mesh>
    </group>
  );
}

function HandDriver({ objectRef, tipRef, bitRef }) {
  return (
    <group ref={objectRef} position={DRIVER_REST}>
      <mesh material={driverDark} castShadow>
        <cylinderGeometry args={[0.04, 0.045, 0.18, 20]} />
      </mesh>
      <mesh position={[0, 0.06, 0]} material={gripBlue} castShadow>
        <cylinderGeometry args={[0.044, 0.042, 0.055, 20]} />
      </mesh>
      <mesh position={[0, -0.11, 0]} material={screwMetal} castShadow>
        <cylinderGeometry args={[0.015, 0.025, 0.055, 14]} />
      </mesh>
      <group ref={bitRef} position={[0, -0.155, 0]}>
        <mesh material={screwMetal} castShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.05, 10]} />
        </mesh>
        <mesh position={[0.006, 0, 0]} material={driverDark}>
          <boxGeometry args={[0.002, 0.042, 0.002]} />
        </mesh>
      </group>
      <group ref={tipRef} position={[0, -0.18, 0]} />
    </group>
  );
}

// Hands-on VR counterpart to the north cell's automatic four-screw program.
// The wearer places each loose screw, then aligns and triggers a handheld
// driver; the north UR10e parks while the wearer occupies its table.
export default function ScrewDrivingStation({ hands, busy, onRunning }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const [phase, setPhaseState] = useState('idle');
  const phaseRef = useRef('idle');
  const setPhase = (next) => { phaseRef.current = next; setPhaseState(next); };
  const [progress, setProgress] = useState(0);
  const [nearby, setNearby] = useState(false);
  const [guideKey, setGuideKey] = useState('');
  const guideRef = useRef('');
  const screws = useRef([]);
  const driver = useRef(null);
  const driverTip = useRef(null);
  const driverBit = useRef(null);
  const zone = useRef(null);
  const ghostMesh = useRef(null);
  const items = useRef(null);
  const glows = useRef([]);
  const run = useRef({ index: 0, stage: 'place', drive: 0, soundAt: 0 });
  const burst = useBurst();
  const ghost = useMemo(() => ghostMaterial(), []);
  const scratch = useMemo(() => ({
    head: new THREE.Vector3(), center: new THREE.Vector3(), tip: new THREE.Vector3(),
    axis: new THREE.Vector3(), quat: new THREE.Quaternion(),
  }), []);

  const buzz = (hand, strength = 0.55, ms = 55) => pulseController(gl.xr.getSession(), hand?.handedness ?? 'right', strength, ms);
  const resetDriver = () => {
    if (!driver.current) return;
    driver.current.position.copy(DRIVER_REST);
    driver.current.quaternion.identity();
  };
  const resetScrews = (visible) => screws.current.forEach((object, i) => {
    if (!object) return;
    object.position.copy(SUPPLY[i]);
    object.quaternion.identity();
    object.visible = visible;
  });

  const stop = (finished) => {
    if (items.current) releaseAll(hands, items.current);
    resetDriver();
    if (!finished) resetScrews(false);
    screwTraining.active = finished;
    setPhase(finished ? 'done' : 'idle');
    setGuideKey('');
    guideRef.current = '';
    onRunning(false);
  };
  const start = () => {
    if (items.current) releaseAll(hands, items.current);
    resetDriver();
    resetScrews(true);
    run.current = { index: 0, stage: 'place', drive: 0, soundAt: 0 };
    screwTraining.active = true;
    setProgress(0);
    setPhase('running');
    onRunning(true);
  };

  useEffect(() => () => {
    if (items.current) releaseAll(hands, items.current);
    screwTraining.active = false;
  }, [hands]);

  if (IS_TEST_HOST) window.__screwdriving = { run, screws, driver, driverTip, items, phase: () => phaseRef.current, TARGETS };

  useFrame(({ clock }, delta) => {
    const r = run.current;
    const index = r.index;
    if (phaseRef.current === 'running' && !items.current && screws.current.length === SCREW_POINTS.length && screws.current.every(Boolean) && driver.current) {
      glows.current = screws.current.map((object) => ownMaterials(object));
      items.current = [
        ...screws.current.map((object, i) => makeGrabbable(object, {
          enabled: () => phaseRef.current === 'running' && run.current.stage === 'place' && run.current.index === i,
          onGrab: (hand) => { playGrab(); buzz(hand, 0.35, 35); },
          onRelease: (hand) => {
            const current = run.current.index;
            const near = current === i && grabCenter(items.current[i], scratch.center).distanceTo(TARGETS[i]) < SEAT_REACH;
            if (near) {
              object.position.copy(TARGETS[i]);
              object.quaternion.identity();
              run.current.stage = 'driver';
              run.current.drive = 0;
              playSnap();
              buzz(hand, 0.75, 75);
            } else {
              object.position.copy(SUPPLY[i]);
              object.quaternion.identity();
              playDrop();
            }
          },
        })),
        makeGrabbable(driver.current, {
          enabled: () => phaseRef.current === 'running' && run.current.stage === 'driver',
          onGrab: (hand) => { playGrab(); buzz(hand, 0.35, 35); },
          onRelease: () => { run.current.drive = 0; resetDriver(); },
        }),
      ];
    }
    if (items.current) updateGrabs(hands, items.current);

    camera.getWorldPosition(scratch.head);
    const distance = Math.hypot(scratch.head.x - BADGE[0], scratch.head.z - BADGE[2]);
    const isNear = distance < SHOW_WITHIN;
    if (isNear !== nearby) setNearby(isNear);
    if (phaseRef.current === 'running' && distance > ABORT_BEYOND) stop(false);
    if (phaseRef.current === 'done' && distance > SHOW_WITHIN) stop(false);

    const screwItem = items.current?.[index];
    const driverItem = items.current?.[SCREW_POINTS.length];
    let nearHole = false;
    let aligned = false;
    if (phaseRef.current === 'running' && screwItem && r.stage === 'place' && screwItem.held) {
      nearHole = grabCenter(screwItem, scratch.center).distanceTo(TARGETS[index]) < SEAT_REACH;
    }
    if (phaseRef.current === 'running' && driverItem?.held && r.stage === 'driver' && driverTip.current) {
      driverTip.current.getWorldPosition(scratch.tip);
      driver.current.getWorldQuaternion(scratch.quat);
      scratch.axis.copy(DOWN).applyQuaternion(scratch.quat);
      aligned = scratch.tip.distanceTo(TARGETS[index]) < TIP_REACH && scratch.axis.dot(DOWN) > 0.45;
      if (aligned && driverItem.held.trigger) {
        r.drive = Math.min(DRIVE_SECONDS, r.drive + Math.min(delta, 0.1));
        if (clock.elapsedTime >= r.soundAt) {
          playScrewDrive();
          buzz(driverItem.held, 0.2, 35);
          r.soundAt = clock.elapsedTime + 0.3;
        }
        if (driverBit.current) driverBit.current.rotation.y += delta * 25;
        screws.current[index].position.y = TARGETS[index].y - 0.019 * (r.drive / DRIVE_SECONDS);
        if (r.drive >= DRIVE_SECONDS) {
          playSuccess();
          buzz(driverItem.held, 0.85, 90);
          burst.fire(TARGETS[index].x, TARGETS[index].y, TARGETS[index].z, 0.42);
          releaseAll(hands, [driverItem]);
          resetDriver();
          r.index += 1;
          r.stage = 'place';
          r.drive = 0;
          setProgress(r.index / SCREW_POINTS.length);
          if (r.index >= SCREW_POINTS.length) {
            playFanfare();
            stop(true);
          }
        }
      }
    }

    const fetching = phaseRef.current === 'running' && r.stage === 'place';
    glows.current.forEach((materials, i) => setGlow(materials, fetching && i === r.index && !screwItem?.held ? (screwItem?.near ? 1.7 : 1) : 0, clock.elapsedTime));
    if (zone.current) {
      zone.current.visible = phaseRef.current === 'running' && r.index < SCREW_POINTS.length;
      if (zone.current.visible) zone.current.position.copy(TARGETS[r.index]).setY(TARGETS[r.index].y - 0.016);
    }
    if (ghostMesh.current) {
      ghostMesh.current.visible = fetching && Boolean(screwItem?.held);
      if (ghostMesh.current.visible) {
        ghostMesh.current.position.copy(TARGETS[r.index]);
        setGhostNear(ghost, nearHole, clock.elapsedTime);
      }
    }

    let move = '';
    if (phaseRef.current === 'running') {
      if (r.stage === 'place') move = screwItem?.held ? (nearHole ? 'release' : 'carry') : 'screw';
      else move = driverItem?.held ? (aligned ? 'drive' : 'align') : 'tool';
    }
    const key = move ? `${r.index}:${move}` : '';
    if (key !== guideRef.current) {
      guideRef.current = key;
      setGuideKey(key);
    }
  });

  const move = () => guideRef.current.split(':')[1];
  const guideAnchor = (out) => {
    const index = run.current.index;
    if (index >= TARGETS.length) return false;
    if (move() === 'screw') return screws.current[index] ? out.copy(screws.current[index].position).setY(1.35) : false;
    if (move() === 'tool') return driver.current ? out.copy(driver.current.position).setY(1.5) : false;
    return out.copy(TARGETS[index]).setY(1.38);
  };
  const guidePath = (from, to) => {
    const index = run.current.index;
    if (index >= TARGETS.length) return false;
    const currentMove = move();
    if (currentMove === 'screw' || currentMove === 'tool') {
      const object = currentMove === 'screw' ? screws.current[index] : driver.current;
      if (!object) return false;
      const hand = hands.filter((h) => h.tracked).sort((a, b) => a.position.distanceTo(object.position) - b.position.distanceTo(object.position))[0];
      if (!hand) return false;
      from.copy(hand.position);
      to.copy(object.position);
      return true;
    }
    if (currentMove === 'carry') {
      grabCenter(items.current[index], from);
      to.copy(TARGETS[index]);
      return true;
    }
    if ((currentMove === 'align' || currentMove === 'drive') && driverTip.current) {
      driverTip.current.getWorldPosition(from);
      to.copy(TARGETS[index]);
      return true;
    }
    return false;
  };
  const arrowTarget = (out) => {
    if (phaseRef.current !== 'running' || run.current.index >= SCREW_POINTS.length) return false;
    if (run.current.stage === 'place') return out.copy(screws.current[run.current.index]?.position || SUPPLY[run.current.index]);
    return out.copy(items.current?.[SCREW_POINTS.length]?.held ? TARGETS[run.current.index] : DRIVER_REST);
  };
  const GUIDES = {
    screw: { icon: 'grab', text: 'Take the highlighted screw', button: 'Grip or trigger' },
    carry: { icon: 'carry', text: 'Move the screw to the glowing hole' },
    release: { icon: 'release', text: 'Let go to seat the screw', button: 'Open your hand' },
    tool: { icon: 'grab', text: 'Take the handheld screwdriver', button: 'Grip or trigger' },
    align: { icon: 'carry', text: 'Point the driver down at the screw' },
    drive: { icon: 'press', text: 'Hold trigger to drive the screw', button: 'Trigger / pinch' },
  };
  const [, guideMove] = guideKey.split(':');

  return (
    <group>
      {/* The driver rests in a small cradle beside the work table. */}
      <mesh position={[DRIVER_REST.x, 0.46, DRIVER_REST.z]} material={driverDark}>
        <boxGeometry args={[0.12, 0.92, 0.12]} />
      </mesh>
      <mesh position={[DRIVER_REST.x, 0.93, DRIVER_REST.z]} material={gripBlue}>
        <boxGeometry args={[0.15, 0.04, 0.15]} />
      </mesh>
      <HandDriver objectRef={driver} tipRef={driverTip} bitRef={driverBit} />
      {SUPPLY.map((spot, i) => <LooseScrew key={i} at={spot} objectRef={(node) => { screws.current[i] = node; }} />)}
      <mesh ref={zone} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.035, 0.052, 24]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.9} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ghostMesh} material={ghost} visible={false}>
        <cylinderGeometry args={[0.015, 0.015, 0.02, 14]} />
      </mesh>
      <BobArrow getTarget={arrowTarget} />
      {guideKey && <Guide step={`Screw ${run.current.index + 1} of ${SCREW_POINTS.length}`} {...GUIDES[guideMove]} anchor={guideAnchor} path={guidePath} />}
      <primitive object={burst.points} />
      {nearby && phase === 'idle' && !busy && <StartBadge position={BADGE} label="Screw driving" hands={hands} onPress={start} />}
      {phase === 'running' && <StartBadge position={BADGE} icon="exit" progress={progress} size={0.22} hands={hands} onPress={() => stop(false)} />}
      {nearby && phase === 'done' && !busy && <StartBadge position={BADGE} icon="again" label="Screw driving" hands={hands} onPress={start} />}
    </group>
  );
}

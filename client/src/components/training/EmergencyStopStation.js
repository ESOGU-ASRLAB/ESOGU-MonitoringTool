import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { IS_TEST_HOST } from '../xrSession';
import {
  playClunk, playError, playFanfare, playSnap, playSuccess, pulseController, startAlarm,
} from '../vrAudio';
import StartBadge from './StartBadge';
import Guide from './guide';
import { cellTraining } from './cellTraining';
import { useBurst } from './effects';

/*
 * STOP THE CELL: THE EMERGENCY-STOP DRILL.
 *
 * At the IFARLAB fence's south-east corner stand a stack light and a yellow
 * pillar with a red mushroom stop button and a blue reset button. Press
 * start and watch the cell run under a green light. At a moment nobody can
 * predict the light turns red and the alarm sounds: hit the stop button --
 * push it with a hand, or point and pull the trigger. Both arms freeze where
 * they are (cellTraining.frozen, IfarlabTasks.js) and the time it took is
 * shown. Then, as on a real cell: release the stop button (grab it), and
 * press reset; the light goes amber, then green, and the arms carry on.
 * A press before the light turns red is a false start.
 */

const LIGHT = { x: 8.15, z: 12.35, y: 1.85 };
const PILLAR = { x: 8.6, z: 12.95, h: 1.0 };
const STOP_AT = new THREE.Vector3(PILLAR.x, PILLAR.h + 0.135, PILLAR.z);
const RESET_AT = new THREE.Vector3(PILLAR.x, 0.82, PILLAR.z + 0.1);
const BADGE_AT = [9.1, 1.65, 13.4];
const POKE_M = 0.1;
const ALARM_AFTER_S = [4, 9];
const SHOW_WITHIN = 9;
const ABORT_BEYOND = 20;
const STAGES = ['watch', 'alarm', 'stopped', 'release', 'reset'];

const yellow = new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.5 });
const grey = new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.6, metalness: 0.3 });
const pole = new THREE.MeshStandardMaterial({ color: '#9ca3af', roughness: 0.5, metalness: 0.5 });

const between = ([min, max]) => min + Math.random() * (max - min);

// A lamp of the stack light: lit is bright, dark is a dim tint of its colour.
function lamp(color) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.1, transparent: true, opacity: 0.9 });
}

export default function EmergencyStopStation({ hands, busy, onRunning }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const [phase, setPhaseState] = useState('idle'); // idle | running | done
  const phaseRef = useRef('idle');
  const setPhase = (value) => {
    phaseRef.current = value;
    setPhaseState(value);
  };
  const [stage, setStageState] = useState('watch');
  const stageRef = useRef('watch');
  const setStage = (value) => {
    stageRef.current = value;
    setStageState(value);
  };
  const [nearby, setNearby] = useState(false);
  const [early, setEarly] = useState(false);
  const [reaction, setReaction] = useState(null);
  const run = useRef({ alarmAt: 0, alarmStarted: 0, alarm: null, until: 0, inside: { stop: false, reset: false } });
  const stopButton = useRef(null);
  const resetButton = useRef(null);
  const lamps = useMemo(() => ({ red: lamp('#ef4444'), amber: lamp('#f59e0b'), green: lamp('#22c55e') }), []);
  const burst = useBurst();
  const scratch = useMemo(() => ({ head: new THREE.Vector3() }), []);

  const buzz = (hand, strength = 0.8, ms = 80) => pulseController(gl.xr.getSession(), hand?.handedness ?? 'right', strength, ms);

  const endAlarm = () => {
    run.current.alarm?.stop();
    run.current.alarm = null;
  };

  const stop = (finished) => {
    endAlarm();
    cellTraining.frozen = false;
    setEarly(false);
    setPhase(finished ? 'done' : 'idle');
    onRunning(false);
  };

  const start = () => {
    endAlarm();
    cellTraining.frozen = false;
    run.current = { alarmAt: performance.now() / 1000 + between(ALARM_AFTER_S), alarmStarted: 0, alarm: null, until: 0, inside: { stop: false, reset: false } };
    setReaction(null);
    setEarly(false);
    setStage('watch');
    setPhase('running');
    onRunning(true);
  };

  // Out of the headset mid-drill: the cell must not stay stopped.
  useEffect(() => () => {
    run.current.alarm?.stop();
    cellTraining.frozen = false;
  }, []);

  // What pressing the red button does, by stage.
  const pressStop = (hand) => {
    if (phaseRef.current !== 'running') return;
    const r = run.current;
    const now = performance.now() / 1000;
    if (stageRef.current === 'watch') {
      // A false start: not yet, and the red light comes a little later.
      playError();
      setEarly(true);
      r.until = now + 1.8;
      r.alarmAt = Math.max(r.alarmAt, now + between([3, 6]));
    } else if (stageRef.current === 'alarm') {
      endAlarm();
      playClunk();
      buzz(hand, 1, 120);
      cellTraining.frozen = true;
      setReaction(now - r.alarmStarted);
      burst.fire(STOP_AT.x, STOP_AT.y + 0.05, STOP_AT.z, 0.35);
      r.until = now + 2;
      setStage('stopped');
    } else if (stageRef.current === 'release') {
      playSnap();
      buzz(hand, 0.6, 50);
      setStage('reset');
    }
  };

  const pressReset = (hand) => {
    if (phaseRef.current !== 'running' || stageRef.current !== 'reset') return;
    playSuccess();
    buzz(hand, 0.6, 60);
    cellTraining.frozen = false;
    burst.fire(RESET_AT.x, RESET_AT.y, RESET_AT.z + 0.05, 0.35);
    setTimeout(() => {
      playFanfare();
      stop(true);
    }, 400);
  };

  if (IS_TEST_HOST) {
    window.__estop = {
      stage: () => stageRef.current,
      phase: () => phaseRef.current,
      STOP_AT,
      RESET_AT,
      cellTraining,
      reaction: () => reaction,
      // A software-rendered emulator draws a frame every few seconds, so a
      // test sets when the red light comes instead of racing it.
      alarmIn: (seconds) => {
        run.current.alarmAt = performance.now() / 1000 + seconds;
      },
    };
  }

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const r = run.current;
    const now = performance.now() / 1000;

    camera.getWorldPosition(scratch.head);
    const distance = Math.hypot(scratch.head.x - PILLAR.x, scratch.head.z - PILLAR.z);
    const isNear = distance < SHOW_WITHIN;
    if (isNear !== nearby) setNearby(isNear);
    if (phaseRef.current === 'running' && distance > ABORT_BEYOND) stop(false);

    if (phaseRef.current === 'running') {
      if (early && now > r.until) setEarly(false);
      if (stageRef.current === 'watch' && now >= r.alarmAt) {
        r.alarmStarted = now;
        r.alarm = startAlarm();
        setEarly(false);
        setStage('alarm');
      }
      if (stageRef.current === 'stopped' && now > r.until) setStage('release');

      // Hands: pushing a button in (a poke), or closing a hand on it.
      for (const [name, at, press, grabOnly] of [['stop', STOP_AT, pressStop, stageRef.current === 'release'], ['reset', RESET_AT, pressReset, false]]) {
        const hand = hands.find((h) => h.tracked && h.position.distanceTo(at) < POKE_M);
        const closed = hands.find((h) => h.pressed && h.position.distanceTo(at) < POKE_M * 1.5);
        const entering = Boolean(hand) && !r.inside[name];
        r.inside[name] = Boolean(hand);
        if (closed) press(closed);
        else if (entering && !grabOnly) press(hand);
      }
    }

    // The stack light: green while the cell runs, red flashing on the alarm,
    // red while stopped, amber once released and waiting for reset.
    const s = phaseRef.current === 'running' ? stageRef.current : 'idle';
    const flash = Math.sin(t * 16) > 0;
    lamps.red.emissiveIntensity = (s === 'alarm' && flash) || s === 'stopped' || s === 'release' ? 2.4 : 0.08;
    lamps.amber.emissiveIntensity = s === 'reset' ? 2.2 : 0.08;
    lamps.green.emissiveIntensity = ['idle', 'watch'].includes(s) ? 2 : 0.08;
    // The mushroom sits down while latched.
    if (stopButton.current) stopButton.current.position.y = ['stopped', 'release'].includes(s) ? -0.014 : 0;
  });

  // The instruction for the stage at hand.
  const nearest = (to) => hands.filter((h) => h.tracked).sort((a, b) => a.position.distanceTo(to) - b.position.distanceTo(to))[0];
  const toward = (target) => (from, to) => {
    const hand = nearest(target);
    if (!hand) return false;
    from.copy(hand.position);
    to.copy(target);
    return true;
  };
  const above = (point, lift) => (out) => out.copy(point).setY(point.y + lift);
  let guide = null;
  if (phase === 'running') {
    const step = `Emergency stop · ${Math.max(1, STAGES.indexOf(stage))} of 4`;
    if (early) {
      guide = { icon: 'alert', text: 'Not yet! Wait for the red light', anchor: above(STOP_AT, 0.45) };
    } else if (stage === 'watch') {
      guide = { icon: 'watch', text: 'Watch the light. When it turns red, hit the red button!', anchor: above(STOP_AT, 0.45) };
    } else if (stage === 'alarm') {
      guide = { icon: 'alert', text: 'STOP THE CELL: hit the red button!', button: 'Push it with your hand', anchor: above(STOP_AT, 0.4), path: toward(STOP_AT) };
    } else if (stage === 'stopped') {
      guide = { icon: 'done', text: `Stopped in ${reaction?.toFixed(2)} s. The robots are frozen.`, anchor: above(STOP_AT, 0.45) };
    } else if (stage === 'release') {
      guide = { icon: 'grab', text: 'Release the stop: grab the red button', button: 'Grip or trigger', anchor: above(STOP_AT, 0.4), path: toward(STOP_AT) };
    } else if (stage === 'reset') {
      guide = { icon: 'press', text: 'Press the blue reset button to restart the cell', button: 'Push it with your hand', anchor: above(RESET_AT, 0.55), path: toward(RESET_AT) };
    }
    if (guide) guide.step = step;
  }
  const progress = phase === 'running' ? Math.max(0, STAGES.indexOf(stage)) / STAGES.length : 0;

  return (
    <group>
      {/* The stack light on its pole. */}
      <group position={[LIGHT.x, 0, LIGHT.z]}>
        <mesh position={[0, LIGHT.y / 2, 0]} material={pole}>
          <cylinderGeometry args={[0.018, 0.022, LIGHT.y, 12]} />
        </mesh>
        {[['green', 0], ['amber', 1], ['red', 2]].map(([color, i]) => (
          <mesh key={color} position={[0, LIGHT.y + 0.05 + i * 0.085, 0]} material={lamps[color]}>
            <cylinderGeometry args={[0.045, 0.045, 0.08, 20]} />
          </mesh>
        ))}
      </group>
      {/* The pillar: stop button on top, reset box on its face. */}
      <group position={[PILLAR.x, 0, PILLAR.z]}>
        <mesh position={[0, PILLAR.h / 2, 0]} material={yellow}>
          <boxGeometry args={[0.09, PILLAR.h, 0.09]} />
        </mesh>
        <mesh position={[0, PILLAR.h + 0.05, 0]} material={yellow}>
          <boxGeometry args={[0.16, 0.1, 0.16]} />
        </mesh>
        <group ref={stopButton}>
          <mesh
            position={[0, PILLAR.h + 0.118, 0]}
            onClick={(event) => {
              event.stopPropagation();
              pressStop(null);
            }}
          >
            <cylinderGeometry args={[0.055, 0.05, 0.036, 24]} />
            <meshStandardMaterial color="#dc2626" roughness={0.35} />
          </mesh>
        </group>
        <mesh position={[0, 0.82, 0.07]} material={grey}>
          <boxGeometry args={[0.1, 0.1, 0.05]} />
        </mesh>
        <mesh
          ref={resetButton}
          position={[0, 0.82, 0.1]}
          rotation-x={Math.PI / 2}
          onClick={(event) => {
            event.stopPropagation();
            pressReset(null);
          }}
        >
          <cylinderGeometry args={[0.024, 0.024, 0.018, 20]} />
          <meshStandardMaterial color="#2563eb" roughness={0.35} emissive="#1d4ed8" emissiveIntensity={stage === 'reset' && phase === 'running' ? 0.8 : 0.1} />
        </mesh>
      </group>
      {guide && <Guide {...guide} />}
      <primitive object={burst.points} />
      {nearby && phase === 'idle' && !busy && (
        <StartBadge position={BADGE_AT} icon="start" label="Emergency stop" hands={hands} onPress={start} />
      )}
      {phase === 'running' && (
        <StartBadge position={BADGE_AT} icon="exit" progress={progress} size={0.22} hands={hands} onPress={() => stop(false)} />
      )}
      {nearby && phase === 'done' && !busy && (
        <StartBadge position={BADGE_AT} icon="again" label={reaction != null ? `E-stop · ${reaction.toFixed(2)} s` : 'Emergency stop'} hands={hands} onPress={start} />
      )}
    </group>
  );
}

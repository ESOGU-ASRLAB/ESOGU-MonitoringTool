import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXRInputSourceState } from '@react-three/xr';
import * as THREE from 'three';
import { readTelemetry } from './robotTelemetry';
import {
  audioContext, isMuted, loadSample, onMuteChange, playClick, playSample, sample, setMuted, unlockAudio,
} from './vrAudio';
import { IS_TEST_HOST } from './xrSession';

/*
 * THE HALL'S SOUND, IN THE HEADSET ONLY -- REAL RECORDINGS.
 *
 * Mounted by DigitalTwin while a session runs. The listener rides the headset
 * camera, so everything placed in the hall is heard from where the wearer
 * stands. All of it is CC0 field recordings (public/assets/audio/CREDITS.md),
 * fetched when the session starts:
 *
 *   the floor     a factory floor heard from above it, all around, unplaced,
 *                 looping (hall-floor)
 *   the people    workers talking and handling boxes, placed where the hall's
 *                 own workers stand (hall-workers)
 *   the work      every few seconds one of eleven clips -- an air line let
 *                 go, an impact wrench, a toolbox, a dropped spanner, a
 *                 repair shop, forklift hydraulics and reversing beeps --
 *                 from a bench or an aisle, never the same clip twice running
 *   the robots    now and then a short servo recording from a robot's moving
 *                 part while it moves, heard only close to it. Before, a hum
 *                 rose and fell with every move ("vuuuuv vuuuuv").
 *
 * X on the left controller mutes and unmutes all of it.
 */

// Axis speed that counts as "full effort": degrees/s for rotary, mm/s for linear.
const FULL_DEG_S = 90;
const FULL_MM_S = 400;
// Which axes are linear (mm), per robot; the rest are degrees.
const LINEAR_AXES = { robot1: [0, 1, 2], robot2: [0, 1, 2] };

// Workbenches and machines, and the forklift aisles at the hall's ends.
const SPOTS = {
  bench: [[8.8, 1.0, 13.2], [5.5, 1.0, 6.2], [-4.6, 1.0, 10.4], [-4.6, 1.0, -13.4], [12.5, 1.0, -4], [-12.5, 1.0, 4]],
  aisle: [[-10, 1.2, -19], [10, 1.2, -19], [-10, 1.2, 19], [10, 1.2, 19]],
};
const WORK = [
  { name: 'air-release', at: 'bench', gain: 0.8 },
  { name: 'impact-wrench-a', at: 'bench', gain: 0.7 },
  { name: 'impact-wrench-b', at: 'bench', gain: 0.7 },
  { name: 'toolbox-a', at: 'bench', gain: 1 },
  { name: 'toolbox-b', at: 'bench', gain: 1 },
  { name: 'toolbox-c', at: 'bench', gain: 1 },
  { name: 'wrench-drop', at: 'bench', gain: 0.8 },
  { name: 'mechanic-shop', at: 'bench', gain: 0.6 },
  { name: 'hydraulics-a', at: 'aisle', gain: 0.8 },
  { name: 'hydraulics-b', at: 'aisle', gain: 0.8 },
  { name: 'forklift-reverse', at: 'aisle', gain: 0.5 },
];
const WORK_GAP_S = [3, 8];
// Where the workers stand (Workers.js): the Otokar cell's two ends.
const WORKER_SPOTS = [[-4.4, 1.5, -12.8], [-4.4, 1.5, 9.6]];
const SERVOS = ['servo-a', 'servo-b'];
const SERVO_GAP_S = [2.5, 6];
const MOVING = 0.15;
const FLOOR = 'hall-floor';
const PEOPLE = 'hall-workers';

const HALL_SAMPLES = [FLOOR, PEOPLE, ...WORK.map((w) => w.name), ...SERVOS];
// Automated emulator runs check the recordings decoded; never on production.
if (IS_TEST_HOST && typeof window !== 'undefined') window.__vrSamples = () => HALL_SAMPLES.map((name) => [name, Boolean(sample(name))]);

const between = ([min, max]) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// A spot in the hall to play from: a gain node into a PositionalAudio.
function emitterAt(listener, scene, position, refDistance, rolloff) {
  const input = audioContext().createGain();
  const emitter = new THREE.PositionalAudio(listener);
  emitter.setNodeSource(input);
  emitter.setRefDistance(refDistance);
  emitter.setRolloffFactor(rolloff);
  if (position) {
    emitter.position.set(...position);
    scene.add(emitter);
  }
  return { input, emitter };
}

export default function VRSoundscape({ targets }) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const left = useXRInputSourceState('controller', 'left');
  const voices = useRef([]);
  const xDown = useRef(false);

  useEffect(() => {
    unlockAudio();
    // The first trigger pull is a user gesture inside the session too.
    const session = gl.xr.getSession();
    session?.addEventListener('selectstart', unlockAudio);

    const listener = new THREE.AudioListener();
    camera.add(listener);
    listener.setMasterVolume(isMuted() ? 0 : 1);
    const offMute = onMuteChange((muted) => listener.setMasterVolume(muted ? 0 : 1));

    let alive = true;
    const playing = [];
    const spots = Object.fromEntries(Object.entries(SPOTS).map(([kind, list]) => [kind, list.map((p) => emitterAt(listener, scene, p, 4, 1))]));
    const people = WORKER_SPOTS.map((p) => emitterAt(listener, scene, p, 5, 1));
    let timer = null;
    let last = null;

    // Nothing plays until the recordings are here; each starts as it arrives.
    loadSample(FLOOR).then(() => {
      if (!alive) return;
      const floor = playSample(FLOOR, { gain: 0.45, loop: true, fadeIn: 3 });
      if (floor) playing.push(floor);
    });
    loadSample(PEOPLE).then(() => {
      if (!alive) return;
      // Each spot starts the loop at its own random point: two groups, not one twice.
      people.forEach(({ input }) => {
        const voicesHere = playSample(PEOPLE, { dest: input, gain: 0.9, loop: true, fadeIn: 4 });
        if (voicesHere) playing.push(voicesHere);
      });
    });
    [...WORK.map((w) => w.name), ...SERVOS].forEach(loadSample);

    const next = () => {
      if (!alive) return;
      const choices = WORK.filter((w) => w.name !== last);
      const work = pick(choices);
      const { input } = pick(spots[work.at]);
      // A little variation in pitch and level, so repeats do not sound like repeats.
      if (playSample(work.name, { dest: input, gain: work.gain * between([0.75, 1]), rate: between([0.94, 1.06]) })) last = work.name;
      timer = setTimeout(next, between(WORK_GAP_S) * 1000);
    };
    timer = setTimeout(next, 4000);

    voices.current = targets.map(({ id }) => ({
      id, ...emitterAt(listener, scene, null, 1.5, 2), attachedTo: null, last: null, speed: 0, nextAt: 0,
    }));

    return () => {
      alive = false;
      session?.removeEventListener('selectstart', unlockAudio);
      clearTimeout(timer);
      offMute();
      playing.forEach((p) => p.stop());
      [...Object.values(spots).flat(), ...people].forEach(({ emitter, input }) => {
        scene.remove(emitter);
        input.disconnect();
        emitter.disconnect();
      });
      voices.current.forEach(({ emitter, input }) => {
        emitter.removeFromParent();
        input.disconnect();
        emitter.disconnect();
      });
      voices.current = [];
      camera.remove(listener);
    };
  }, [camera, scene, gl, targets]);

  useFrame(({ clock }, delta) => {
    // X toggles the sound.
    const down = left?.gamepad?.['x-button']?.state === 'pressed';
    if (down && !xDown.current) {
      const muting = !isMuted();
      if (!muting) setMuted(false);
      playClick();
      if (muting) setTimeout(() => setMuted(true), 80);
    }
    xDown.current = down;

    if (delta <= 0) return;
    const now = clock.getElapsedTime();
    for (const v of voices.current) {
      // Hang the voice on the robot's moving part once it is in the scene.
      if (!v.attachedTo?.parent) {
        const target = targets.find((t) => t.id === v.id)?.resolve(scene);
        if (target) {
          target.add(v.emitter);
          v.attachedTo = target;
        }
      }
      const values = readTelemetry(v.id);
      if (!values) continue;
      if (v.last && v.last.length === values.length) {
        const linear = LINEAR_AXES[v.id] || [];
        let effort = 0;
        for (let i = 0; i < values.length; i += 1) {
          const full = linear.includes(i) ? FULL_MM_S : FULL_DEG_S;
          effort += Math.abs(values[i] - v.last[i]) / delta / full;
        }
        v.speed += (Math.min(1, effort) - v.speed) * Math.min(1, delta * 6);
      }
      v.last = values.slice();
      // A servo recording now and then while it moves, stronger the faster.
      if (v.speed > MOVING && now >= v.nextAt) {
        playSample(pick(SERVOS), { dest: v.input, gain: 0.3 + 0.5 * v.speed, rate: 0.9 + 0.2 * v.speed });
        v.nextAt = now + between(SERVO_GAP_S);
      }
    }
  });

  return null;
}

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXRInputSourceState } from '@react-three/xr';
import * as THREE from 'three';
import { readTelemetry } from './robotTelemetry';
import {
  HALL_SOUNDS, audioContext, createServoVoice, isMuted, onMuteChange, playClick, setMuted, startAmbience, unlockAudio,
} from './vrAudio';

/*
 * THE HALL'S SOUND, IN THE HEADSET ONLY.
 *
 * Mounted by DigitalTwin while a session runs. The listener rides the headset
 * camera, so everything placed in the hall is heard from where the wearer
 * stands:
 *
 *   room tone  a light air-handling wash, not placed (vrAudio.startAmbience)
 *   robots     a soft hum on each robot's moving part, rising with how fast
 *              its axes actually move (telemetry), silent when it stops
 *   the hall   every few seconds one of eight workshop sounds (HALL_SOUNDS),
 *              from one of the work areas, never the same kind twice running
 *
 * X on the left controller mutes and unmutes all of it.
 */

// Axis speed that counts as "full effort": degrees/s for rotary, mm/s for linear.
const FULL_DEG_S = 90;
const FULL_MM_S = 400;
// Which axes are linear (mm), per robot; the rest are degrees.
const LINEAR_AXES = { robot1: [0, 1, 2], robot2: [0, 1, 2] };
// Where the workshop sounds come from: around both cells, the benches along
// the walls and the far ends of the hall.
const SOUND_SPOTS = [
  [5.5, 1.2, 9.5], [3.2, 1.0, 13.0], [8.5, 1.0, 12.5], // IFARLAB
  [-4, 1.5, 4], [-1, 1.5, -6], [-5, 1.2, 12], // Otokar
  [-13, 1.2, -18], [13, 1.2, -16], [-13, 1.2, 19], [13, 1.2, 18], // hall ends
];
const EVENT_GAP_S = [2.5, 7];

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
    const stopAmbience = startAmbience();

    const emitters = SOUND_SPOTS.map((spot) => {
      const input = audioContext().createGain();
      const emitter = new THREE.PositionalAudio(listener);
      emitter.setNodeSource(input);
      emitter.setRefDistance(4);
      emitter.setRolloffFactor(1);
      emitter.position.set(...spot);
      scene.add(emitter);
      return { emitter, input };
    });
    const kinds = Object.keys(HALL_SOUNDS);
    let lastKind = null;
    let timer = null;
    const next = () => {
      let kind;
      do {
        kind = kinds[Math.floor(Math.random() * kinds.length)];
      } while (kind === lastKind);
      lastKind = kind;
      const { input } = emitters[Math.floor(Math.random() * emitters.length)];
      HALL_SOUNDS[kind](input);
      const [min, max] = EVENT_GAP_S;
      timer = setTimeout(next, (min + Math.random() * (max - min)) * 1000);
    };
    timer = setTimeout(next, 3000);

    voices.current = targets.map(({ id }) => {
      const voice = createServoVoice();
      const emitter = new THREE.PositionalAudio(listener);
      emitter.setNodeSource(voice.node);
      emitter.setRefDistance(1.5);
      emitter.setRolloffFactor(1.6);
      return { id, voice, emitter, attachedTo: null, last: null, speed: 0 };
    });

    return () => {
      session?.removeEventListener('selectstart', unlockAudio);
      clearTimeout(timer);
      offMute();
      stopAmbience();
      emitters.forEach(({ emitter, input }) => {
        scene.remove(emitter);
        input.disconnect();
        emitter.disconnect();
      });
      voices.current.forEach(({ voice, emitter }) => {
        emitter.removeFromParent();
        voice.stop();
        emitter.disconnect();
      });
      voices.current = [];
      camera.remove(listener);
    };
  }, [camera, scene, gl, targets]);

  useFrame((_, delta) => {
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
        v.voice.setSpeed(v.speed);
      }
      v.last = values.slice();
    }
  });

  return null;
}

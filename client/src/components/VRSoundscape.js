import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { readTelemetry } from './robotTelemetry';
import { audioContext, clankInto, createServoVoice, startAmbience, unlockAudio } from './vrAudio';

/*
 * THE HALL'S SOUND, IN THE HEADSET ONLY.
 *
 * Mounted by DigitalTwin while a session runs. The listener rides the headset
 * camera, so everything placed in the hall is heard from where the wearer
 * stands:
 *
 *   ambience   a rumble-and-hum bed, not placed (vrAudio.startAmbience)
 *   robots     one servo voice per robot, attached to the part that moves and
 *              driven by how fast its axes are actually moving (telemetry)
 *   the hall   now and then a metal clank from one of the far corners
 */

// Axis speed that counts as "full effort": degrees/s for rotary, mm/s for linear.
const FULL_DEG_S = 90;
const FULL_MM_S = 400;
// Which axes are linear (mm), per robot; the rest are degrees.
const LINEAR_AXES = { robot1: [0, 1, 2], robot2: [0, 1, 2] };
const CLANK_SPOTS = [[-13, 2.5, -20], [13, 2.5, -18], [-13, 2.5, 20], [13, 2.5, 18]];

export default function VRSoundscape({ targets }) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const voices = useRef([]);

  useEffect(() => {
    unlockAudio();
    // The first trigger pull is a user gesture inside the session too.
    const session = gl.xr.getSession();
    session?.addEventListener('selectstart', unlockAudio);

    const listener = new THREE.AudioListener();
    camera.add(listener);
    const stopAmbience = startAmbience();

    const clankers = CLANK_SPOTS.map((spot) => {
      const input = audioContext().createGain();
      const emitter = new THREE.PositionalAudio(listener);
      emitter.setNodeSource(input);
      emitter.setRefDistance(6);
      emitter.position.set(...spot);
      scene.add(emitter);
      return { emitter, input };
    });
    let clankTimer = null;
    const clank = () => {
      const { input } = clankers[Math.floor(Math.random() * clankers.length)];
      clankInto(input, 0.6 + Math.random() * 0.6);
      clankTimer = setTimeout(clank, 3000 + Math.random() * 6000);
    };
    clankTimer = setTimeout(clank, 2500);

    voices.current = targets.map(({ id }) => {
      const voice = createServoVoice();
      const emitter = new THREE.PositionalAudio(listener);
      emitter.setNodeSource(voice.node);
      emitter.setRefDistance(2);
      emitter.setRolloffFactor(1.4);
      return { id, voice, emitter, attachedTo: null, last: null, speed: 0 };
    });

    return () => {
      session?.removeEventListener('selectstart', unlockAudio);
      clearTimeout(clankTimer);
      stopAmbience();
      clankers.forEach(({ emitter, input }) => {
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

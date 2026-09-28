import * as THREE from 'three';

/*
 * SOUND FOR THE HEADSET, SYNTHESISED -- NO AUDIO FILES.
 *
 * Every sound here is built from oscillators and noise with the Web Audio API:
 * nothing to download on a headset's first visit, and no recording whose
 * licence has to be tracked. It all runs on three's shared AudioContext, the
 * one THREE.AudioListener / PositionalAudio use, so the positional robot
 * voices (VRSoundscape.js) and these one-shots mix in the same graph.
 *
 * Browsers start an AudioContext suspended until a user gesture. The Enter VR
 * button calls unlockAudio(); so does the first trigger pull in the session.
 */

export function audioContext() {
  return THREE.AudioContext.getContext();
}

export function unlockAudio() {
  const ctx = audioContext();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

// All one-shot UI sounds go through this, so they can be turned down as one.
let uiBus = null;
function ui() {
  const ctx = audioContext();
  if (!uiBus) {
    uiBus = ctx.createGain();
    uiBus.gain.value = 0.35;
    uiBus.connect(ctx.destination);
  }
  return uiBus;
}

let noiseBuffer = null;
/** Two seconds of white noise, shared by every noise-based sound. */
export function whiteNoise() {
  const ctx = audioContext();
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function tone({ freq, type = 'sine', start = 0, duration = 0.15, peak = 1, to = null, out = ui() }) {
  const ctx = audioContext();
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export function playClick() {
  tone({ freq: 1400, duration: 0.05, peak: 0.5 });
}

/** A rising major arpeggio: a step done. */
export function playSuccess() {
  [523.25, 659.25, 783.99].forEach((freq, i) => tone({ freq, type: 'triangle', start: i * 0.09, duration: 0.28, peak: 0.7 }));
}

/** A low falling buzz: not that one. */
export function playError() {
  tone({ freq: 220, to: 140, type: 'square', duration: 0.32, peak: 0.25 });
}

/** The whole module finished: arpeggio up to the octave and a held chord. */
export function playFanfare() {
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone({ freq, type: 'triangle', start: i * 0.12, duration: 0.35, peak: 0.7 }));
  [523.25, 659.25, 783.99].forEach((freq) => tone({ freq, type: 'sine', start: 0.5, duration: 1.2, peak: 0.35 }));
}

/** A short swept whoosh for a teleport. */
export function playWhoosh() {
  const ctx = audioContext();
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = whiteNoise();
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.2;
  band.frequency.setValueAtTime(300, t0);
  band.frequency.exponentialRampToValueAtTime(2400, t0 + 0.25);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  src.connect(band).connect(gain).connect(ui());
  src.start(t0);
  src.stop(t0 + 0.35);
}

/**
 * A metallic clank into `out` (a PositionalAudio's input, so it comes from
 * somewhere in the hall): a noise burst through a ringing band-pass.
 */
export function clankInto(out, strength = 1) {
  const ctx = audioContext();
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = whiteNoise();
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 900 + Math.random() * 1800;
  band.Q.value = 12;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(1.2 * strength, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
  src.connect(band).connect(gain).connect(out);
  src.start(t0);
  src.stop(t0 + 0.55);
}

/**
 * The hall's bed of sound: brown-ish rumble (low-passed noise), mains hum and
 * its harmonic. Returns stop().
 */
export function startAmbience(volume = 0.16) {
  const ctx = audioContext();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.setTargetAtTime(volume, ctx.currentTime, 1.5);
  master.connect(ctx.destination);

  const rumble = ctx.createBufferSource();
  rumble.buffer = whiteNoise();
  rumble.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 260;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.9;
  rumble.connect(low).connect(rumbleGain).connect(master);

  const hums = [[50, 0.12], [100, 0.06], [150, 0.02]].map(([freq, level]) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(master);
    osc.start();
    return osc;
  });
  rumble.start();

  return () => {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => {
      rumble.stop();
      hums.forEach((osc) => osc.stop());
      master.disconnect();
    }, 1500);
  };
}

/**
 * A servo/gearbox whine for one robot, fed into a PositionalAudio. Its level
 * and pitch follow how fast the robot is moving (setSpeed, 0..1).
 */
export function createServoVoice() {
  const ctx = audioContext();
  const out = ctx.createGain();
  out.gain.value = 0;
  const motor = ctx.createOscillator();
  motor.type = 'sawtooth';
  motor.frequency.value = 90;
  const whine = ctx.createOscillator();
  whine.type = 'sine';
  whine.frequency.value = 520;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 400;
  band.Q.value = 3;
  const whineGain = ctx.createGain();
  whineGain.gain.value = 0.25;
  motor.connect(band).connect(out);
  whine.connect(whineGain).connect(out);
  motor.start();
  whine.start();
  return {
    node: out,
    setSpeed(speed) {
      const t = ctx.currentTime;
      out.gain.setTargetAtTime(0.5 * speed, t, 0.08);
      motor.frequency.setTargetAtTime(80 + 140 * speed, t, 0.1);
      whine.frequency.setTargetAtTime(420 + 520 * speed, t, 0.1);
    },
    stop() {
      motor.stop();
      whine.stop();
      out.disconnect();
    },
  };
}

/** A short buzz on one controller, where the headset supports it. */
export function pulseController(session, handedness, intensity = 0.6, ms = 60) {
  const source = session?.inputSources && [...session.inputSources].find((s) => s.handedness === handedness);
  const actuator = source?.gamepad?.hapticActuators?.[0];
  actuator?.pulse?.(intensity, ms);
}

import * as THREE from 'three';

/*
 * SOUND FOR THE HEADSET, SYNTHESISED -- NO AUDIO FILES.
 *
 * Every sound here is built from oscillators and noise with the Web Audio API:
 * nothing to download on a headset's first visit, and no recording whose
 * licence has to be tracked. It all runs on three's shared AudioContext, the
 * one THREE.AudioListener / PositionalAudio use, so the positional sounds in
 * the hall (VRSoundscape.js) and these one-shots mix in the same graph.
 *
 * The first version had a mains hum, a low rumble and hard metal clanks, and
 * the first headset test found it frightening and tiring: one dark drone and
 * the same bang again and again. So now: a light, airy room tone, a varied
 * set of soft workshop sounds (hall()), a smooth hum from the robots, and
 * nothing sharp or low for long. X on the left controller mutes it all.
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

// Everything not placed in the hall -- room tone and feedback -- goes through
// this, so muting is one gain. The placed sounds follow via onMuteChange.
let master = null;
let muted = false;
const muteListeners = new Set();
function out() {
  const ctx = audioContext();
  if (!master) {
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  return master;
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 1, audioContext().currentTime, 0.05);
  muteListeners.forEach((listener) => listener(muted));
}

/** Calls listener(muted) on every change; returns an unsubscribe. */
export function onMuteChange(listener) {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

// Feedback sounds at one level, under the room.
let feedbackBus = null;
function feedback() {
  if (!feedbackBus) {
    feedbackBus = audioContext().createGain();
    feedbackBus.gain.value = 0.3;
    feedbackBus.connect(out());
  }
  return feedbackBus;
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

const rand = (min, max) => min + Math.random() * (max - min);

function tone({ freq, type = 'sine', start = 0, duration = 0.15, peak = 1, to = null, attack = 0.01, dest = feedback() }) {
  const ctx = audioContext();
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(dest);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

// A burst of filtered noise: hisses, taps, rolls.
function noise({ start = 0, duration = 0.3, peak = 0.5, attack = 0.01, filter = 'bandpass', freq = 1000, to = null, q = 1, rate = 1, dest = feedback() }) {
  const ctx = audioContext();
  const t0 = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  src.buffer = whiteNoise();
  src.loop = true; // started at a random offset, so it may run past the end
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(f).connect(gain).connect(dest);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + duration + 0.05);
}

/* ------------------------------ feedback -------------------------------- */

export function playClick() {
  tone({ freq: 1100, duration: 0.05, peak: 0.35 });
}

/** A part or box picked up: a soft rising pop. */
export function playGrab() {
  tone({ freq: 420, to: 640, duration: 0.09, peak: 0.4 });
}

/** Let go somewhere it does not belong: a soft falling pop, it floats back. */
export function playDrop() {
  tone({ freq: 520, to: 330, duration: 0.14, peak: 0.3 });
}

/** A part seated where it belongs: a firm click with a little body. */
export function playSnap() {
  noise({ duration: 0.06, peak: 0.5, filter: 'highpass', freq: 2500, q: 0.7 });
  tone({ freq: 190, to: 120, duration: 0.12, peak: 0.5 });
  tone({ freq: 880, type: 'triangle', start: 0.03, duration: 0.18, peak: 0.25 });
}

/** A step done: a light rising arpeggio, marimba-like. */
export function playSuccess() {
  [523.25, 659.25, 783.99].forEach((freq, i) => tone({ freq, type: 'triangle', start: i * 0.08, duration: 0.3, peak: 0.45 }));
}

/** Not there: a soft low "bonk", never a buzzer. */
export function playError() {
  tone({ freq: 300, to: 210, duration: 0.22, peak: 0.35 });
}

/** A training finished: up to the octave and a held chord. */
export function playFanfare() {
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => tone({ freq, type: 'triangle', start: i * 0.12, duration: 0.35, peak: 0.45 }));
  [523.25, 659.25, 783.99].forEach((freq) => tone({ freq, start: 0.5, duration: 1.4, peak: 0.22, attack: 0.08 }));
}

/** A short swept whoosh: a teleport, a height reset. */
export function playWhoosh() {
  noise({ duration: 0.3, peak: 0.35, attack: 0.05, freq: 300, to: 2400, q: 1.2 });
}

/* ----------------------------- the hall ---------------------------------- */

/*
 * The workshop's own sounds, each into `dest` (a PositionalAudio's input, so
 * it comes from somewhere in the hall). Soft on purpose: a room full of work
 * going on, heard from a respectful distance. Each call varies its pitch and
 * length a little, so no two are the same.
 */
export const HALL_SOUNDS = {
  // A pneumatic valve letting go.
  hiss: (dest) => noise({ duration: rand(0.35, 0.8), peak: 0.22, attack: 0.02, filter: 'highpass', freq: rand(2500, 4000), q: 0.5, dest }),
  // A machine saying a cycle is done: two soft notes.
  chime: (dest) => {
    const base = [587.33, 659.25, 698.46, 783.99][Math.floor(Math.random() * 4)];
    tone({ freq: base, start: 0, duration: 0.9, peak: 0.16, attack: 0.02, dest });
    tone({ freq: base * 0.75, start: 0.28, duration: 1.1, peak: 0.14, attack: 0.02, dest });
  },
  // A plastic tote set down on a bench.
  tap: (dest) => {
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i += 1) tone({ freq: rand(700, 1100), to: rand(300, 450), start: i * rand(0.12, 0.2), duration: 0.07, peak: 0.25, attack: 0.003, dest });
  },
  // Rollers running for a moment: soft rhythmic ticks.
  roll: (dest) => {
    const beats = 10 + Math.floor(Math.random() * 12);
    const step = rand(0.07, 0.11);
    for (let i = 0; i < beats; i += 1) noise({ start: i * step, duration: 0.05, peak: 0.08 * Math.sin((i / beats) * Math.PI) + 0.01, filter: 'bandpass', freq: rand(900, 1300), q: 3, dest });
  },
  // A status beep, far off.
  beep: (dest) => {
    const freq = rand(880, 1050);
    for (let i = 0; i < 3; i += 1) tone({ freq, start: i * 0.22, duration: 0.09, peak: 0.07, attack: 0.005, dest });
  },
  // A light metal ping: a tool laid on a steel bench.
  ping: (dest) => {
    const freq = rand(1800, 2600);
    tone({ freq, type: 'triangle', duration: rand(0.5, 0.8), peak: 0.07, attack: 0.002, dest });
    tone({ freq: freq * 2.76, duration: 0.25, peak: 0.025, attack: 0.002, dest });
  },
  // A trolley passing: a soft swell of low-passed noise.
  cart: (dest) => noise({ duration: rand(1.4, 2.2), peak: 0.12, attack: 0.7, filter: 'lowpass', freq: rand(500, 800), q: 0.7, dest }),
  // A nut runner: a short whir up, twice.
  wrench: (dest) => {
    const n = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i += 1) {
      noise({ start: i * 0.45, duration: 0.3, peak: 0.07, attack: 0.03, filter: 'bandpass', freq: 600, to: 1500, q: 4, dest });
    }
  },
};

/**
 * The room tone: noise softened to a light air-handling wash, its brightness
 * drifting slowly so it never sits still. No hum, nothing below ~150 Hz.
 * Returns stop().
 */
export function startAmbience(volume = 0.05) {
  const ctx = audioContext();
  const bed = ctx.createGain();
  bed.gain.value = 0;
  bed.gain.setTargetAtTime(volume, ctx.currentTime, 2);
  bed.connect(out());

  const air = ctx.createBufferSource();
  air.buffer = whiteNoise();
  air.loop = true;
  const high = ctx.createBiquadFilter();
  high.type = 'highpass';
  high.frequency.value = 150;
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 900;
  low.Q.value = 0.3;
  air.connect(high).connect(low).connect(bed);

  // A very slow drift of the wash's brightness.
  const drift = ctx.createOscillator();
  drift.frequency.value = 0.04;
  const depth = ctx.createGain();
  depth.gain.value = 250;
  drift.connect(depth).connect(low.frequency);

  air.start();
  drift.start();

  return () => {
    bed.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => {
      air.stop();
      drift.stop();
      bed.disconnect();
    }, 1500);
  };
}

/**
 * A robot's drive, into a PositionalAudio: a smooth, slightly detuned hum
 * through a low-pass, rising a little with speed (setSpeed, 0..1) and silent
 * when the robot stands still.
 */
export function createServoVoice() {
  const ctx = audioContext();
  const node = ctx.createGain();
  node.gain.value = 0;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 700;
  lowpass.connect(node);
  const oscillators = [[1, 1], [2.01, 0.35], [3.02, 0.12]].map(([ratio, level]) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = 150 * ratio;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(lowpass);
    osc.start();
    return { osc, ratio };
  });
  return {
    node,
    setSpeed(speed) {
      const t = ctx.currentTime;
      node.gain.setTargetAtTime(0.12 * speed, t, 0.15);
      oscillators.forEach(({ osc, ratio }) => osc.frequency.setTargetAtTime((140 + 110 * speed) * ratio, t, 0.2));
    },
    stop() {
      oscillators.forEach(({ osc }) => osc.stop());
      node.disconnect();
    },
  };
}

/** A short buzz on one controller, where the headset supports it. */
export function pulseController(session, handedness, intensity = 0.6, ms = 60) {
  const source = session?.inputSources && [...session.inputSources].find((s) => s.handedness === handedness);
  const actuator = source?.gamepad?.hapticActuators?.[0];
  actuator?.pulse?.(intensity, ms);
}

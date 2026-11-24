import * as THREE from 'three';

/*
 * SOUND FOR THE HEADSET.
 *
 * Two kinds, on three's shared AudioContext (the one THREE.AudioListener /
 * PositionalAudio use), so everything mixes in one graph:
 *
 *   the hall      real recordings -- factory floor, workers, tools, forklift,
 *                 servos -- CC0 from Freesound, cut and levelled by
 *                 scripts/audio/build_vr_sounds.mjs into public/assets/audio
 *                 (~0.9 MB, fetched only when a session starts); loadSamples,
 *                 playSample, VRSoundscape.js places them
 *   feedback      short tones synthesised here: clicks, pops, the seat
 *                 click, chimes, the teleport whoosh
 *
 * The hall was synthesised twice before, and both failed on the headset: a
 * mains hum with hard clanks ("scary"), then soft swells and a robot hum that
 * rose and fell with every move ("vuuuuv vuuuuv"). Recordings sound like a
 * factory because they are one. X on the left controller mutes it all.
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

/*
 * Ear defenders (the safety-gear training) muffle the hall -- its recordings,
 * placed or not -- but never the feedback or an alarm, which a real wearer
 * still hears. Unplaced hall sound runs through hall() and its low-pass; the
 * placed sounds are muffled by VRSoundscape through the listener's filter
 * (muffleFilter), on onMuffleChange.
 */
let hallBus = null;
let hallFilter = null;
let muffled = false;
let hallDucked = false;
const muffleListeners = new Set();
const MUFFLE_HZ = 650;
const MUFFLE_GAIN = 0.55;
const hallGain = () => (muffled ? MUFFLE_GAIN : 1) * (hallDucked ? 0.3 : 1);

function hall() {
  if (!hallBus) {
    const ctx = audioContext();
    hallFilter = ctx.createBiquadFilter();
    hallFilter.type = 'lowpass';
    hallFilter.frequency.value = muffled ? MUFFLE_HZ : 20000;
    hallBus = ctx.createGain();
    hallBus.gain.value = hallGain();
    hallBus.connect(hallFilter).connect(out());
  }
  return hallBus;
}

export function setHallDucked(value) {
  hallDucked = value;
  if (hallBus) hallBus.gain.setTargetAtTime(hallGain(), audioContext().currentTime, 0.12);
}

export function isMuffled() {
  return muffled;
}

export function setMuffled(value) {
  if (muffled === value) return;
  muffled = value;
  if (hallBus) {
    const t = audioContext().currentTime;
    hallFilter.frequency.setTargetAtTime(muffled ? MUFFLE_HZ : 20000, t, 0.08);
    hallBus.gain.setTargetAtTime(hallGain(), t, 0.08);
  }
  muffleListeners.forEach((listener) => listener(muffled));
}

/** Calls listener(muffled) on every change; returns an unsubscribe. */
export function onMuffleChange(listener) {
  muffleListeners.add(listener);
  return () => muffleListeners.delete(listener);
}

/** A fresh low-pass for a listener to hang in its path while muffled. */
export function muffleFilter() {
  const filter = audioContext().createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = MUFFLE_HZ;
  return filter;
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

/** Brief motor whirr while a handheld screwdriver is driving a fastener. */
export function playScrewDrive() {
  noise({ duration: 0.18, peak: 0.2, filter: 'bandpass', freq: 1100, q: 1.8 });
  tone({ freq: 155, type: 'sawtooth', duration: 0.18, peak: 0.12 });
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

/** A mushroom stop button latching down: a heavy clunk. */
export function playClunk() {
  noise({ duration: 0.09, peak: 0.6, filter: 'lowpass', freq: 900, q: 0.7 });
  tone({ freq: 110, to: 70, duration: 0.18, peak: 0.7 });
}

/**
 * The cell's alarm: a two-tone call, 0.4 s each, until stop() -- on the
 * feedback bus, so ear defenders do not hide it. Returns { stop }.
 */
export function startAlarm() {
  let on = true;
  let high = true;
  let timer = null;
  const beat = () => {
    if (!on) return;
    tone({ freq: high ? 960 : 770, type: 'triangle', duration: 0.38, peak: 0.55, attack: 0.02 });
    high = !high;
    timer = setTimeout(beat, 400);
  };
  beat();
  return {
    stop() {
      on = false;
      clearTimeout(timer);
    },
  };
}

/* ----------------------------- the hall ---------------------------------- */

const SAMPLE_BASE = `${process.env.PUBLIC_URL}/assets/audio`;
// Each loop file carries this much of its own end before its start and of
// its start after its end, and plays between the two (build_vr_sounds.mjs).
export const LOOP_PAD = 0.05;

const samples = new Map(); // name -> AudioBuffer, or the promise of one

/** Fetches and decodes public/assets/audio/<name>.ogg once; resolves null on failure. */
export function loadSample(name) {
  if (!samples.has(name)) {
    const pending = fetch(`${SAMPLE_BASE}/${name}.ogg`)
      .then((res) => {
        if (!res.ok) throw new Error(`${name}: ${res.status}`);
        return res.arrayBuffer();
      })
      .then((bytes) => audioContext().decodeAudioData(bytes))
      .then((buffer) => {
        samples.set(name, buffer);
        return buffer;
      })
      .catch(() => {
        samples.delete(name); // a later session may try again
        return null;
      });
    samples.set(name, pending);
  }
  return Promise.resolve(samples.get(name));
}

/** The decoded sample, or null while it loads (or if it failed). */
export function sample(name) {
  const entry = samples.get(name);
  return entry && !(entry instanceof Promise) ? entry : null;
}

/**
 * Plays a loaded sample into `dest` (a PositionalAudio input to place it in
 * the hall; the unplaced bus by default). A loop starts at a random point and
 * fades in over `fadeIn` s. Returns { stop, gain } or null if not loaded.
 */
export function playSample(name, { dest = hall(), gain = 1, rate = 1, loop = false, fadeIn = 0 } = {}) {
  const buffer = sample(name);
  if (!buffer) return null;
  const ctx = audioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const level = ctx.createGain();
  level.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : gain, ctx.currentTime);
  if (fadeIn > 0) level.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + fadeIn);
  source.connect(level).connect(dest);
  if (loop) {
    source.loop = true;
    source.loopStart = LOOP_PAD;
    source.loopEnd = buffer.duration - LOOP_PAD;
    source.start(ctx.currentTime, LOOP_PAD + Math.random() * (buffer.duration - 2 * LOOP_PAD));
  } else {
    source.start();
  }
  source.onended = () => level.disconnect();
  return {
    gain: level.gain,
    stop() {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      level.disconnect();
    },
  };
}

/** A short buzz on one controller, where the headset supports it. */
export function pulseController(session, handedness, intensity = 0.6, ms = 60) {
  const source = session?.inputSources && [...session.inputSources].find((s) => s.handedness === handedness);
  const actuator = source?.gamepad?.hapticActuators?.[0];
  actuator?.pulse?.(intensity, ms);
}

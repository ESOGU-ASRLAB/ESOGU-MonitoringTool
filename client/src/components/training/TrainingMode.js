import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR, useXRInputSourceState } from '@react-three/xr';
import * as THREE from 'three';
import { ORIENTATION } from './scenario';
import { playClick, playError, playFanfare, playSuccess, pulseController } from '../vrAudio';

/*
 * STEP-BY-STEP TRAINING, IN THE HEADSET ONLY.
 *
 * Mounted by DigitalTwin while a session runs; the web page never sees it.
 * A guide panel floats to the front-left of the wearer and walks them through
 * a module (scenario.js): walk to a ring on the floor, point at a robot and
 * pull the trigger, answer a question. The hall shows where to go -- a
 * pulsing ring and a column of light, or an arrow bobbing over the robot --
 * and every finished step is marked with a chime, a controller buzz and a
 * burst of sparks.
 *
 * The panel is world-locked but follows lazily: it stays put while the wearer
 * looks around, and glides back to the front-left once they walk more than
 * a couple of metres away or turn well away from it. X on the left controller
 * shows or hides it.
 */

const PANEL_W = 0.64;
const PANEL_H = 0.4;
const CANVAS_W = 1024;
const CANVAS_H = Math.round((CANVAS_W * PANEL_H) / PANEL_W);
const PANEL_DISTANCE = 1.15;
// Radians to the left of the wearer's heading: 40 degrees, far enough that it
// clears a robot panel (RobotInfo.js opens those ahead and a little right).
// At 26 degrees the robot panel, nearer and closed by a click, covered the
// right-hand buttons here, and a ray aimed at them would have hit it instead.
const PANEL_ANGLE = 0.7;
const PANEL_DROP = 0.25; // below eye height
const REFOLLOW_DISTANCE = 2.2;
const REFOLLOW_ANGLE = 1.15; // ~65 degrees
const BUTTON_H = 0.065;
const FONT = '"Segoe UI", Arial, sans-serif';

const scratch = {
  head: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
  box: new THREE.Box3(),
  center: new THREE.Vector3(),
};

function headPose(gl, camera) {
  const head = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
  head.getWorldPosition(scratch.head);
  head.getWorldQuaternion(scratch.quat);
  scratch.euler.setFromQuaternion(scratch.quat, 'YXZ');
  return { position: scratch.head, yaw: scratch.euler.y };
}

function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

function useCanvasTexture(width, height) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { canvas, texture };
  }, [width, height]);
}

/* ------------------------------ panel body ------------------------------ */

function paintPanel(canvas, view) {
  const ctx = canvas.getContext('2d');
  const pad = 52;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
  ctx.beginPath();
  ctx.roundRect(6, 6, CANVAS_W - 12, CANVAS_H - 12, 34);
  ctx.fill();
  // The MATISSE line along the top.
  const line = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
  line.addColorStop(0, '#2060cd');
  line.addColorStop(1, '#19a7ce');
  ctx.fillStyle = line;
  ctx.fillRect(6, 6, CANVAS_W - 12, 10);

  let y = pad + 26;
  ctx.fillStyle = '#64748b';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(view.kicker.toUpperCase(), pad, y);
  if (view.progress != null) {
    // A progress bar under the kicker.
    const barY = y + 16;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(pad, barY, CANVAS_W - pad * 2, 8);
    ctx.fillStyle = '#2060cd';
    ctx.fillRect(pad, barY, (CANVAS_W - pad * 2) * view.progress, 8);
    y += 30;
  }
  y += 62;
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 50px ${FONT}`;
  y = wrap(ctx, view.title, pad, y, CANVAS_W - pad * 2, 58) + 6;
  ctx.fillStyle = '#334155';
  ctx.font = `400 33px ${FONT}`;
  y = wrap(ctx, view.text, pad, y, CANVAS_W - pad * 2, 44);

  if (view.feedback) {
    const ok = view.feedback.ok;
    ctx.fillStyle = ok ? '#dcfce7' : '#fee2e2';
    const boxY = y - 26;
    ctx.beginPath();
    ctx.roundRect(pad, boxY, CANVAS_W - pad * 2, 96, 16);
    ctx.fill();
    ctx.fillStyle = ok ? '#15803d' : '#b91c1c';
    ctx.font = `600 30px ${FONT}`;
    wrap(ctx, view.feedback.text, pad + 22, boxY + 40, CANVAS_W - pad * 2 - 44, 38);
  }

  if (view.hint) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `400 24px ${FONT}`;
    ctx.fillText(view.hint, pad, CANVAS_H - 150);
  }
}

function PanelButton({ label, x, width, tone = 'primary', onPress }) {
  const { canvas, texture } = useCanvasTexture(Math.round(width * 1600), Math.round(BUTTON_H * 1600));
  const [hover, setHover] = useState(false);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const palette = {
      primary: ['#2060cd', '#1b4fb0', '#ffffff'],
      quiet: ['#eef2f7', '#e2e8f0', '#0f172a'],
      right: ['#16a34a', '#15803d', '#ffffff'],
      wrong: ['#fee2e2', '#fecaca', '#b91c1c'],
    }[tone];
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = hover ? palette[1] : palette[0];
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, h / 2);
    ctx.fill();
    ctx.fillStyle = palette[2];
    ctx.font = `600 ${Math.round(h * 0.42)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, w / 2, h / 2 + 2);
    texture.needsUpdate = true;
  }, [canvas, texture, label, tone, hover]);

  return (
    <mesh
      position={[x, -PANEL_H / 2 + BUTTON_H / 2 + 0.035, 0.004]}
      onClick={(event) => {
        event.stopPropagation();
        playClick();
        onPress();
      }}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
    >
      <planeGeometry args={[width, BUTTON_H]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

/* ------------------------------- effects -------------------------------- */

function GotoMarker({ target }) {
  const ringRef = useRef(null);
  const chevronRef = useRef(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      const s = 1 + 0.08 * Math.sin(t * 3);
      ringRef.current.scale.set(s, s, 1);
      ringRef.current.material.opacity = 0.55 + 0.35 * Math.sin(t * 3);
    }
    if (chevronRef.current) {
      chevronRef.current.position.y = 2.3 + 0.15 * Math.sin(t * 2.2);
      chevronRef.current.rotation.y = t * 1.2;
    }
  });
  return (
    <group position={[target.x, 0, target.z]}>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[target.radius * 0.82, target.radius, 64]} />
        <meshBasicMaterial color="#19a7ce" transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh position-y={1.6}>
        <cylinderGeometry args={[0.07, 0.07, 3.2, 16, 1, true]} />
        <meshBasicMaterial color="#4f8fff" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={chevronRef} rotation-x={Math.PI}>
        <coneGeometry args={[0.18, 0.34, 4]} />
        <meshBasicMaterial color="#2060cd" />
      </mesh>
    </group>
  );
}

function RobotArrow({ resolve }) {
  const scene = useThree((state) => state.scene);
  const arrowRef = useRef(null);
  const anchor = useRef({ found: null, since: 1, x: 0, top: 2, z: 0 });
  useFrame(({ clock }, delta) => {
    const a = anchor.current;
    a.since += delta;
    if (a.since > 0.25) {
      a.since = 0;
      if (!a.found?.parent) a.found = resolve(scene);
      if (a.found) {
        scratch.box.setFromObject(a.found);
        scratch.box.getCenter(scratch.center);
        a.x = scratch.center.x;
        a.z = scratch.center.z;
        a.top = scratch.box.max.y;
      }
    }
    const arrow = arrowRef.current;
    if (!arrow) return;
    arrow.visible = Boolean(a.found);
    arrow.position.set(a.x, a.top + 0.45 + 0.12 * Math.sin(clock.getElapsedTime() * 3), a.z);
  });
  return (
    <mesh ref={arrowRef} rotation-x={Math.PI} visible={false}>
      <coneGeometry args={[0.16, 0.36, 24]} />
      <meshBasicMaterial color="#f59e0b" />
    </mesh>
  );
}

const BURST_COUNT = 90;
const BURST_LIFE_S = 1.3;
const BURST_COLORS = ['#2060cd', '#19a7ce', '#22c55e', '#f59e0b'].map((c) => new THREE.Color(c));

/** Sparks thrown up from a point: `fire(x, y, z)`. */
function useBurst() {
  const points = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_COUNT * 3), 3));
    const colors = new Float32Array(BURST_COUNT * 3);
    for (let i = 0; i < BURST_COUNT; i += 1) BURST_COLORS[i % BURST_COLORS.length].toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, depthWrite: false });
    const p = new THREE.Points(geometry, material);
    p.frustumCulled = false;
    p.visible = false;
    return p;
  }, []);
  const state = useRef({ age: BURST_LIFE_S, velocities: new Float32Array(BURST_COUNT * 3) });

  const fire = useCallback((x, y, z) => {
    const pos = points.geometry.getAttribute('position');
    const v = state.current.velocities;
    for (let i = 0; i < BURST_COUNT; i += 1) {
      pos.setXYZ(i, x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const out = 0.6 + Math.random() * 1.6;
      v[i * 3] = Math.cos(angle) * out;
      v[i * 3 + 1] = 2 + Math.random() * 3;
      v[i * 3 + 2] = Math.sin(angle) * out;
    }
    pos.needsUpdate = true;
    state.current.age = 0;
    points.visible = true;
  }, [points]);

  useFrame((_, delta) => {
    const s = state.current;
    if (s.age >= BURST_LIFE_S) return;
    s.age += delta;
    const pos = points.geometry.getAttribute('position');
    for (let i = 0; i < BURST_COUNT; i += 1) {
      s.velocities[i * 3 + 1] -= 6 * delta;
      pos.setXYZ(
        i,
        pos.getX(i) + s.velocities[i * 3] * delta,
        pos.getY(i) + s.velocities[i * 3 + 1] * delta,
        pos.getZ(i) + s.velocities[i * 3 + 2] * delta,
      );
    }
    pos.needsUpdate = true;
    points.material.opacity = Math.max(0, 1 - s.age / BURST_LIFE_S);
    if (s.age >= BURST_LIFE_S) points.visible = false;
  });

  return { points, fire };
}

/* ------------------------------- the mode -------------------------------- */

export default function TrainingMode({ targets, robotPick }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const session = useXR((state) => state.session);
  const left = useXRInputSourceState('controller', 'left');
  const module = ORIENTATION;

  // 'menu' before starting, 'running' through the steps.
  const [phase, setPhase] = useState('menu');
  const [visible, setVisible] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const stats = useRef({ startedAt: 0, finishedAt: 0, quizzes: 0, firstTry: 0, missed: new Set() });
  const step = phase === 'running' ? module.steps[stepIndex] : null;

  const groupRef = useRef(null);
  const follow = useRef({ placed: false, moving: false });
  const { canvas, texture } = useCanvasTexture(CANVAS_W, CANVAS_H);
  useEffect(() => () => texture.dispose(), [texture]);
  const burst = useBurst();

  const buzz = useCallback((intensity = 0.7, ms = 80) => {
    pulseController(session, 'left', intensity, ms);
    pulseController(session, 'right', intensity, ms);
  }, [session]);

  const nextStep = useCallback(() => {
    setFeedback(null);
    setStepIndex((i) => {
      const next = i + 1;
      if (module.steps[next]?.kind === 'outro') {
        stats.current.finishedAt = performance.now();
        playFanfare();
      }
      return Math.min(next, module.steps.length - 1);
    });
    follow.current.moving = true; // bring the panel back for the new step
  }, [module]);

  // A goto check runs every frame, and the step only changes on the next
  // render: without this a ring could be "completed" two or three times over.
  const completedStep = useRef(-1);
  const completeStep = useCallback((at) => {
    if (completedStep.current === stepIndex) return;
    completedStep.current = stepIndex;
    playSuccess();
    buzz();
    if (at) burst.fire(at.x, at.y, at.z);
    nextStep();
  }, [stepIndex, buzz, burst, nextStep]);

  const start = useCallback(() => {
    completedStep.current = -1;
    stats.current = { startedAt: performance.now(), finishedAt: 0, quizzes: 0, firstTry: 0, missed: new Set() };
    setFeedback(null);
    setStepIndex(0);
    setPhase('running');
    setVisible(true);
  }, []);

  // X on the left controller shows or hides the panel.
  const xWasDown = useRef(false);
  useFrame(() => {
    const down = left?.gamepad?.['x-button']?.state === 'pressed';
    if (down && !xWasDown.current) {
      setVisible((v) => !v);
      follow.current.moving = true;
      playClick();
    }
    xWasDown.current = down;
  });

  // Select steps finish on a pick of an accepted robot, even one already open.
  useEffect(() => {
    if (!robotPick || step?.kind !== 'select' || !step.robots.includes(robotPick.id)) return;
    const target = targets.find((t) => t.id === robotPick.id)?.resolve(scene);
    let at = null;
    if (target) {
      scratch.box.setFromObject(target).getCenter(scratch.center);
      at = { x: scratch.center.x, y: scratch.box.max.y, z: scratch.center.z };
    }
    completeStep(at);
    // Only a new pick counts; the step changing must not re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robotPick]);

  // Goto steps finish when the head is inside the ring; the panel follows.
  useFrame((_, delta) => {
    const { position: h, yaw } = headPose(gl, camera);
    if (step?.kind === 'goto') {
      const { x, z, radius } = step.target;
      if (Math.hypot(h.x - x, h.z - z) <= radius) completeStep({ x, y: 0.1, z });
    }

    const group = groupRef.current;
    if (!group) return;
    const want = yaw + PANEL_ANGLE;
    const tx = h.x - Math.sin(want) * PANEL_DISTANCE;
    const ty = h.y - PANEL_DROP;
    const tz = h.z - Math.cos(want) * PANEL_DISTANCE;
    const f = follow.current;
    if (!f.placed) {
      group.position.set(tx, ty, tz);
      f.placed = true;
    } else {
      const dx = group.position.x - h.x;
      const dz = group.position.z - h.z;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(-dx, -dz) - yaw), Math.cos(Math.atan2(-dx, -dz) - yaw)));
      if (Math.hypot(dx, dz) > REFOLLOW_DISTANCE || off > REFOLLOW_ANGLE) f.moving = true;
      if (f.moving) {
        const k = 1 - Math.exp(-delta * 4);
        group.position.x += (tx - group.position.x) * k;
        group.position.y += (ty - group.position.y) * k;
        group.position.z += (tz - group.position.z) * k;
        if (Math.hypot(tx - group.position.x, ty - group.position.y, tz - group.position.z) < 0.03) f.moving = false;
      }
    }
    // Always turned to face the wearer.
    group.rotation.set(0, Math.atan2(h.x - group.position.x, h.z - group.position.z), 0);
  });

  // What the panel says.
  const view = useMemo(() => {
    if (phase === 'menu') {
      return {
        kicker: 'VR training',
        title: module.title,
        text: 'Learn the hall step by step: where the cells are, what each robot does and how to stay safe. Takes about five minutes.',
        hint: 'Trigger: press a button or a robot · Right stick forward: teleport · X: hide this panel',
      };
    }
    const count = module.steps.length;
    const base = { kicker: `Training · step ${stepIndex + 1} of ${count}`, progress: stepIndex / (count - 1), title: step.title };
    if (step.kind === 'quiz') return { ...base, text: step.question, feedback };
    if (step.kind === 'outro') {
      const s = stats.current;
      const seconds = Math.round(((s.finishedAt || performance.now()) - s.startedAt) / 1000);
      const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      return { ...base, progress: 1, text: `${step.text} Time ${time} · questions right first time: ${s.firstTry} of ${s.quizzes}.` };
    }
    return { ...base, text: step.text };
  }, [phase, module, step, stepIndex, feedback]);

  useEffect(() => {
    paintPanel(canvas, view);
    texture.needsUpdate = true;
  }, [canvas, texture, view]);

  const answer = useCallback((index) => {
    const s = stats.current;
    const key = stepIndex;
    if (!s.missed.has(key) && !feedback?.counted) s.quizzes += 1;
    if (index === step.answer) {
      if (!s.missed.has(key)) s.firstTry += 1;
      setFeedback({ ok: true, text: `Right. ${step.explain}`, counted: true });
      completedStep.current = stepIndex;
      playSuccess();
      buzz();
      const g = groupRef.current;
      if (g) burst.fire(g.position.x, g.position.y + PANEL_H / 2, g.position.z);
      setTimeout(nextStep, 2200);
    } else {
      s.missed.add(key);
      setFeedback({ ok: false, text: 'Not quite -- have another go.', counted: true, wrong: index });
      playError();
      pulseController(session, 'right', 1, 150);
    }
  }, [stepIndex, step, feedback, buzz, burst, nextStep, session]);

  // Buttons for the current view.
  let buttons = [];
  if (phase === 'menu') {
    buttons = [
      { label: 'Start training', onPress: start },
      { label: 'Free walk', tone: 'quiet', onPress: () => setVisible(false) },
    ];
  } else if (step.kind === 'intro') {
    buttons = [{ label: step.button || 'Next', onPress: nextStep }];
  } else if (step.kind === 'quiz') {
    buttons = step.options.map((label, i) => ({
      label,
      tone: feedback?.ok && i === step.answer ? 'right' : feedback?.wrong === i ? 'wrong' : 'quiet',
      onPress: () => { if (!feedback?.ok) answer(i); },
    }));
  } else if (step.kind === 'outro') {
    buttons = [
      { label: 'Start again', onPress: start },
      { label: 'Free walk', tone: 'quiet', onPress: () => { setPhase('menu'); setVisible(false); } },
    ];
  } else {
    buttons = [{ label: 'Skip step', tone: 'quiet', onPress: nextStep }];
  }
  const gap = 0.02;
  const width = Math.min(0.26, (PANEL_W - 0.08 - gap * (buttons.length - 1)) / buttons.length);
  const rowWidth = width * buttons.length + gap * (buttons.length - 1);

  const selectTarget = step?.kind === 'select' ? targets.filter((t) => step.robots.includes(t.id)) : [];

  return (
    <>
      <group ref={groupRef} visible={visible}>
        <mesh>
          <planeGeometry args={[PANEL_W, PANEL_H]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
        {visible && buttons.map((b, i) => (
          <PanelButton
            key={`${phase}-${stepIndex}-${b.label}`}
            label={b.label}
            tone={b.tone}
            width={width}
            x={-rowWidth / 2 + width / 2 + i * (width + gap)}
            onPress={b.onPress}
          />
        ))}
      </group>
      {step?.kind === 'goto' && <GotoMarker target={step.target} />}
      {selectTarget.map((t) => <RobotArrow key={t.id} resolve={t.resolve} />)}
      <primitive object={burst.points} />
    </>
  );
}

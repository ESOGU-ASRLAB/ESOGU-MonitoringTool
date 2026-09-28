import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { snapshotInfo } from './robotDetails';
import './RobotInfo.css';

/*
 * CLICK A ROBOT, READ ABOUT IT -- on the desktop and in the headset.
 *
 * THE CLICK TARGETS ARE BOXES, NOT THE ROBOTS. A pointer listener on a robot's
 * group makes every triangle under it a ray target -- per pointer, per frame in
 * a headset, where the controller rays are cast continuously -- and the two
 * cells are hundreds of thousands of triangles. So each robot gets an invisible
 * box that follows its moving part (refreshed 5 times a second from the
 * meshes' cached bounds), and only the boxes listen. Choosing one outlines it,
 * and so does hovering with a mouse -- not with a controller ray, which sweeps
 * across the metres-tall gantry boxes all the time: outlines flashing on and
 * off with every hand movement read as the headset view flickering.
 *
 * The panel is HTML on the desktop and a painted canvas in the headset, where
 * no DOM is drawn; both redraw 4 times a second from the same snapshot
 * (robotInfo.js).
 */

const REFRESH_MS = 250;
const BOX_REFRESH_S = 0.2;
const BOX_PAD_M = 0.08;
// Pixels the pointer may travel between press and release and still count as
// a click: a drag orbits the view and must not pick whatever it ends on.
const CLICK_SLOP_PX = 6;
const UNIT_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
const noRaycast = () => null;

function HitBox({ id, resolve, selected, onSelect }) {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const meshRef = useRef(null);
  const edgesRef = useRef(null);
  const targetRef = useRef(null);
  const since = useRef(BOX_REFRESH_S);
  const [hovered, setHovered] = useState(false);
  const scratch = useMemo(() => ({ box: new THREE.Box3(), size: new THREE.Vector3(), center: new THREE.Vector3() }), []);

  useFrame((_, delta) => {
    since.current += delta;
    if (since.current < BOX_REFRESH_S) return;
    since.current = 0;
    // The Otokar parts mount late (Suspense) and can be remounted on a tier
    // switch, so look again whenever the cached object has left the scene.
    if (!targetRef.current?.parent) targetRef.current = resolve(scene);
    const target = targetRef.current;
    const mesh = meshRef.current;
    if (!target || !mesh) return;
    const { box, size, center } = scratch;
    box.setFromObject(target);
    if (box.isEmpty()) return;
    box.getSize(size).addScalar(BOX_PAD_M * 2);
    box.getCenter(center);
    mesh.position.copy(center);
    mesh.scale.copy(size);
    edgesRef.current.position.copy(center);
    edgesRef.current.scale.copy(size);
  });

  useEffect(() => () => {
    document.body.style.cursor = '';
  }, []);

  return (
    <>
      <mesh
        ref={meshRef}
        visible={false}
        scale={0.0001}
        onClick={(event) => {
          // A mouse click reports how far it dragged; an XR ray's event THROWS
          // on reading `delta` ("not supported"), which silently broke picking
          // in the headset. A ray has no drag to discount anyway.
          let dragged = 0;
          try {
            dragged = event.delta ?? 0;
          } catch {
            dragged = 0;
          }
          if (dragged > CLICK_SLOP_PX) return;
          event.stopPropagation();
          onSelect(id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          if (gl.xr.isPresenting) return;
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry />
      </mesh>
      <lineSegments ref={edgesRef} geometry={UNIT_EDGES} visible={hovered || selected} raycast={noRaycast}>
        <lineBasicMaterial color={selected ? '#2060cd' : '#94a3b8'} />
      </lineSegments>
    </>
  );
}

/** Invisible click targets that follow each robot. `targets`: [{ id, resolve(scene) }]. */
export function RobotHitBoxes({ targets, selected, onSelect }) {
  return targets.map((target) => (
    <HitBox key={target.id} {...target} selected={selected === target.id} onSelect={onSelect} />
  ));
}

// Reads the latest drive context without restarting the refresh timer on every change.
function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/* ---------------- Desktop: an HTML card over the viewport ---------------- */

export function RobotInfoCard({ robotId, context, onClose }) {
  const contextRef = useLatest(context);
  const [info, setInfo] = useState(() => snapshotInfo(robotId, context));

  useEffect(() => {
    const tick = () => setInfo(snapshotInfo(robotId, contextRef.current));
    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => clearInterval(id);
  }, [robotId, contextRef]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="robot-info" aria-label={`${info.name} details`}>
      <header className="robot-info-head">
        <div>
          <p className="robot-info-maker">{info.maker}</p>
          <h2 className="robot-info-name">{info.name}</h2>
          <p className="robot-info-role">{info.role}</p>
        </div>
        <button type="button" className="robot-info-close" onClick={onClose} aria-label="Close details">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="robot-info-status">
        <span className="robot-info-mode" data-tone={info.mode.tone}>
          <span className="robot-info-mode-dot" aria-hidden="true" />
          {info.mode.label}
        </span>
        {info.taskLines.map((line) => <p key={line}>{line}</p>)}
      </div>

      <section>
        <h3 className="robot-info-label">Live values</h3>
        <dl className="robot-info-grid">
          {info.axisRows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="robot-info-label">Specifications</h3>
        <dl className="robot-info-specs">
          {info.specRows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      </section>

      <p className="robot-info-desc">{info.description}</p>
      <a className="robot-info-docs" href={info.docs} target="_blank" rel="noopener noreferrer">
        Full details in the documentation
      </a>
    </aside>
  );
}

/* ---------------- Headset: the same content painted on a panel ---------------- */

const PANEL_W_M = 0.8;
const CANVAS_W = 1024;
const CANVAS_H = 1280;
const PANEL_DISTANCE_M = 1.1;
const TONES = { live: '#15803d', demo: '#2060cd', manual: '#64748b' };

// Word-wraps `text` into `maxWidth`; returns the y after the last line.
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
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

function paintPanel(canvas, info) {
  const ctx = canvas.getContext('2d');
  const pad = 56;
  const inner = CANVAS_W - pad * 2;
  const font = '"Segoe UI", Arial, sans-serif';
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(8, 8, CANVAS_W - 16, CANVAS_H - 16, 36);
  ctx.fill();
  ctx.fillStyle = '#2060cd';
  ctx.fillRect(8, 8, CANVAS_W - 16, 12);
  ctx.textBaseline = 'alphabetic';

  let y = pad + 40;
  ctx.fillStyle = '#64748b';
  ctx.font = `600 28px ${font}`;
  ctx.fillText(info.maker.toUpperCase(), pad, y);
  y += 72;
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 64px ${font}`;
  ctx.fillText(info.name, pad, y);
  y += 50;
  ctx.fillStyle = '#334155';
  ctx.font = `400 32px ${font}`;
  y = wrapText(ctx, info.role, pad, y, inner, 42) + 16;

  // Mode chip, then the task lines.
  const tone = TONES[info.mode.tone];
  ctx.font = `600 30px ${font}`;
  const chipW = ctx.measureText(info.mode.label).width + 84;
  ctx.fillStyle = `${tone}1f`;
  ctx.beginPath();
  ctx.roundRect(pad, y - 40, chipW, 56, 28);
  ctx.fill();
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(pad + 32, y - 12, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillText(info.mode.label, pad + 54, y);
  y += 56;
  ctx.fillStyle = '#0f172a';
  ctx.font = `400 30px ${font}`;
  for (const line of info.taskLines) {
    ctx.fillText(line, pad, y);
    y += 42;
  }

  const section = (title) => {
    y += 22;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(pad, y - 30, inner, 2);
    ctx.fillStyle = '#64748b';
    ctx.font = `600 24px ${font}`;
    ctx.fillText(title.toUpperCase(), pad, y + 8);
    y += 50;
  };

  section('Live values');
  ctx.font = `400 30px ${font}`;
  for (const [label, value] of info.axisRows) {
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText(label, pad, y);
    ctx.fillStyle = '#0f172a';
    ctx.font = `600 30px ${font}`;
    ctx.textAlign = 'right';
    ctx.fillText(value, CANVAS_W - pad, y);
    ctx.font = `400 30px ${font}`;
    y += 42;
  }
  ctx.textAlign = 'left';

  section('Specifications');
  for (const [label, value] of info.specRows) {
    ctx.fillStyle = '#64748b';
    ctx.font = `600 26px ${font}`;
    ctx.fillText(label, pad, y);
    y += 36;
    ctx.fillStyle = '#0f172a';
    ctx.font = `400 28px ${font}`;
    y = wrapText(ctx, value, pad, y, inner, 36) + 6;
  }

  y += 8;
  ctx.fillStyle = '#334155';
  ctx.font = `400 28px ${font}`;
  wrapText(ctx, info.description, pad, y, inner, 38);

  ctx.fillStyle = '#64748b';
  ctx.font = `600 26px ${font}`;
  ctx.textAlign = 'center';
  ctx.fillText('Point here and pull the trigger to close', CANVAS_W / 2, CANVAS_H - 44);
  ctx.textAlign = 'left';
}

const placement = { head: new THREE.Vector3(), quat: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ') };

export function RobotInfoPanel3D({ robotId, context, onClose }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const groupRef = useRef(null);
  const placeRef = useRef(true);
  const contextRef = useLatest(context);
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = CANVAS_W;
    c.height = CANVAS_H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return { canvas: c, texture: t };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  /*
   * Opens in front of the wearer, level, facing them -- world-locked there, so
   * it can be walked up to or away from; choosing another robot moves it back.
   *
   * Placed on the next frame, from the XR camera: in the React effect that
   * mounts it, the scene camera had not yet taken the headset pose (measured in
   * the emulator: right x/z, but height 0), which put the panel at the floor.
   */
  useEffect(() => {
    placeRef.current = true;
  }, [robotId]);

  useFrame(() => {
    const group = groupRef.current;
    if (!placeRef.current || !group) return;
    placeRef.current = false;
    const head = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
    head.getWorldPosition(placement.head);
    head.getWorldQuaternion(placement.quat);
    placement.euler.setFromQuaternion(placement.quat, 'YXZ');
    const yaw = placement.euler.y;
    group.position.set(
      placement.head.x - Math.sin(yaw) * PANEL_DISTANCE_M,
      placement.head.y - 0.15,
      placement.head.z - Math.cos(yaw) * PANEL_DISTANCE_M,
    );
    group.rotation.set(0, yaw, 0);
  });

  useEffect(() => {
    const paint = () => {
      paintPanel(canvas, snapshotInfo(robotId, contextRef.current));
      texture.needsUpdate = true;
    };
    paint();
    const id = setInterval(paint, REFRESH_MS);
    return () => clearInterval(id);
  }, [robotId, canvas, texture, contextRef]);

  return (
    <group ref={groupRef}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <planeGeometry args={[PANEL_W_M, (PANEL_W_M * CANVAS_H) / CANVAS_W]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

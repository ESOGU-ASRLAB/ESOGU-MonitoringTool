import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import { GUIDE_DETAILS, chooseDetailShot, chooseGuideShot, guideCeiling, guideOccluders, guideSubject, measureGuideSubject } from './guideShots';
import { GUIDE_UI } from './guideLanguage';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FADE = .16;
const DETAIL_WAIT = 1.2;

export function placeGuideViewer(origin, camera, eye, target) {
  const head = camera.getWorldPosition(new THREE.Vector3());
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const destination = new THREE.Vector3(...eye);
  const yaw = Math.atan2(eye[0] - target[0], eye[2] - target[2]) - Math.atan2(-direction.x, -direction.z);
  // Turn around the wearer's tracked head, then translate the room origin.
  const offset = head.sub(origin.position).applyAxisAngle(WORLD_UP, yaw);
  origin.rotation.y += yaw;
  origin.position.copy(destination.sub(offset));
  origin.updateMatrixWorld(true);
}

function headsetPose(scene, shot, eye) {
  const detail = GUIDE_DETAILS[shot];
  if (!detail) {
    const pose = chooseGuideShot(shot, 1.35, eye.toArray(), .18);
    // The headset keeps its tracked pitch, so use a lower establishing view.
    pose.eye[1] = Math.min(pose.eye[1], pose.target[1] + 1.8);
    // Keep the finish at walking height so locomotion resumes naturally.
    if (shot === 'tourEnd') pose.eye[1] = 1.65;
    return pose;
  }
  const subject = guideSubject(scene, shot);
  const box = subject && measureGuideSubject(subject);
  if (!box) return null;
  const pose = chooseDetailShot(box, 1.35, .18, guideOccluders(scene, shot, subject), null, detail.directions);
  const target = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(...pose.eye).sub(target);
  offset.setY(0).setLength(Math.max(1.15, offset.length()));
  const position = target.clone().add(offset);
  position.x = THREE.MathUtils.clamp(position.x, -15, 15);
  position.z = THREE.MathUtils.clamp(position.z, -23, 23);
  // Keep the chosen clear angle while limiting the vertical look needed in VR.
  position.y = THREE.MathUtils.clamp(pose.eye[1], Math.max(.95, target.y - .4), Math.min(target.y + .55, guideCeiling(position.x)));
  return { eye: position.toArray(), target: target.toArray() };
}

function wrapped(ctx, text, x, y, width) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > width) {
      ctx.fillText(line, x, y);
      y += 45;
      line = word;
    } else line = next;
  }
  ctx.fillText(line, x, y);
}

function Card({ width, height, color, title, subtitle, onClick }) {
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 300;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas, texture };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useEffect(() => {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1024, 300);
    ctx.fillStyle = '#fff';
    ctx.textAlign = subtitle ? 'left' : 'center';
    ctx.font = subtitle ? '600 47px system-ui' : '600 95px system-ui';
    if (subtitle) {
      ctx.fillText(title, 34, 64, 956);
      ctx.fillStyle = '#dae6fa';
      ctx.font = '42px system-ui';
      wrapped(ctx, subtitle, 34, 133, 956);
    } else ctx.fillText(title, 512, 186, 924);
    texture.needsUpdate = true;
  }, [canvas, texture, color, title, subtitle]);
  return <mesh renderOrder={990} pointerEventsOrder={10} onClick={onClick && ((event) => { event.stopPropagation(); onClick(); })}>
    <planeGeometry args={[width, height]} />
    <meshBasicMaterial map={texture} depthWrite={false} depthTest={false} toneMapped={false} />
  </mesh>;
}

export default function VRGuide({ guide, originRef }) {
  const { camera, scene } = useThree();
  const xrSession = useXR((state) => state.session);
  const fade = useRef(null);
  const hud = useRef(null);
  const transition = useRef(null);
  const walkingHeight = useRef(null);
  const { request, active, session, narration, cameraReady, pause, start } = guide;
  const language = guide.settings.language;
  const ui = GUIDE_UI[language];
  const scratch = useMemo(() => ({ head: new THREE.Vector3(), rotation: new THREE.Quaternion(), offset: new THREE.Vector3() }), []);
  useEffect(() => {
    transition.current = request ? { elapsed: 0, waited: 0, pose: null, moved: false, ended: false } : null;
    if (fade.current) fade.current.material.opacity = 0;
  }, [request]);
  useEffect(() => {
    if (active) walkingHeight.current = originRef.current?.position.y;
    else if (walkingHeight.current != null && originRef.current) {
      originRef.current.position.y = walkingHeight.current;
      walkingHeight.current = null;
    }
  }, [active, originRef]);
  useEffect(() => {
    if (!xrSession) return undefined;
    const onVisibility = () => {
      if (xrSession.visibilityState === 'hidden' && active && !session?.paused) pause();
    };
    xrSession.addEventListener('visibilitychange', onVisibility);
    return () => xrSession.removeEventListener('visibilitychange', onVisibility);
  }, [xrSession, active, session?.paused, pause]);

  useFrame((_, delta) => {
    const origin = originRef.current;
    if (!xrSession || !origin || !hud.current || !fade.current) return;
    const step = transition.current;
    const veil = fade.current;
    if (step && request && !step.ended && (!session.paused || step.moved)) {
      const tick = Math.min(delta, .05);
      if (!step.pose) {
        const head = camera.getWorldPosition(scratch.head);
        step.pose = headsetPose(scene, request.shot, head);
        step.waited += tick;
        if (!step.pose && step.waited >= DETAIL_WAIT) {
          step.pose = headsetPose(scene, GUIDE_DETAILS[request.shot].context, head);
        }
      }
      if (step.pose) {
        step.elapsed += tick;
        if (!step.moved && step.elapsed >= FADE) {
          const { eye, target } = step.pose;
          if (request.shot === 'tourEnd' && walkingHeight.current != null) {
            eye[1] = camera.getWorldPosition(scratch.head).y - origin.position.y + walkingHeight.current;
          }
          placeGuideViewer(origin, camera, eye, target);
          step.moved = true;
          step.elapsed = FADE;
        }
        veil.material.opacity = step.moved ? Math.max(0, 2 - step.elapsed / FADE) : Math.min(1, step.elapsed / FADE);
        if (step.moved && step.elapsed >= 2 * FADE) {
          step.ended = true;
          guide.arrive(request.serial, request.shot);
        }
      }
    } else if (!step || session?.paused) veil.material.opacity = 0;
    camera.getWorldPosition(scratch.head);
    camera.getWorldQuaternion(scratch.rotation);
    veil.position.copy(scratch.head);
    hud.current.position.copy(scratch.head).add(scratch.offset.set(0, session ? -.65 : -.32, -1.5).applyQuaternion(scratch.rotation));
    hud.current.quaternion.copy(scratch.rotation);
  });

  const caption = session?.phase === 'complete' ? ui.vrComplete : !cameraReady ? (session?.paused ? ui.movingPaused : ui.moving) : narration.caption || guide.item?.summary;
  return <>
    <mesh ref={fade} frustumCulled={false} renderOrder={2000} raycast={() => null}>
      <sphereGeometry args={[.22, 16, 12]} />
      <meshBasicMaterial color="#080d16" side={THREE.BackSide} transparent opacity={0} depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
    <group ref={hud} name="vr-guide-controls">
      {session ? <>
        <Card width={1.08} height={.316} color="#17315a" title={guide.item.title} subtitle={caption} />
        <group position={[-.29, -.245, 0]}>
          <Card width={.46} height={.135} color="#2059bb" title={session.phase === 'complete' ? ui.replay : session.paused ? ui.resume : ui.pause} onClick={session.phase === 'complete' ? start : pause} />
        </group>
        <group position={[.29, -.245, 0]}>
          <Card width={.46} height={.135} color="#344b6b" title={language === 'tr' ? 'Kapat' : 'Close'} onClick={guide.stop} />
        </group>
      </> : <Card width={.62} height={.18} color="#2059bb" title={ui.autoTour} onClick={start} />}
    </group>
  </>;
}

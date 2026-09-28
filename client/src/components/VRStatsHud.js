import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';

/*
 * FRAME RATE, READ IN THE HEADSET.
 *
 * Testing on a Quest otherwise means sideloading Meta's metrics overlay onto
 * every test device. This is a small card below and left of the line of sight
 * that trails the head (a head-locked card is uncomfortable to read), showing
 * the frame rate against the display's, the worst frame of the last half
 * second, and draw calls. Only mounted when VR_OPTIONS.stats is on.
 */
const W = 256;
const H = 96;
const UPDATE_S = 0.5;
const FOLLOW = 6; // 1/s, how quickly the card catches up with the head

export default function VRStatsHud() {
  const session = useXR((state) => state.session);
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const groupRef = useRef(null);

  const { canvas, texture } = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, texture: t };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const stats = useRef({ frames: 0, elapsed: 0, worst: 0 });
  const scratch = useMemo(() => ({
    head: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    target: new THREE.Vector3(),
    offset: new THREE.Vector3(),
  }), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!session || !group) return;

    const s = stats.current;
    s.frames += 1;
    s.elapsed += delta;
    s.worst = Math.max(s.worst, delta);
    if (s.elapsed >= UPDATE_S) {
      const fps = s.frames / s.elapsed;
      const target = session.frameRate || 72;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = fps >= target * 0.95 ? '#4ade80' : fps >= target * 0.8 ? '#facc15' : '#f87171';
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillText(`${fps.toFixed(0)} fps`, 14, 46);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(`/ ${target} Hz`, 170, 46);
      ctx.fillText(`worst ${(s.worst * 1000).toFixed(0)} ms · ${gl.info.render.calls} draws`, 14, 80);
      texture.needsUpdate = true;
      s.frames = 0;
      s.elapsed = 0;
      s.worst = 0;
    }

    camera.getWorldPosition(scratch.head);
    camera.getWorldQuaternion(scratch.quat);
    scratch.offset.set(-0.22, -0.28, -0.9).applyQuaternion(scratch.quat);
    scratch.target.copy(scratch.head).add(scratch.offset);
    const k = 1 - Math.exp(-FOLLOW * delta);
    group.position.lerp(scratch.target, k);
    group.lookAt(scratch.head);
  });

  if (!session) return null;

  return (
    <group ref={groupRef}>
      <mesh renderOrder={1000}>
        <planeGeometry args={[0.24, 0.09]} />
        <meshBasicMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

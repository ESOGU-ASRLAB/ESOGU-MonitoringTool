import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { trackHeads } from './otokarHeads';

/*
 * LIVE CAMERA FEEDS FOR THE CONTROL PANEL.
 *
 * Every robot here carries a camera -- the Otokar gantries' inspection heads,
 * the SICK camera on the UR10e's flange, the Kawasaki's wrist -- so each feed
 * is the scene rendered from that robot's own tool, small, into an offscreen
 * target, read back and drawn into the canvas the panel registered for it.
 *
 * Cost is kept down on purpose: one feed is rendered per slot, round-robin,
 * and a slot comes round every few frames, so each feed updates at ~6 fps and
 * the hall is drawn at most once extra per frame, at 160 x 108.
 *
 * The panel is outside the WebGL canvas, so it hands canvases in through
 * registerFeedCanvas and the frame loop here paints them.
 */
export const FEED_W = 160;
export const FEED_H = 108;
const FRAME_INTERVAL = 2; // render one feed every N frames

const canvases = new Map();
export function registerFeedCanvas(key, canvas) {
  if (canvas) canvases.set(key, canvas);
  else canvases.delete(key);
}

// The Otokar body's bounds (see BodyInspection.js): its centre line is what the
// heads look up at.
const BODY_CENTRE_X = (-5.18 + -2.66) / 2;

const UR_TOOL_AXIS = new THREE.Vector3(1, 0, 0);
const KAW_TOOL_AXIS = new THREE.Vector3(0, 0, 1);

export default function RobotCameraFeeds({ ur, kawasaki }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const target = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(FEED_W, FEED_H, { samples: 0 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    return rt;
  }, []);
  const camera = useMemo(() => new THREE.PerspectiveCamera(70, FEED_W / FEED_H, 0.03, 60), []);
  const pixels = useMemo(() => new Uint8Array(FEED_W * FEED_H * 4), []);
  const image = useMemo(() => new ImageData(FEED_W, FEED_H), []);
  const heads = useRef([]);
  const headCache = useRef({});
  const state = useRef({ frame: 0, next: 0 });
  const scratch = useMemo(() => ({ pos: new THREE.Vector3(), dir: new THREE.Vector3(), quat: new THREE.Quaternion() }), []);

  useEffect(() => () => target.dispose(), [target]);

  // Where each robot's camera is and which way it looks, in world space.
  const views = {
    // Just ahead of the fingertips: set back, the view is the inside of the gripper.
    ur10e: () => tool(ur.toolRef.current, UR_TOOL_AXIS, 0.03),
    kawasaki: () => tool(kawasaki.toolRef.current, KAW_TOOL_AXIS, -0.05),
    robot1: () => otokar(0),
    robot2: () => otokar(1),
  };

  function tool(node, axis, setBack) {
    if (!node) return false;
    node.getWorldPosition(scratch.pos);
    node.getWorldQuaternion(scratch.quat);
    scratch.dir.copy(axis).applyQuaternion(scratch.quat);
    camera.position.copy(scratch.pos).addScaledVector(scratch.dir, setBack);
    camera.up.set(0, 1, 0);
    if (Math.abs(scratch.dir.y) > 0.95) camera.up.set(0, 0, -1);
    camera.lookAt(scratch.pos.addScaledVector(scratch.dir, 1));
    return true;
  }

  // Heads sorted low to high: the underbody robot's is below the body.
  function otokar(index) {
    const head = heads.current[index];
    if (!head) return false;
    head.getWorldPosition(scratch.pos);
    camera.position.copy(scratch.pos);
    camera.up.set(0, 0, -1);
    scratch.dir.set((BODY_CENTRE_X - scratch.pos.x) * 0.25, 1, 0).normalize();
    camera.lookAt(scratch.pos.addScaledVector(scratch.dir, 1));
    return true;
  }

  useFrame(({ clock }) => {
    const s = state.current;
    const now = clock.getElapsedTime();
    heads.current = trackHeads(scene, now, headCache.current);

    s.frame += 1;
    if (s.frame % FRAME_INTERVAL) return;
    const keys = [...canvases.keys()];
    if (!keys.length) return;
    const key = keys[s.next % keys.length];
    s.next += 1;
    const aim = views[key];
    if (!aim || !aim()) return;

    camera.updateMatrixWorld();
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    gl.readRenderTargetPixels(target, 0, 0, FEED_W, FEED_H, pixels);
    gl.setRenderTarget(previous);

    // WebGL reads bottom-up; flip into the ImageData row by row.
    const row = FEED_W * 4;
    for (let y = 0; y < FEED_H; y += 1) {
      image.data.set(pixels.subarray((FEED_H - 1 - y) * row, (FEED_H - y) * row), y * row);
    }
    canvases.get(key)?.getContext('2d').putImageData(image, 0, 0);
  });

  return null;
}

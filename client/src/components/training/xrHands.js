import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/*
 * THE WEARER'S HANDS, AS THE TRAINING SEES THEM.
 *
 * Every frame, for each hand: where its grip is in the hall (world space) and
 * whether it is closed. Closed is the grip button OR the trigger on a
 * controller -- people reach for either -- and a pinch with hand tracking.
 *
 * Read straight from the XRFrame against the renderer's reference space and
 * carried into the hall by the XR origin (the camera's parent in a session),
 * so no XRSpace has to live inside VRWalk's origin for this.
 *
 * Each hand: { handedness, tracked, matrix, position, quaternion,
 *              closed, pressed (closed this frame), released (opened this
 *              frame), holding (what the grab code put in it) }.
 */

const CLOSED_AT = 0.5;
const scratchScale = new THREE.Vector3();

export function useXRHands() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const hands = useMemo(() => ['left', 'right'].map((handedness) => ({
    handedness,
    tracked: false,
    matrix: new THREE.Matrix4(),
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    closed: false,
    pressed: false,
    released: false,
    holding: null,
    pinch: false,
  })), []);

  // Hand tracking has no buttons: a pinch is a select.
  useEffect(() => {
    const session = gl.xr.getSession();
    if (!session) return undefined;
    const set = (value) => (event) => {
      if (!event.inputSource.hand) return;
      const hand = hands.find((h) => h.handedness === event.inputSource.handedness);
      if (hand) hand.pinch = value;
    };
    const start = set(true);
    const end = set(false);
    session.addEventListener('selectstart', start);
    session.addEventListener('selectend', end);
    return () => {
      session.removeEventListener('selectstart', start);
      session.removeEventListener('selectend', end);
    };
  }, [gl, hands]);

  useFrame((state, delta, frame) => {
    for (const hand of hands) {
      hand.pressed = false;
      hand.released = false;
      hand.seen = false;
    }
    const session = gl.xr.getSession();
    const reference = gl.xr.getReferenceSpace();
    const origin = camera.parent;
    if (frame && session && reference && origin) {
      origin.updateWorldMatrix(true, false);
      for (const source of session.inputSources) {
        const hand = hands.find((h) => h.handedness === source.handedness);
        const space = source.gripSpace || source.targetRaySpace;
        if (!hand || !space) continue;
        const pose = frame.getPose(space, reference);
        if (!pose) continue;
        hand.seen = true;
        hand.matrix.fromArray(pose.transform.matrix).premultiply(origin.matrixWorld);
        hand.matrix.decompose(hand.position, hand.quaternion, scratchScale);
        const buttons = source.gamepad?.buttons || [];
        const closed = source.hand
          ? hand.pinch
          : (buttons[1]?.value ?? 0) > CLOSED_AT || (buttons[0]?.value ?? 0) > CLOSED_AT;
        hand.pressed = closed && !hand.closed;
        hand.released = !closed && hand.closed;
        hand.closed = closed;
      }
    }
    for (const hand of hands) {
      // A hand that stops being tracked lets go.
      if (!hand.seen && hand.closed) {
        hand.closed = false;
        hand.released = true;
      }
      hand.tracked = hand.seen;
    }
  }, -2);

  return hands;
}

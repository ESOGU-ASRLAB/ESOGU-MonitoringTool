import * as THREE from 'three';

/*
 * PICKING THINGS UP.
 *
 * A grabbable is an Object3D and a few rules. Close a hand (grip or trigger,
 * or a pinch) within reach of one that is enabled and it follows that hand,
 * keeping the hold it was taken with -- a part grabbed by its end stays held
 * by its end. Open the hand and onRelease decides what happens: seat it,
 * send it back.
 *
 * Reach is measured to the object's bounding sphere, plus REACH, so small
 * parts do not need pixel-perfect aim.
 */

const REACH = 0.1;
const box = new THREE.Box3();
const sphere = new THREE.Sphere();
const inverse = new THREE.Matrix4();
const world = new THREE.Matrix4();
const scratchScale = new THREE.Vector3();
const center = new THREE.Vector3();

/**
 * object: what moves. enabled(): whether it may be taken now.
 * onGrab(hand), onRelease(hand): what the station does about it.
 */
export function makeGrabbable(object, { enabled = () => true, onGrab = null, onRelease = null } = {}) {
  object.updateWorldMatrix(true, true);
  box.setFromObject(object);
  box.getBoundingSphere(sphere);
  // The centre in the object's own frame, so it follows the object anywhere.
  const localCenter = object.worldToLocal(sphere.center.clone());
  return {
    object, enabled, onGrab, onRelease, localCenter, radius: sphere.radius, held: null, near: false, offset: new THREE.Matrix4(),
  };
}

/** The item's centre in the hall, into `out`. */
export function grabCenter(item, out) {
  item.object.updateWorldMatrix(true, false);
  return out.copy(item.localCenter).applyMatrix4(item.object.matrixWorld);
}

function reachOf(item, hand) {
  return hand.position.distanceTo(grabCenter(item, center)) - item.radius;
}

/** Once a frame, after the hands (xrHands.js) have been read. */
export function updateGrabs(hands, items) {
  for (const hand of hands) {
    if (hand.pressed && !hand.holding) {
      let best = null;
      let bestReach = REACH;
      for (const item of items) {
        if (!item.enabled()) continue;
        const reach = reachOf(item, hand);
        if (reach <= bestReach) {
          best = item;
          bestReach = reach;
        }
      }
      if (best) {
        if (best.held) best.held.holding = null; // taken from the other hand
        best.held = hand;
        hand.holding = best;
        best.object.updateWorldMatrix(true, false);
        best.offset.copy(hand.matrix).invert().multiply(best.object.matrixWorld);
        best.onGrab?.(hand);
      }
    }

    // Each station runs this over its own items; another's are left alone.
    const item = hand.holding;
    if (!item || !items.includes(item)) continue;
    if (hand.released || !hand.tracked) {
      hand.holding = null;
      item.held = null;
      item.onRelease?.(hand);
      continue;
    }
    // Follow the hand: world = hand * offset, then into the parent's frame.
    const { object } = item;
    world.multiplyMatrices(hand.matrix, item.offset);
    object.parent.updateWorldMatrix(true, false);
    inverse.copy(object.parent.matrixWorld).invert();
    world.premultiply(inverse);
    world.decompose(object.position, object.quaternion, scratchScale);
  }

  // Which free items an open hand is near, for the highlight.
  for (const item of items) {
    item.near = !item.held && item.enabled() && hands.some((hand) => hand.tracked && !hand.holding && reachOf(item, hand) <= REACH);
  }
}

/** Lets go of everything (a station stopping). */
export function releaseAll(hands, items) {
  for (const hand of hands) {
    if (hand.holding && items.includes(hand.holding)) {
      hand.holding.held = null;
      hand.holding = null;
    }
  }
}

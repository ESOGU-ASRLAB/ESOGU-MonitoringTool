import * as THREE from 'three';

/*
 * The Otokar gantries' camera heads ("camera-mount" nodes), found in the live
 * scene. They are looked up again every half second rather than once: the
 * cell swaps its meshes between detail levels as the camera moves, and a head
 * held from before a swap is no longer in the scene -- which is why the scan
 * beams used to be missing for the first seconds of the program. A head
 * counts only if its whole parent chain is attached and visible.
 *
 * Returned lowest first: the underbody robot's head is below the body.
 */
const REFRESH = 0.5;

function attached(object, scene) {
  let node = object;
  while (node) {
    if (!node.visible) return false;
    if (node === scene) return true;
    node = node.parent;
  }
  return false;
}

const scratch = new THREE.Vector3();

export function trackHeads(scene, now, cache) {
  if (now - (cache.at ?? -Infinity) < REFRESH && cache.heads) return cache.heads;
  cache.at = now;
  const found = scene.getObjectsByProperty('name', 'camera-mount').filter((o) => attached(o, scene));
  const height = new Map(found.map((o) => [o, o.getWorldPosition(scratch).y]));
  cache.heads = found.sort((a, b) => height.get(a) - height.get(b)).slice(0, 2);
  return cache.heads;
}

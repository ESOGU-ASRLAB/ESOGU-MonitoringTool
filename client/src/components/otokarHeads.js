

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



export function trackHeads(scene, now, cache) {
  if (now - (cache.at ?? -Infinity) < REFRESH && cache.heads) return cache.heads;
  cache.at = now;
  cache.heads = ['robot1-cad-frame', 'robot2-cad-frame'].map((id) => scene.getObjectByName(id)?.getObjectByName('camera-mount')).map((head) => head && attached(head, scene) ? head : null);
  return cache.heads;
}

import * as THREE from 'three';

/*
 * Two-bone IK for the Mixamo worker rig.
 *
 * The only person model in the hall is a walking figure, so every other pose
 * -- hands on a scrubber handle, sat at a forklift's wheel -- is solved onto
 * its bones each frame: arm/forearm/hand or thigh/shin/foot are bent so the
 * end of the chain lands on a target, with the middle joint (elbow, knee)
 * swung towards a pole point. Run it AFTER the animation mixer has posed the
 * skeleton, so it overrides only the chains it is given.
 */
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const dir = new THREE.Vector3();
const bend = new THREE.Vector3();
const joint = new THREE.Vector3();
const reach = new THREE.Vector3();
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const turn = new THREE.Quaternion();
const world = new THREE.Quaternion();
const parentWorld = new THREE.Quaternion();

// Rotate `bone` so that the point `childWorld` (currently on its chain) swings
// onto `targetWorld`, by the smallest rotation that does it.
function aimBone(bone, childWorld, targetWorld) {
  bone.getWorldPosition(a);
  from.subVectors(childWorld, a).normalize();
  to.subVectors(targetWorld, a).normalize();
  turn.setFromUnitVectors(from, to);
  bone.getWorldQuaternion(world);
  bone.parent.getWorldQuaternion(parentWorld);
  bone.quaternion.copy(parentWorld.invert().multiply(turn.multiply(world)));
  bone.updateMatrixWorld(true);
}

export function solveTwoBone(upper, lower, end, target, pole) {
  upper.getWorldPosition(a);
  lower.getWorldPosition(b);
  end.getWorldPosition(c);
  const l1 = a.distanceTo(b);
  const l2 = b.distanceTo(c);

  dir.subVectors(target, a);
  const d = THREE.MathUtils.clamp(dir.length(), 1e-4, (l1 + l2) * 0.999);
  dir.normalize();

  // Bend direction: towards the pole, square to the reach.
  bend.subVectors(pole, a);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0);
  bend.normalize();

  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(l1 * l1 - along * along, 0));
  joint.copy(a).addScaledVector(dir, along).addScaledVector(bend, out);

  aimBone(upper, b, joint);
  end.getWorldPosition(c);
  reach.copy(a).addScaledVector(dir, d);
  aimBone(lower, c, reach);
}

export function limb(root, side, kind) {
  const names = kind === 'arm' ? ['Arm', 'ForeArm', 'Hand'] : ['UpLeg', 'Leg', 'Foot'];
  return names.map((name) => root.getObjectByName(`mixamorig${side}${name}`));
}

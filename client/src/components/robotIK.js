import * as THREE from 'three';

/*
 * Numerical IK for the IFARLAB arms, working directly on their scene graphs.
 *
 * Neither arm has a closed-form solver in this codebase, and each one's chain
 * is already the truth -- the joint groups, their offsets and their axes as
 * rendered. So the solver asks the chain itself: nudge each joint, see how the
 * tool point and the tool's pointing axis move, and step all joints together
 * by damped least squares towards the target. Solved every frame from the
 * previous frame's pose, a smooth target gives a smooth, configuration-stable
 * motion (no elbow flips).
 *
 * A joint is { object, axis: 'x' | 'y' | 'z', min, max } -- the rotation
 * component the robot sets, and its limits in the same (radian) units.
 */
const EPS = 1e-3;
const toolPos = new THREE.Vector3();
const toolDir = new THREE.Vector3();
const toolQuat = new THREE.Quaternion();
const probePos = new THREE.Vector3();
const probeDir = new THREE.Vector3();

function readTool(tool, localAxis, pos, dir) {
  tool.getWorldPosition(pos);
  tool.getWorldQuaternion(toolQuat);
  dir.copy(localAxis).applyQuaternion(toolQuat);
}

// Solves A x = b for a small dense system (Gaussian elimination, partial pivot).
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / d;
      if (!f) continue;
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/*
 * One solve: move the chain so `tool` sits on `target` (world) with its
 * `localAxis` along `aim` (world, unit). `root` is the chain's first joint,
 * whose parent must already have an up-to-date world matrix.
 */
export function solveIK({
  joints, tool, localAxis, target, aim, iterations = 10, damping = 0.06, aimWeight = 0.35, maxStep = 0.25,
}) {
  const root = joints[0].object;
  root.updateMatrixWorld(true);
  const n = joints.length;
  for (let it = 0; it < iterations; it += 1) {
    readTool(tool, localAxis, toolPos, toolDir);
    const error = [
      target.x - toolPos.x, target.y - toolPos.y, target.z - toolPos.z,
      (aim.x - toolDir.x) * aimWeight, (aim.y - toolDir.y) * aimWeight, (aim.z - toolDir.z) * aimWeight,
    ];
    if (Math.hypot(...error) < 1e-4) break;

    // Jacobian, one column per joint, by finite difference on the real chain.
    const J = [[], [], [], [], [], []];
    for (let j = 0; j < n; j += 1) {
      const { object, axis } = joints[j];
      object.rotation[axis] += EPS;
      object.updateMatrixWorld(true);
      readTool(tool, localAxis, probePos, probeDir);
      object.rotation[axis] -= EPS;
      object.updateMatrixWorld(true);
      J[0][j] = (probePos.x - toolPos.x) / EPS;
      J[1][j] = (probePos.y - toolPos.y) / EPS;
      J[2][j] = (probePos.z - toolPos.z) / EPS;
      J[3][j] = ((probeDir.x - toolDir.x) / EPS) * aimWeight;
      J[4][j] = ((probeDir.y - toolDir.y) / EPS) * aimWeight;
      J[5][j] = ((probeDir.z - toolDir.z) / EPS) * aimWeight;
    }

    // dq = J^T (J J^T + damping^2 I)^-1 e
    const JJt = J.map((ri) => J.map((rk) => ri.reduce((sum, v, c) => sum + v * rk[c], 0)));
    for (let d = 0; d < 6; d += 1) JJt[d][d] += damping * damping;
    const y = solveLinear(JJt, error);
    for (let j = 0; j < n; j += 1) {
      let dq = 0;
      for (let r = 0; r < 6; r += 1) dq += J[r][j] * y[r];
      dq = THREE.MathUtils.clamp(dq, -maxStep, maxStep);
      const joint = joints[j];
      joint.object.rotation[joint.axis] = THREE.MathUtils.clamp(joint.object.rotation[joint.axis] + dq, joint.min, joint.max);
    }
    root.updateMatrixWorld(true);
  }
}

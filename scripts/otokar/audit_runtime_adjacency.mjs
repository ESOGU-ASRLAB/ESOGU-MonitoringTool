// Run the actual OtokarGantryRobot JSX and its useFrame joint transforms in
// Node, substituting each GLB with its measured local bounds. This checks the
// installed home pose, both LOD tiers, and a reversible re-origin experiment.
//
//   node scripts/otokar/audit_runtime_adjacency.mjs
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { MeshBVH } from '../../client/node_modules/three-mesh-bvh/src/index.js';
import { createInspector } from './scene_inspection.mjs';
import { readOtokarGeometry } from './glb_geometry.mjs';

const POSES = {
  robot1: [4500, 1200, 600, 0, 0],
  robot2: [11500, 1200, 600, 0, 0],
};
const PAIRS = [
  ['axis1', 'axis1_carriage'],
  ['axis1_carriage', 'axis2'],
  ['axis2', 'axis3'],
  ['axis3', 'axis4'],
  ['axis4', 'axis5'],
  ['axis5', 'camera'],
];

const geometryCache = new Map();
function labelMesh(props) {
  const key = `${props.group}/${props.lod}/${props.part}`;
  if (!geometryCache.has(key)) {
    geometryCache.set(key, readOtokarGeometry(props.group, props.part, props.lod));
  }
  return { type: 'mesh', props: { name: props.part, geometry: geometryCache.get(key) } };
}

function boxGap(a, b) {
  const gaps = ['x', 'y', 'z'].map((axis) =>
    Math.max(0, a.min[axis] - b.max[axis], b.min[axis] - a.max[axis]));
  return Math.hypot(...gaps);
}

function surfaceGap(a, b, maxDistance = 2) {
  if (!a.geometry.boundsTree) a.geometry.boundsTree = new MeshBVH(a.geometry);
  if (!b.geometry.boundsTree) b.geometry.boundsTree = new MeshBVH(b.geometry);
  const bInA = a.matrixWorld.clone().invert().multiply(b.matrixWorld);
  const result = a.geometry.boundsTree.closestPointToGeometry(
    b.geometry, bInA, {}, {}, 0.01, maxDistance,
  );
  return result ? result.distance : Infinity;
}

function findRobotMeshes(root, robotId) {
  const cadFrame = root.getObjectByName(`${robotId}-cad-frame`);
  if (!cadFrame) throw new Error(`Missing ${robotId} CAD frame`);
  const meshes = new Map();
  cadFrame.traverse((object) => {
    if (!object.isMesh || !object.geometry?.userData?.source) return;
    if (meshes.has(object.name)) throw new Error(`Duplicate ${robotId}/${object.name}`);
    meshes.set(object.name, object);
  });
  return meshes;
}

function measure(meshes, sharedRail) {
  const boxes = new Map();
  for (const [part, mesh] of meshes) {
    boxes.set(part, new THREE.Box3().setFromObject(mesh, true));
  }
  if (sharedRail) boxes.set('axis1', new THREE.Box3().setFromObject(sharedRail, true));
  const meshFor = (part) => part === 'axis1' && sharedRail ? sharedRail : meshes.get(part);
  return {
    boxes,
    gaps: PAIRS.map(([a, b]) => [a, b, boxGap(boxes.get(a), boxes.get(b)), surfaceGap(meshFor(a), meshFor(b), a === 'axis1' ? 20 : 2)]),
  };
}

function reoriginWithCompensation(meshes) {
  // Coordinate-change experiment, not a claim that the bbox centre is a
  // mechanical joint: shift each mesh's vertices and its local placement by
  // equal, opposite amounts. World geometry must remain invariant.
  for (const mesh of meshes.values()) {
    const pivot = mesh.geometry.boundingBox || new THREE.Box3().setFromBufferAttribute(
      mesh.geometry.getAttribute('position'));
    const centre = pivot.getCenter(new THREE.Vector3());
    mesh.geometry = mesh.geometry.clone().translate(-centre.x, -centre.y, -centre.z);
    mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
    mesh.position.add(centre);
  }
}

function scene(lod) {
  const inspector = createInspector({ './OtokarMesh': labelMesh });
  const root = new THREE.Group();
  const e = inspector.element;
  const robot = inspector.load('OtokarGantryRobot').default;
  inspector.mount(e('group', { position: [-3.92, 1.368, -5.88], rotation: [0, Math.PI / 2, 0] },
    e(robot, { robotId: 'robot1', axes: POSES.robot1, lod, showRails: true }),
    e(robot, { robotId: 'robot2', axes: POSES.robot2, lod, showRails: false })), root);
  inspector.frames.forEach((frame) => frame({}, 0));
  root.updateMatrixWorld(true);
  return { root, frames: inspector.frames };
}

for (const lod of (process.env.OTOKAR_AUDIT_LODS || 'hi,lo').split(',')) {
  const { root, frames } = scene(lod);
  const robot1 = findRobotMeshes(root, 'robot1');
  const robot2 = findRobotMeshes(root, 'robot2');
  const sharedRail = robot1.get('axis1');
  if (!sharedRail) {
    const nodes = [];
    root.traverse((object) => nodes.push(`${object.type}:${object.name}:${object.geometry?.userData?.source || ''}`));
    throw new Error(`The shared runway is absent; mounted nodes: ${nodes.join(' | ')}`);
  }
  if (lod === 'hi') {
    console.log('Robot1 axis-1 pose sweep (real JSX useFrame):');
    for (const axis1 of [4500, 6500, 11500, 13474]) {
      POSES.robot1[0] = axis1;
      frames.forEach((frame) => frame({}, 0));
      root.updateMatrixWorld(true);
      const gaps = [0.05, 0.5, 2, 20].map((cap) => surfaceGap(sharedRail, robot1.get('axis1_carriage'), cap));
      console.log(`  a1=${String(axis1).padStart(5)} mm, local x=${robot1.get('axis1_carriage').parent.position.x.toFixed(3)}: gaps ${gaps.map((gap) => Number.isFinite(gap) ? gap.toFixed(3) : 'none').join(' / ')} m at caps 0.05/0.5/2/20`);
    }
    POSES.robot1[0] = 4500;
    frames.forEach((frame) => frame({}, 0));
    root.updateMatrixWorld(true);
  }
  for (const [robotId, meshes] of [['robot1', robot1], ['robot2', robot2]]) {
    for (const part of ['axis1_carriage', 'axis2', 'axis3', 'axis4', 'axis5', 'camera']) {
      if (!meshes.has(part)) throw new Error(`Missing ${robotId}/${part}`);
    }
    const before = measure(meshes, robotId === 'robot2' ? sharedRail : null);
    console.log(`\n${lod} ${robotId}: actual JSX + useFrame at home pose`);
    for (const [a, b, gap, actual] of before.gaps) {
      console.log(`  ${a} -> ${b}: bbox gap ${gap.toFixed(3)} m; triangle gap ${actual.toFixed(3)} m`);
    }
    for (const [part, box] of before.boxes) {
      console.log(`  ${part} world centre ${box.getCenter(new THREE.Vector3()).toArray().map((n) => n.toFixed(3)).join(', ')}`);
    }
    reoriginWithCompensation(meshes);
    root.updateMatrixWorld(true);
    const after = measure(meshes, robotId === 'robot2' ? sharedRail : null);
    for (let i = 0; i < before.gaps.length; i++) {
      const bboxDelta = Math.abs(before.gaps[i][2] - after.gaps[i][2]);
      const surfaceDelta = Math.abs(before.gaps[i][3] - after.gaps[i][3]);
      if (bboxDelta > 1e-6 || surfaceDelta > 1e-4) {
        console.warn(`  *** ${robotId} re-origin changed gap by bbox ${bboxDelta}, surface ${surfaceDelta} m (pair ${before.gaps[i][0]}->${before.gaps[i][1]}) ***`);
      }
    }
    console.log('  re-origin + equal parent-offset compensation: bbox and triangle gaps unchanged');
  }
  const c1 = new THREE.Box3().setFromObject(robot1.get('camera'), true).getCenter(new THREE.Vector3());
  const c2 = new THREE.Box3().setFromObject(robot2.get('camera'), true).getCenter(new THREE.Vector3());
  console.log(`  robot2 camera - robot1 camera: ${c2.sub(c1).toArray().map((n) => n.toFixed(3)).join(', ')} m`);
}

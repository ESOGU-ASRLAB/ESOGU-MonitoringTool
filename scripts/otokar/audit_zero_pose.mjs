// Item 1 of the otokar re-audit: world-space bbox (mm) for every link of both
// robots at the literal all-axes-zero pose, plus consecutive-pair gaps.
// Uses the REAL JSX + useFrame code (via scene_inspection.mjs), not a mock.
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { createInspector, boundsMesh } from './scene_inspection.mjs';

const CHAIN = ['axis1', 'axis1_carriage', 'axis2', 'axis3', 'axis4', 'axis5', 'camera'];

function labelMesh(props) {
  const mesh = boundsMesh(props);
  mesh.props.name = props.part;
  return mesh;
}

function findRobotMeshes(root, robotId) {
  const cadFrame = root.getObjectByName(`${robotId}-cad-frame`);
  if (!cadFrame) throw new Error(`Missing ${robotId} CAD frame`);
  const meshes = new Map();
  cadFrame.traverse((object) => {
    if (!object.isMesh || !object.geometry?.userData?.source) return;
    meshes.set(object.name, object);
  });
  return meshes;
}

function scene() {
  const inspector = createInspector({ './OtokarMesh': labelMesh });
  const root = new THREE.Group();
  const e = inspector.element;
  const robot = inspector.load('OtokarGantryRobot').default;
  // Same cell-level placement audit_runtime_adjacency.mjs uses, so numbers
  // are comparable: a fixed group position/rotation standing in for OtokarCell.
  inspector.mount(e('group', { position: [-3.92, 1.368, -5.88], rotation: [0, Math.PI / 2, 0] },
    e(robot, { robotId: 'robot1', axes: [0, 0, 0, 0, 0], lod: 'hi', showRails: true }),
    e(robot, { robotId: 'robot2', meshGroup: 'robot2', axes: [0, 0, 0, 0, 0], lod: 'hi', showRails: true })), root);
  inspector.frames.forEach((frame) => frame({}, 0));
  root.updateMatrixWorld(true);
  return root;
}

const MM = 1000; // world units are metres; report in mm per the request
const root = scene();

for (const robotId of ['robot1', 'robot2']) {
  const meshes = findRobotMeshes(root, robotId);
  console.log(`\n=== ${robotId} @ axes=[0,0,0,0,0] ===`);
  const boxes = new Map();
  for (const part of CHAIN) {
    const mesh = meshes.get(part);
    if (!mesh) { console.log(`  ${part}: MISSING`); continue; }
    const box = new THREE.Box3().setFromObject(mesh, true);
    boxes.set(part, box);
    const c = box.getCenter(new THREE.Vector3());
    console.log(
      `  ${part.padEnd(14)} min(${(box.min.x*MM).toFixed(0)}, ${(box.min.y*MM).toFixed(0)}, ${(box.min.z*MM).toFixed(0)})  ` +
      `max(${(box.max.x*MM).toFixed(0)}, ${(box.max.y*MM).toFixed(0)}, ${(box.max.z*MM).toFixed(0)})  ` +
      `center(${(c.x*MM).toFixed(0)}, ${(c.y*MM).toFixed(0)}, ${(c.z*MM).toFixed(0)}) mm`
    );
  }
  console.log(`  --- consecutive-pair gaps (mm) ---`);
  for (let i = 0; i < CHAIN.length - 1; i++) {
    const a = CHAIN[i], b = CHAIN[i + 1];
    if (!boxes.has(a) || !boxes.has(b)) continue;
    const A = boxes.get(a), B = boxes.get(b);
    const centerGap = A.getCenter(new THREE.Vector3()).sub(B.getCenter(new THREE.Vector3()));
    const axisGap = (min1,max1,min2,max2) => Math.max(0, min1-max2, min2-max1);
    const bboxGap = Math.hypot(
      axisGap(A.min.x,A.max.x,B.min.x,B.max.x),
      axisGap(A.min.y,A.max.y,B.min.y,B.max.y),
      axisGap(A.min.z,A.max.z,B.min.z,B.max.z)) * MM;
    console.log(`  ${a} -> ${b}: bbox-gap ${bboxGap.toFixed(1)}mm, center-to-center (${(centerGap.x*MM).toFixed(0)}, ${(centerGap.y*MM).toFixed(0)}, ${(centerGap.z*MM).toFixed(0)}) mm`);
  }
}

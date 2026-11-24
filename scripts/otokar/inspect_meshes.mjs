// Offline proof of the Otokar mesh frames and the runtime parent chain.
//
// This deliberately does not use a renderer or apply a GLTF scene transform:
// it loads each GLB as an independent local asset, then rebuilds the same
// transform chain used by OtokarGantryRobot. That makes a non-zero local bbox
// centre visible instead of hiding it behind a parent transform.
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { readGlbBox, ROOT } from './scene_inspection.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MM = 0.001;
const CELL_ORIGIN = [-3.92, 1.368, -5.88];
const CELL_ROTATION_Y = Math.PI / 2;
const CAD_POSE = { a1: 13474, a2: 0, a3: 900 };
const HOME = { robot1: [4500, 1200, 600], robot2: [11500, 1200, 600] };
const PIVOTS = {
  a4: [1840.0, -2258.2, -585.3],
  a5: [1902.8, -2258.2, -755.0],
};
const CAMERA_MOUNT = [1902.8, -2258.2, -1010.0];
const meshPath = (group, part) =>
  resolve(ROOT, `client/public/meshes/bus-inspection/${group}/hi/${part}.glb`);

const fmt = (v) => v.toArray().map((n) => n.toFixed(3)).join(', ');
const fmtPoint = (v) => v.map((n) => n.toFixed(3)).join(', ');

function attachMesh(parent, group, part, label) {
  const geometryBox = readGlbBox(meshPath(group, part));
  const loBox = readGlbBox(resolve(ROOT, `client/public/meshes/bus-inspection/${group}/lo/${part}.glb`));
  const size = geometryBox.getSize(new THREE.Vector3());
  const centre = geometryBox.getCenter(new THREE.Vector3());
  const geometry = new THREE.BoxGeometry(...size.toArray()).translate(...centre.toArray());
  const object = new THREE.Mesh(geometry);
  object.name = label;
  parent.add(object);
  return { object, localBox: geometryBox, loBox };
}

function addRobot(cell, robotId, includeRail) {
  const robotRoot = new THREE.Group();
  robotRoot.name = `${robotId}-cad-frame`;
  robotRoot.rotation.x = -Math.PI / 2;
  cell.add(robotRoot);

  const a = HOME[robotId];
  const a1 = new THREE.Group();
  a1.name = 'axis-1-carriage';
  a1.position.x = (a[0] - CAD_POSE.a1) * MM;
  robotRoot.add(a1);
  const a2 = new THREE.Group();
  a2.name = 'axis-2-vertical';
  a2.position.z = (a[1] - CAD_POSE.a2) * MM;
  a1.add(a2);
  const a3 = new THREE.Group();
  a3.name = 'axis-3-arm';
  a3.position.y = (a[2] - CAD_POSE.a3) * MM;
  a2.add(a3);

  const a4Pivot = new THREE.Group();
  a4Pivot.name = 'axis-4-pivot';
  a4Pivot.position.fromArray(PIVOTS.a4.map((v) => v * MM));
  a3.add(a4Pivot);
  const a4 = new THREE.Group();
  a4.name = 'axis-4-tilt';
  a4Pivot.add(a4);
  const a4Origin = new THREE.Group();
  a4Origin.position.fromArray(PIVOTS.a4.map((v) => -v * MM));
  a4.add(a4Origin);

  const a5Pivot = new THREE.Group();
  a5Pivot.name = 'axis-5-pivot';
  a5Pivot.position.fromArray(PIVOTS.a5.map((v) => v * MM));
  a4Origin.add(a5Pivot);
  const a5 = new THREE.Group();
  a5.name = 'axis-5-azimuth';
  a5Pivot.add(a5);
  const a5Origin = new THREE.Group();
  a5Origin.position.fromArray(PIVOTS.a5.map((v) => -v * MM));
  a5.add(a5Origin);
  const cameraMount = new THREE.Group();
  cameraMount.name = 'camera-mount';
  cameraMount.position.fromArray(CAMERA_MOUNT.map((v) => v * MM));
  a5Origin.add(cameraMount);

  const result = {
    axis2: attachMesh(a1, 'robot1', 'axis2', `${robotId}/axis2`),
    axis3: attachMesh(a2, 'robot1', 'axis3', `${robotId}/axis3`),
    axis4: attachMesh(a3, 'robot1', 'axis4', `${robotId}/axis4`),
    axis5: attachMesh(a4Origin, 'robot1', 'axis5', `${robotId}/axis5`),
    camera: attachMesh(cameraMount, 'shared', 'camera', `${robotId}/camera`),
  };
  if (includeRail) result.axis1 = attachMesh(robotRoot, 'robot1', 'axis1', `${robotId}/axis1`);
  return result;
}

const cell = new THREE.Group();
cell.position.fromArray(CELL_ORIGIN);
cell.rotation.y = CELL_ROTATION_Y;
const meshes = [addRobot(cell, 'robot1', true), addRobot(cell, 'robot2', false)];
cell.updateMatrixWorld(true);

console.log('Inspection cell GLB frame audit (hi-res, home pose)');
console.log('Expected CAD->Three map: (x, y, z) -> (x, z, -y)');
console.log('GLB local-center audit: before=source assembly frame; after=current GLB (no bbox recentering)');
for (const robot of meshes) {
  for (const [part, entry] of Object.entries(robot)) {
    const worldBox = new THREE.Box3().setFromObject(entry.object, true);
    const localCentre = entry.localBox.getCenter(new THREE.Vector3());
    const worldCentre = worldBox.getCenter(new THREE.Vector3());
    const loCentre = entry.loBox.getCenter(new THREE.Vector3());
    const chain = [];
    let p = entry.object;
    while (p && p !== cell) {
      if (p.name) chain.unshift(p.name);
      p = p.parent;
    }
    console.log(
      `${entry.object.name.padEnd(16)} localCentre(${fmtPoint(localCentre.toArray())}) ` +
        `loLocalCentre(${fmtPoint(loCentre.toArray())}) ` +
        `worldCentre(${fmtPoint(worldCentre.toArray())}) ` +
        `worldMin(${fmt(worldBox.min)}) worldMax(${fmt(worldBox.max)}) ` +
        `parent=${chain.join(' > ')}`,
    );
  }
}
console.log('Local-center decision: these non-zero values are retained CAD assembly coordinates;');
console.log('bbox-centering them would invent a pivot and break the measured cross-axis assembly alignment.');

const robot1Camera = meshes[0].camera.object;
const robot2Camera = meshes[1].camera.object;
const c1 = new THREE.Box3().setFromObject(robot1Camera, true).getCenter(new THREE.Vector3());
const c2 = new THREE.Box3().setFromObject(robot2Camera, true).getCenter(new THREE.Vector3());
console.log(`Robot2 camera offset from Robot1 camera: ${c2.x - c1.x}, ${c2.y - c1.y}, ${c2.z - c1.z}`);

// The converted GLB is one merged mesh per axis, so cable carriers cannot be
// inferred from a primitive name at runtime. The confidential CAD audit is
// kept beside the raw sources and records the source parts that must survive
// conversion. Report those parts when the audit is available.
const auditDir = resolve(ROOT, 'raw-cad/otokar/audit');
for (const [axis, pattern] of [
  [1, /kablo|kettenglied|chain|traktoru|traktör/i],
  [2, /kablo|traktoru|traktör/i],
]) {
  const file = resolve(auditDir, `axis${axis}.json`);
  if (!existsSync(file)) continue;
  const parts = JSON.parse(readFileSync(file, 'utf8'));
  const matches = parts.filter((part) => pattern.test(part.label || part.name || ''));
  console.log(`axis${axis} source cable-carrier parts retained for conversion: ${matches.length}`);
}

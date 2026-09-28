import * as THREE from 'three';
import { ACCENT, METAL, PAINT } from '../scenePalette';

/*
 * A UR10e THAT COMES APART, FOR THE ASSEMBLY TRAINING.
 *
 * The same chain as UR10eRobot.js -- the same STL meshes (already loaded for
 * the cell's arm, so nothing more is downloaded), joint origins and mesh
 * offsets from ur_macro.xacro -- but built as data so it can be split into
 * the pieces a technician would take off, outermost first:
 *
 *   tool      wrist 3, tool flange, camera, gripper and cable channel
 *   wrist     wrist 1 and wrist 2
 *   forearm
 *   upperarm
 *   shoulder
 *
 * The base stays on its pedestal. buildTrainerArm returns a skeleton of empty
 * joint frames (posed with setAngles) and one Group per piece holding its
 * meshes, each piece placed in its joint frame; pieceMatrix() says where a
 * piece sits on the arm in any pose.
 */

export const MESH_BASE = `${process.env.PUBLIC_URL}/meshes/ur10e`;

export const PIECES = ['tool', 'wrist', 'forearm', 'upperarm', 'shoulder'];

const FLANGE_OFFSET = [-1.106132, -0.502789, -0.727752];

// Every mesh: the file, which piece, which joint frame it hangs in, its
// offset there (the STLs are in millimetres around a shared origin), paint.
const MESHES = [
  { file: 'base', piece: 'base', frame: 'base', at: [0.105561, -0.1918, -0.6445], paint: 'shell' },
  { file: 'shoulder', piece: 'shoulder', frame: 'j1', at: [0.105565, -0.1918, -0.74405], paint: 'blue' },
  { file: 'upperarm', piece: 'upperarm', frame: 'j2', at: [0.105565, -0.2778, -0.83405], paint: 'shell' },
  { file: 'forearm', piece: 'forearm', frame: 'j3', at: [-0.506534, -0.299691, -0.833449], paint: 'blue' },
  { file: 'wrist1', piece: 'wrist', frame: 'j4', at: [-1.078132, -0.301691, -0.833449], paint: 'shell' },
  { file: 'wrist2', piece: 'wrist', frame: 'j5', at: [-1.078132, -0.355691, -0.77175], paint: 'blue' },
  { file: 'wrist3', piece: 'tool', frame: 'j6', at: [-1.078132, -0.417389, -0.71775], paint: 'shell' },
  { file: 'tool0', piece: 'tool', frame: 'tool0', at: [-1.078132, -0.477889, -0.717752], paint: 'dark' },
  { file: 'flange', piece: 'tool', frame: 'flange', at: FLANGE_OFFSET, paint: 'dark' },
  { file: 'sick_camera_mo', piece: 'tool', frame: 'camera', at: [-1.02433, -0.5466, -0.730752], paint: 'blue' },
  { file: 'gripper_body_1', piece: 'tool', frame: 'flange', at: FLANGE_OFFSET, paint: 'metal' },
  { file: 'gripper_lower_1', piece: 'tool', frame: 'flange', at: FLANGE_OFFSET, paint: 'metal' },
  { file: 'gripper_upper_1', piece: 'tool', frame: 'flange', at: FLANGE_OFFSET, paint: 'metal' },
  { file: 'cable_channel_flange', piece: 'tool', frame: 'cableFlange', at: [-1.078132, -0.537789, -0.707752], paint: 'dark' },
  { file: 'cable_channel', piece: 'tool', frame: 'cable', at: [-1.078132, -0.486789, -0.669752], paint: 'dark' },
];

export const MESH_URLS = [...new Set(MESHES.map((m) => `${MESH_BASE}/${m.file}.stl`))];

// The joint frames: parent, offset, and the axis a joint turns about.
const FRAMES = [
  { name: 'base', parent: 'root', at: [0.052439, 0.0768, 0.05815] },
  { name: 'j1', parent: 'base', at: [-4e-06, 0, 0.09955], axis: 'z' },
  { name: 'j2', parent: 'j1', at: [0, 0.086, 0.09], axis: 'y' },
  { name: 'j3', parent: 'j2', at: [0.612099, 0.021891, -0.000601], axis: 'y' },
  { name: 'j4', parent: 'j3', at: [0.571598, 0.002, 0], axis: 'y' },
  { name: 'j5', parent: 'j4', at: [0, 0.054, -0.061699], axis: 'z', sign: -1 },
  { name: 'j6', parent: 'j5', at: [0, 0.061698, -0.054], axis: 'y' },
  { name: 'tool0', parent: 'j6', at: [0, 0.0605, 2e-06] },
  { name: 'flange', parent: 'tool0', at: [0.028, 0.0249, 0.01] },
  { name: 'camera', parent: 'flange', at: [-0.081802, 0.043811, 0.003] },
  { name: 'cableFlange', parent: 'tool0', at: [0, 0.0599, -0.01] },
  { name: 'cable', parent: 'cableFlange', at: [0, -0.051, -0.038] },
];
const JOINTS = ['j1', 'j2', 'j3', 'j4', 'j5', 'j6'];
// Where each piece is anchored: the joint it turns on.
const ANCHORS = { base: 'base', shoulder: 'j1', upperarm: 'j2', forearm: 'j3', wrist: 'j4', tool: 'j6' };

function paints() {
  const make = (p) => new THREE.MeshStandardMaterial({ color: p.color, metalness: p.metalness, roughness: p.roughness, side: THREE.DoubleSide });
  return { shell: make(PAINT.shell), dark: make(PAINT.dark), blue: make(ACCENT.brandBlue), metal: make(METAL.machined) };
}

/**
 * geometries: the loaded STLs in MESH_URLS order. Returns { root, frames,
 * pieces: { name: Group }, setAngles(deg[6]), pieceMatrix(name, out) }. `root`
 * holds the skeleton only; the piece groups are for the caller to mount.
 */
export function buildTrainerArm(geometries) {
  const byUrl = new Map(MESH_URLS.map((url, i) => [url, geometries[i]]));
  const materials = paints();

  // Skeleton: ROS Z-up turned to three's Y-up, as UR10eRobot does.
  const root = new THREE.Group();
  const up = new THREE.Group();
  up.rotation.x = -Math.PI / 2;
  root.add(up);
  const frames = { root: up };
  for (const f of FRAMES) {
    const g = new THREE.Group();
    g.position.fromArray(f.at);
    frames[f.parent].add(g);
    frames[f.name] = g;
  }

  // Meshes go into their frames first, to find where they sit...
  const pieces = {};
  const meshes = MESHES.map((m) => {
    if (!geometries.length) return null;
    const geometry = byUrl.get(`${MESH_BASE}/${m.file}.stl`);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials[m.paint]);
    mesh.position.fromArray(m.at);
    mesh.scale.setScalar(0.001);
    mesh.castShadow = true;
    frames[m.frame].add(mesh);
    return { mesh, piece: m.piece };
  });

  function setAngles(deg) {
    JOINTS.forEach((name, i) => {
      const f = FRAMES.find((x) => x.name === name);
      frames[name].rotation.set(0, 0, 0);
      frames[name].rotation[f.axis] = (f.sign || 1) * THREE.MathUtils.degToRad(deg[i]);
    });
    root.updateMatrixWorld(true);
  }

  // ...then each piece is a Group at its anchor frame, the meshes moved into
  // it keeping where they are.
  setAngles([0, 0, 0, 0, 0, 0]);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const name of Object.keys(ANCHORS)) {
    const piece = new THREE.Group();
    piece.name = name;
    const anchor = frames[ANCHORS[name]];
    new THREE.Matrix4().multiplyMatrices(inverseRoot, anchor.matrixWorld)
      .decompose(piece.position, piece.quaternion, piece.scale);
    root.add(piece);
    piece.updateMatrixWorld(true);
    pieces[name] = piece;
  }
  for (const entry of meshes) if (entry) pieces[entry.piece].attach(entry.mesh);
  for (const piece of Object.values(pieces)) root.remove(piece);

  /** Where `name` sits on the arm in the current pose, relative to root. */
  function pieceMatrix(name, out) {
    root.updateMatrixWorld(true);
    return out.copy(root.matrixWorld).invert().multiply(frames[ANCHORS[name]].matrixWorld);
  }

  return { root, frames, pieces, setAngles, pieceMatrix };
}

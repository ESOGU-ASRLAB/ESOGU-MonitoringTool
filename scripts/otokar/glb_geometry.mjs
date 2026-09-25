// Decode the actual Draco triangles from an Otokar GLB for offline geometry
// checks. The bbox reader in scene_inspection.mjs uses accessor extrema only.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { ROOT } from './scene_inspection.mjs';

const require = createRequire(resolve(ROOT, 'client/package.json'));
const draco3d = require('draco3d');
const decoderModule = await draco3d.createDecoderModule({});

export function readOtokarGeometry(group, part, lod = 'hi') {
  const file = resolve(ROOT, `client/public/meshes/otokar/${group}/${lod}/${part}.glb`);
  return readGeometryFile(file);
}

export function readGeometryFile(file) {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const primitive = gltf.meshes[0].primitives[0];
  const ext = primitive.extensions?.KHR_draco_mesh_compression;
  if (!ext) {
    const readAccessor = (id) => {
      const a = gltf.accessors[id], v = gltf.bufferViews[a.bufferView];
      const count = a.type === 'VEC3' ? 3 : 1;
      const size = {5121:1,5123:2,5125:4,5126:4}[a.componentType];
      const read = {5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
      if (!read || a.sparse) throw new Error('Unsupported accessor: ' + file);
      const out = a.componentType === 5126 ? new Float32Array(a.count*count) : new Uint32Array(a.count*count);
      for (let i=0;i<a.count;i++) for(let j=0;j<count;j++) out[i*count+j]=bytes[read](binStart+(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||count*size)+j*size);
      return out;
    };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(readAccessor(primitive.attributes.POSITION),3));
    if (primitive.indices !== undefined) geometry.setIndex(new THREE.BufferAttribute(readAccessor(primitive.indices),1));
    finish(geometry,gltf,file);
    return geometry;
  }
  const view = gltf.bufferViews[ext.bufferView];
  const compressed = bytes.subarray(binStart + (view.byteOffset || 0), binStart + (view.byteOffset || 0) + view.byteLength);

  const decoder = new decoderModule.Decoder();
  const buffer = new decoderModule.DecoderBuffer();
  buffer.Init(new Int8Array(compressed), compressed.byteLength);
  const mesh = new decoderModule.Mesh();
  const status = decoder.DecodeBufferToMesh(buffer, mesh);
  if (!status.ok()) throw new Error(`Draco decode failed for ${file}: ${status.error_msg()}`);
  const attribute = decoder.GetAttributeByUniqueId(mesh, ext.attributes.POSITION);
  const points = new decoderModule.DracoFloat32Array();
  decoder.GetAttributeFloatForAllPoints(mesh, attribute, points);
  const positions = new Float32Array(points.size());
  for (let i = 0; i < points.size(); i++) positions[i] = points.GetValue(i);
  const face = new decoderModule.DracoInt32Array();
  const indices = new Uint32Array(mesh.num_faces() * 3);
  for (let i = 0; i < mesh.num_faces(); i++) {
    decoder.GetFaceFromMesh(mesh, i, face);
    indices[i * 3] = face.GetValue(0);
    indices[i * 3 + 1] = face.GetValue(1);
    indices[i * 3 + 2] = face.GetValue(2);
  }
  for (const object of [face, points, mesh, buffer, decoder]) decoderModule.destroy(object);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  finish(geometry,gltf,file);
  return geometry;
}

function finish(geometry,gltf,file) {
  // Export pipeline emits exactly one mesh node; reject unsupported scenes
  // rather than silently validating only a subset of the collision geometry.
  if (gltf.meshes.length !== 1 || gltf.meshes[0].primitives.length !== 1) throw new Error('Expected single primitive: '+file);
  const transforms=[];
  function visit(id,parent) {
    const n=gltf.nodes[id];
    const local=n.matrix?new THREE.Matrix4().fromArray(n.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation||[0,0,0])),new THREE.Quaternion(...(n.rotation||[0,0,0,1])),new THREE.Vector3(...(n.scale||[1,1,1])));
    const world=parent.clone().multiply(local);
    if(n.mesh!==undefined) transforms.push(world);
    (n.children||[]).forEach(c=>visit(c,world));
  }
  gltf.scenes[gltf.scene||0].nodes.forEach(n=>visit(n,new THREE.Matrix4()));
  if(transforms.length!==1) throw new Error('Expected one mesh instance: '+file);
  geometry.applyMatrix4(transforms[0]);
  geometry.computeBoundingBox();
  geometry.userData.source=file;
}

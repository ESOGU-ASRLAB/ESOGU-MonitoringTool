// Offline inspection of the actual JSX scene graph: real STL vertices,
// component transforms and ref-driven joint poses, without a WebGL context.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { STLLoader } from '../../client/node_modules/three/examples/jsm/loaders/STLLoader.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(ROOT, 'client/package.json'));
const babel = require('@babel/core');

export function readGlbBox(file) {
  const bytes = readFileSync(file);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
  const box = new THREE.Box3();
  function visit(index, parent) {
    const node = gltf.nodes[index];
    const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
      new THREE.Vector3(...(node.translation || [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale || [1, 1, 1])));
    const world = parent.clone().multiply(local);
    for (const primitive of gltf.meshes?.[node.mesh]?.primitives || []) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      if (!accessor.min || !accessor.max) throw new Error('Missing GLB position bounds: ' + file);
      box.union(new THREE.Box3(new THREE.Vector3(...accessor.min), new THREE.Vector3(...accessor.max)).applyMatrix4(world));
    }
    (node.children || []).forEach((child) => visit(child, world));
  }
  gltf.scenes[gltf.scene || 0].nodes.forEach((index) => visit(index, new THREE.Matrix4()));
  return box;
}

export function boundsMesh({ group, part, lod = 'hi', ...props }) {
  const path = resolve(ROOT, `client/public/meshes/otokar/${group}/${lod}/${part}.glb`);
  const box = readGlbBox(path);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const geometry = new THREE.BoxGeometry(...size.toArray()).translate(...centre.toArray());
  geometry.userData.source = path;
  return { type: 'mesh', props: { ...props, geometry } };
}

export function createInspector(overrides = {}) {
  const frames = [];
  const modules = new Map();
  const geometries = new Map();
  const React = {
    Component: class {},
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Suspense: ({ children }) => children,
    useMemo: (fn) => fn(),
    useRef: (current) => ({ current }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
  };
  const useLoader = (_, url) => {
    if (!geometries.has(url)) {
      const bytes = readFileSync(resolve(ROOT, 'client/public', url.replace(/^\//, '')));
      const geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      geometry.userData.source = url;
      geometries.set(url, geometry);
    }
    return geometries.get(url);
  };
  function load(file) {
    const path = resolve(file);
    if (modules.has(path)) return modules.get(path);
    const exports = {};
    modules.set(path, exports);
    const code = babel.transformSync(readFileSync(path, 'utf8'), {
      filename: path, babelrc: false, configFile: false,
      presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
      plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code;
    const localRequire = (id) => {
      if (id in overrides) return overrides[id];
      if (id === 'react') return React;
      if (id === 'three') return THREE;
      if (id.startsWith('three/examples/')) return { STLLoader };
      if (id === '@react-three/fiber') return { useFrame: (fn) => frames.push(fn), useLoader };
      if (id.endsWith('.css')) return {};
      if (id.startsWith('.')) return load(resolve(dirname(path), id.endsWith('.js') ? id : id + '.js'));
      throw new Error('Unsupported inspection import: ' + id);
    };
    runInNewContext(code, { exports, require: localRequire, process: { env: { PUBLIC_URL: '' } }, console });
    return exports;
  }
  function mount(element, parent) {
    if (!element || typeof element !== 'object') return;
    if (Array.isArray(element)) { element.forEach((e) => mount(e, parent)); return; }
    const { type, props } = element;
    if (typeof type === 'function') { mount(type(props), parent); return; }
    let object = parent;
    if (type === 'group' || type === 'mesh') {
      object = type === 'mesh' ? new THREE.Mesh(props.geometry || new THREE.BufferGeometry()) : new THREE.Group();
      if (props.position) object.position.fromArray(props.position);
      if (props.rotation) object.rotation.fromArray(props.rotation);
      if (props.scale) object.scale.fromArray(Array.isArray(props.scale) ? props.scale : [props.scale, props.scale, props.scale]);
      if (props.name) object.name = props.name;
      if (props.visible !== undefined) object.visible = props.visible;
      parent.add(object);
      if (typeof props.ref === 'function') props.ref(object);
      else if (props.ref) props.ref.current = object;
    } else if (type === 'boxGeometry') parent.geometry = new THREE.BoxGeometry(...props.args);
    else if (type === 'cylinderGeometry') parent.geometry = new THREE.CylinderGeometry(...props.args);
    mount(props?.children, object);
  }
  return {
    load: (name) => load(resolve(ROOT, 'client/src/components', name + '.js')),
    mount,
    frames,
    element: React.createElement,
  };
}

export function measureIfarlab() {
  const inspector = createInspector();
  const root = new THREE.Group();
  const e = inspector.element;
  const component = (name, props) => e(inspector.load(name).default, props);
  inspector.mount(component('EnvironmentElements', {}), root);
  // Current default world placement in DigitalTwin.js, in metres.
  inspector.mount(e('group', { position: [-0.147, 0.58635, -1.115] },
    component('UR10eMount', {}),
    component('UR10eRobot', { jointAngles: [0, -90, 0, -90, 0, 0] })), root);
  inspector.mount(e('group', { position: [-2.301949, 0.17, -0.530401], rotation: [0, Math.PI / 2, 0] },
    component('AGVBase', {}),
    e('group', { position: [0.001, 0.263, 0.26], rotation: [0, Math.PI, 0] },
      component('KawasakiRobot', { jointAngles: [0, 20, -30, 0, 45, 0] }))), root);
  inspector.frames.forEach((fn) => fn({}, 0));
  root.updateMatrixWorld(true);
  return { root, box: new THREE.Box3().setFromObject(root, true) };
}

import * as THREE from 'three';

/*
 * THE WAREHOUSE'S PROPS, PAINTED AS THEY ARE IN A REAL PLANT -- under the
 * realistic look only (Realism.js); the classic look keeps the model's one
 * flat "details" material.
 *
 * The model draws all its props with one material: the 31.6 m pallet racking
 * along the east wall, the pallets and their loads, the lamps, the window
 * frames. Under the realistic light that came out as black silhouettes. The
 * props are told apart here by their geometry, and the racking further by
 * its parts, measured from the model (world metres):
 *
 *   uprights  ~5 m tall and a few cm across             RAL 7016 anthracite
 *   beams     7.18 m sections, 0.11 m deep               RAL 7035 light grey
 *   decks     the same sections, flat                    galvanised steel
 *   goods     0.3..0.8 m boxes on the shelves            cardboard, a few totes
 *
 * The finish is the quiet one many plants choose, not the blue-and-orange of
 * a warehouse aisle, which shouted over everything else in the hall: dark
 * uprights a step below the hall's own steel, light beams against them, and
 * totes in the floor's blue-grey.
 *
 * Colour goes in as vertex colours on the model's own geometry, which the
 * classic material simply ignores, so switching looks only swaps materials.
 */
const srgb = (hex) => new THREE.Color(hex);
const RACK = {
  upright: srgb('#3f464c'),
  beam: srgb('#b9bec1'),
  deck: srgb('#9aa1a5'),
  goods: ['#a88b66', '#9e8260', '#b39672', '#977a57', '#ad9374', '#6b747a', '#5f7487'].map(srgb),
};
const PALLET_WOOD = srgb('#b8956a');
const LOAD = srgb('#a9875a');

// Connected parts of an indexed geometry: a part id per vertex, and each
// part's world-space bounds.
function parts(mesh) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const parent = new Int32Array(position.count).map((_, i) => i);
  const find = (i) => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) { const next = parent[i]; parent[i] = r; i = next; }
    return r;
  };
  const triangles = index ? index.count / 3 : position.count / 3;
  for (let t = 0; t < triangles; t += 1) {
    const [a, b, c] = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  mesh.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  const bounds = new Map();
  const ids = new Int32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    const id = find(i);
    ids[i] = id;
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    let box = bounds.get(id);
    if (!box) { box = new THREE.Box3(); bounds.set(id, box); }
    box.expandByPoint(v);
  }
  return { ids, bounds };
}

function paint(mesh, colourFor) {
  const { ids, bounds } = parts(mesh);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const chosen = new Map();
  for (const [id, box] of bounds) chosen.set(id, colourFor(box.getSize(size), box.getCenter(centre), box));
  const colours = new Float32Array(ids.length * 3);
  ids.forEach((id, i) => chosen.get(id).toArray(colours, i * 3));
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

const hash = (a, b) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

function rackColour(size, centre, box) {
  if (size.y > 3 || box.min.y > 4.8) return RACK.upright;
  if (size.z > 5) return size.y > 0.05 ? RACK.beam : RACK.deck;
  // A box is drawn as separate faces; colouring by the shelf bay and level it
  // sits in keeps a box's faces one colour.
  const pick = hash(Math.floor(centre.z / 0.9), Math.floor(centre.y));
  return RACK.goods[Math.floor(pick * RACK.goods.length) % RACK.goods.length];
}

/*
 * Finds the props in the warehouse scene and returns a switch between their
 * classic and realistic materials. `base` is the model's shared details
 * material, whose texture and finish the realistic ones start from.
 */
export function dressWarehouse(scene, base) {
  const dressed = [];
  const material = (roughness, metalness) => {
    const m = base.clone();
    m.color.set('#ffffff');
    m.vertexColors = true;
    m.map = null;
    m.emissiveMap = null;
    m.emissive.set('#000000');
    m.roughness = roughness;
    m.metalness = metalness;
    m.onBeforeCompile = () => {};
    m.customProgramCacheKey = () => 'warehouse-dressing';
    return m;
  };
  const rackMaterial = material(0.55, 0.1);
  const woodMaterial = material(0.85, 0);
  scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material !== base) return;
    const count = mesh.geometry.getAttribute('position').count;
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    if (count > 9000 && box.max.y < 6 && box.max.y - box.min.y > 4) {
      paint(mesh, rackColour);
      dressed.push({ mesh, classic: base, realistic: rackMaterial });
    } else if (box.max.y < 1.3 && box.max.y - box.min.y < 0.3) {
      paint(mesh, () => PALLET_WOOD);
      dressed.push({ mesh, classic: base, realistic: woodMaterial });
    } else if (box.max.y < 1.3 && box.min.y > 0.1 && count < 2000) {
      paint(mesh, () => LOAD);
      dressed.push({ mesh, classic: base, realistic: woodMaterial });
    }
  });
  return {
    apply(realistic) {
      dressed.forEach((item) => { item.mesh.material = realistic ? item.realistic : item.classic; });
    },
    dispose() {
      dressed.forEach((item) => { item.mesh.material = item.classic; });
      rackMaterial.dispose();
      woodMaterial.dispose();
    },
  };
}

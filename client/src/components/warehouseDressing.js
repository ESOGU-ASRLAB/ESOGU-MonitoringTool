import * as THREE from 'three';
import { applyBakedOcclusion, warehouseLightmapUV } from './hallLightmap';
import { RENDER_FINISH } from './scenePalette';
import { createCartonAtlas } from './cartonFinish';

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
  upright: srgb('#2b3036'),
  beam: srgb('#383e44'),
  deck: srgb('#464d52'),
  goods: ['#a58a64', '#b19571', '#987950'].map(srgb),
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

function rackPart(size, centre, box) {
  if (size.y > 3 || box.min.y > 4.8) return -1;
  if (size.z > 5 || size.y > 2.2) return -2;
  return Math.floor(hash(Math.floor(centre.z / 0.9), Math.floor(centre.y)) * RACK.goods.length);
}

const hash = (a, b) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

function paintRack(mesh) {
  const { ids, bounds } = parts(mesh);
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const finishes = new Map();
  for (const [id, box] of bounds) {
    const kind = rackPart(box.getSize(size), box.getCenter(centre), box);
    finishes.set(id, kind === -1
      ? [RACK.upright, 0.6, 0.48]
      : kind === -2
        ? [size.y > 0.05 ? RACK.beam : RACK.deck, 0.6, 0.48]
        : [RACK.goods[kind], 0, 0.92]);
  }
  const colors = new Float32Array(ids.length * 3);
  const surface = new Float32Array(ids.length * 2);
  ids.forEach((id, i) => {
    const [color, metallic, roughness] = finishes.get(id);
    color.toArray(colors, i * 3);
    surface.set([metallic, roughness], i * 2);
  });
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  mesh.geometry.setAttribute('rackFinish', new THREE.BufferAttribute(surface, 2));
}

function applyRackFinish(shader, cartonAtlas) {
  shader.uniforms.cartonAtlas = { value: cartonAtlas };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 rackFinish;\nvarying vec2 vRackFinish;\nvarying vec3 vRackPosition;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRackFinish = rackFinish;\nvRackPosition = (modelMatrix * vec4(position, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D cartonAtlas;\nvarying vec2 vRackFinish;\nvarying vec3 vRackPosition;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      float carton = 1.0 - step(0.1, vRackFinish.x);
      vec3 paper = texture2D(cartonAtlas, vec2(vRackPosition.x + vRackPosition.z, vRackPosition.y) * 2.2).rgb;
      float powder = sin(dot(vRackPosition, vec3(96.0, 161.0, 118.0))) * (1.0 - smoothstep(0.2, 1.0, length(fwidth(vRackPosition) * 90.0)));
      diffuseColor.rgb *= 1.0 + carton * (0.09 * paper.g + 0.12 * (paper.r - 0.5)) + (1.0 - carton) * 0.07 * powder;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.67, 0.65, 0.60) * paper.b, carton * smoothstep(0.01, 0.3, paper.b) * 0.85);`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRackFinish.y - 0.3 * carton * paper.g + 0.06 * (1.0 - carton) * powder;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      vec3 dPosX = dFdx(-vViewPosition);
      vec3 dPosY = dFdy(-vViewPosition);
      float paperHeight = paper.r * carton * 0.00065;
      vec3 bump = cross(dPosY, normal) * dFdx(paperHeight) + cross(normal, dPosX) * dFdy(paperHeight);
      float det = dot(dPosX, cross(dPosY, normal));
      normal = normalize(abs(det) * normal - sign(det) * bump + 1e-10 * normal);`)
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRackFinish.x;');
  applyBakedOcclusion(shader);
}

/*
 * Finds the props in the warehouse scene and returns a switch between their
 * classic and realistic materials. `base` is the model's shared details
 * material, whose texture and finish the realistic ones start from.
 */
export function dressWarehouse(scene, base, lightmap) {
  const dressed = [];
  const footprints = [];
  const cartonAtlas = createCartonAtlas();
  const material = (roughness, metalness) => {
    const m = base.clone();
    m.color.set('#ffffff');
    m.vertexColors = true;
    m.map = null;
    m.roughnessMap = null;
    m.emissiveMap = null;
    m.emissive.set('#000000');
    m.roughness = roughness;
    m.metalness = metalness;
    m.onBeforeCompile = () => {};
    m.customProgramCacheKey = () => 'warehouse-dressing';
    return m;
  };
  const rackMaterial = material(0.56, 0.55);
  rackMaterial.lightMap = lightmap;
  rackMaterial.lightMapIntensity = RENDER_FINISH.bakedIndirect;
  rackMaterial.onBeforeCompile = (shader) => applyRackFinish(shader, cartonAtlas);
  rackMaterial.customProgramCacheKey = () => 'warehouse-rack-finish';
  const woodMaterial = material(0.92, 0);
  scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material !== base) return;
    const count = mesh.geometry.getAttribute('position').count;
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
    if (count > 9000 && box.max.y < 6 && box.max.y - box.min.y > 4) {
      paintRack(mesh);
      warehouseLightmapUV(mesh, true);
      dressed.push({ mesh, classic: base, realistic: rackMaterial });
    } else if (box.max.y < 1.3 && box.max.y - box.min.y < 0.3) {
      paint(mesh, () => PALLET_WOOD);
      dressed.push({ mesh, classic: base, realistic: woodMaterial });
      if (box.min.y < 0.14) {
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        footprints.push({ position: [centre.x, 0.0065, centre.z], size: [size.x + 0.55, size.z + 0.5] });
      }
    } else if (box.max.y < 1.3 && box.min.y > 0.1 && count < 2000) {
      paint(mesh, () => LOAD);
      dressed.push({ mesh, classic: base, realistic: woodMaterial });
    }
  });
  return {
    footprints,
    apply(realistic) {
      dressed.forEach((item) => {
        item.mesh.material = realistic ? item.realistic : item.classic;
        item.mesh.receiveShadow = realistic;
      });
    },
    dispose() {
      dressed.forEach((item) => {
        item.mesh.material = item.classic;
        item.mesh.receiveShadow = false;
      });
      rackMaterial.dispose();
      woodMaterial.dispose();
      cartonAtlas.dispose();
    },
  };
}

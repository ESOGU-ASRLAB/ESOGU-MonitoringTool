import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useRealism } from './realismContext';
import { WORKER_URL } from './Worker';
import { IFARLAB_COPY_OFFSET, IFARLAB_INSPECTION_OFFSET } from './cellLayout';

/*
 * Plant services and workwear, under the realistic look only (Realism.js).
 *
 * CABLE TRAYS. Power and data reach a robot cell from above: a galvanised
 * ladder tray runs over each row of cells, hung from the roof steel on
 * threaded rods, and drops a cable bundle down to each cell's controller
 * cabinet (ServerCabinets.js: cell-local x -1.284, z 1.0, 1.1 m tall). The
 * trays stop short of the bus corridor at the west end (x 1.41) and of the
 * racking at the east wall (x 14.97), and stay above the tallest machine in
 * the cells (~2 m) and below the racking's top (4.92 m).
 *
 * Only the back (north) row is fed from above. A drop to the front row's
 * cabinets would hang straight down the middle of the opening view, so those
 * cells are fed through the floor, as their cabinets' floor cables already show.
 */
const TRAY = { height: 4.2, width: 0.4, side: 0.1, x0: 3.0, x1: 14.6, rung: 0.3 };
const CABINET = { x: -1.284, z: 1.0, top: 1.1 };
const CELLS = [IFARLAB_COPY_OFFSET, IFARLAB_INSPECTION_OFFSET];
const ROWS = [...new Set(CELLS.map((offset) => offset[2] + CABINET.z))];
// The roof's underside over x (DigitalTwin's ROOF_PROFILE), less the purlins.
const ROOF = [[0, 10.07], [4.05, 9.88], [7.6, 9.4], [10.48, 8.83], [13.55, 8.0], [16.27, 6.98]];
function roofAt(x) {
  const ax = Math.abs(x);
  for (let i = 1; i < ROOF.length; i += 1) {
    const [x1, y1] = ROOF[i];
    if (ax <= x1) {
      const [x0, y0] = ROOF[i - 1];
      return y0 + ((ax - x0) / (x1 - x0)) * (y1 - y0) - 0.45;
    }
  }
  return ROOF[ROOF.length - 1][1] - 0.45;
}

const galvanised = new THREE.MeshStandardMaterial({ color: '#a3aaae', metalness: 0.75, roughness: 0.42 });
const rod = new THREE.MeshStandardMaterial({ color: '#7d8488', metalness: 0.8, roughness: 0.4 });
const cable = new THREE.MeshStandardMaterial({ color: '#1d2125', metalness: 0, roughness: 0.6 });
const junction = new THREE.MeshStandardMaterial({ color: '#c9ccc9', metalness: 0.05, roughness: 0.5 });

function Rungs({ z }) {
  const ref = useRef(null);
  const count = Math.floor((TRAY.x1 - TRAY.x0) / TRAY.rung);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      dummy.position.set(TRAY.x0 + (i + 0.5) * TRAY.rung, TRAY.height - TRAY.side / 2 + 0.012, z);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [count, z]);
  return (
    <instancedMesh ref={ref} args={[null, galvanised, count]} castShadow>
      <boxGeometry args={[0.025, 0.012, TRAY.width]} />
    </instancedMesh>
  );
}

function Tray({ z }) {
  const length = TRAY.x1 - TRAY.x0;
  const cx = (TRAY.x0 + TRAY.x1) / 2;
  const hangers = useMemo(() => {
    const out = [];
    for (let x = TRAY.x0 + 0.6; x < TRAY.x1; x += 2.4) out.push(x);
    return out;
  }, []);
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} material={galvanised} position={[cx, TRAY.height, z + side * TRAY.width / 2]} castShadow>
          <boxGeometry args={[length, TRAY.side, 0.012]} />
        </mesh>
      ))}
      <Rungs z={z} />
      {hangers.map((x) => {
        const top = roofAt(x);
        const length2 = top - TRAY.height;
        return (
          <group key={x}>
            {[-1, 1].map((side) => (
              <mesh key={side} material={rod} position={[x, TRAY.height + length2 / 2, z + side * (TRAY.width / 2 + 0.03)]}>
                <cylinderGeometry args={[0.006, 0.006, length2, 6]} />
              </mesh>
            ))}
            {/* The trapeze bar the tray sits on. */}
            <mesh material={rod} position={[x, TRAY.height - TRAY.side / 2 - 0.02, z]}>
              <boxGeometry args={[0.04, 0.04, TRAY.width + 0.12]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Drop({ offset }) {
  const x = offset[0] + CABINET.x;
  const z = offset[2] + CABINET.z;
  const length = TRAY.height - TRAY.side / 2 - CABINET.top;
  return (
    <group>
      {/* A bundle of three cables down to the cabinet's roof, and the gland box. */}
      {[-0.025, 0, 0.025].map((dx) => (
        <mesh key={dx} material={cable} position={[x + dx, CABINET.top + length / 2, z - 0.05]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, length, 8]} />
        </mesh>
      ))}
      <mesh material={junction} position={[x, CABINET.top + 0.06, z - 0.05]} castShadow>
        <boxGeometry args={[0.16, 0.12, 0.1]} />
      </mesh>
    </group>
  );
}

export function CableTrays() {
  const realistic = useRealism();
  if (!realistic) return null;
  return (
    <group>
      {ROWS.map((z) => <Tray key={z} z={z - 0.05} />)}
      {CELLS.map((offset) => <Drop key={offset.join(':')} offset={offset} />)}
    </group>
  );
}

/*
 * WORKWEAR. The worker model wears a black leather jacket, which no plant
 * would; under the realistic look its top becomes a luminous-yellow work
 * jacket (EN ISO 20471), keeping the cloth's folds from the normal map. The
 * material is shared by every worker and visitor, so this is the one place.
 */
const HI_VIS = '#cbd52f';
export function Workwear() {
  const realistic = useRealism();
  const { scene } = useGLTF(WORKER_URL);
  useEffect(() => {
    if (!realistic) return undefined;
    const tops = [];
    scene.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of [].concat(object.material)) if (material.name === 'Topmat' && !tops.includes(material)) tops.push(material);
    });
    // The jacket's own roughness and metalness maps are a leather's -- glossy
    // -- and they scale whatever roughness is set, so they go too: woven
    // polyester is matt, or it reads as wet plastic under the hall's lamps.
    const kept = ['map', 'roughnessMap', 'metalnessMap', 'roughness', 'metalness'];
    const saved = tops.map((material) => ({
      material, color: material.color.clone(), ...Object.fromEntries(kept.map((key) => [key, material[key]])),
    }));
    tops.forEach((material) => {
      material.map = null;
      material.roughnessMap = null;
      material.metalnessMap = null;
      material.color.set(HI_VIS);
      material.roughness = 0.9;
      material.metalness = 0;
      material.needsUpdate = true;
    });
    return () => saved.forEach(({ material, color, ...rest }) => {
      Object.assign(material, rest);
      material.color.copy(color);
      material.needsUpdate = true;
    });
  }, [scene, realistic]);
  return null;
}

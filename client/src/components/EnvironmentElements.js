import React, { useMemo, Suspense } from "react";
import { useLoader } from "@react-three/fiber";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";
import * as THREE from "three";

/*
 * Static workcell/facility dressing recreated from the original Gazebo
 * world (ifarlab.sdf). In that world every model is spawned at pose
 * (0 0 0) because the STL vertices already carry absolute world-space
 * coordinates (scale 0.001, i.e. mm -> m), and the UR10e itself is
 * spawned at that same world origin (whole_ifarlab_gazebo.launch.py).
 * So this group only re-applies the shared Z-up -> Y-up axis flip and
 * leaves translation at identity -- no extra offset -- to stay in that
 * same true world frame.
 */

import { METAL, PAINT } from './scenePalette';

const MM_TO_M = [0.001, 0.001, 0.001];
const FURNITURE_BASE = process.env.PUBLIC_URL + "/meshes/ur10e";
const FACILITY_BASE = process.env.PUBLIC_URL + "/meshes/environment";
/*
 * Facility materials, from the shared scene palette.
 *
 * What used to be here was two contradictory layers. Five materials were
 * declared with colour #101937 -- a dark navy -- under comments describing
 * aluminium, concrete grey and worn steel, with finishes to match the comments
 * rather than the values: FACILITY_GRAY carried metalness 1.0 directly beneath
 * a comment saying concrete is not metallic, and a roughness of 1.8, which is
 * outside the legal 0..1 range and was simply clamped.
 *
 * Every one of those five was then overwritten by an Object.assign block
 * further down, so the entire first layer was dead code whose comments
 * described neither what it did nor what replaced it. The live values were
 * better, but not right: FACILITY_GRAY ended up at #1a1506, a near-black
 * brown, for a surface called facility grey.
 *
 * One layer now, and the names say what the surface IS, which is what decides
 * its finish: extrusion and rail are bare metal, the AGV shell and the
 * facility surfaces are painted.
 */
const ALUMINUM = { ...METAL.aluminium };
// The test chassis: clear-anodised aluminium extrusion, a light satin metal
// with a faint cool cast, rather than the flat grey paint it wore.
const CHASSIS = { color: '#c3c8cf', metalness: 0.75, roughness: 0.32 };
const CONVEYOR = { ...METAL.galvanised };
const FACILITY_GRAY = { ...PAINT.structure };
const RAIL = { ...METAL.worn };

function EnvMesh({
  url,
  material,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  castShadow = false,
  receiveShadow = true,
}) {
  const geometry = useLoader(STLLoader, url);
  const prepared = useMemo(() => {
    if (!geometry.userData.__stlPrepared) {
      if (!geometry.attributes?.normal) {
        geometry.computeVertexNormals();
      }
      geometry.userData.__stlPrepared = true;
    }
    return geometry;
  }, [geometry]);

  return (
    <mesh
      geometry={prepared}
      scale={MM_TO_M}
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <meshStandardMaterial
        color={material.color}
        metalness={material.metalness}
        roughness={material.roughness}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* Nearby workcell furniture -- loads first, cheap enough to cast shadows.
 * wall_door/wall_server (generic wall slabs from the same source folder)
 * occupy almost the exact same footprint as barrier_closetable / barrier +
 * barrier_closekabinet from the facility set below, so they're dropped here
 * to stop the two wall representations from clipping into each other.
 * linear_axis_moving_link now rides with UR10e (see UR10eMount) instead of
 * sitting fixed here, since it's the arm's own travelling mount. */
/*
 * The test chassis with see-through panels. Its STL is one mesh, but the
 * panels are the only big flat vertical faces in it -- the back panel (0.47 m^2
 * triangles) and the centre divider (0.21 m^2) -- so every vertical triangle
 * over 0.1 m^2 is split into a clear acrylic group, and the Kawasaki can be
 * watched working inside. The floor sheet and the extrusion stay solid.
 */
const ACRYLIC = new THREE.MeshStandardMaterial({
  color: '#d9eef7', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.18,
  side: THREE.DoubleSide, depthWrite: false,
});
const PANEL_MIN_AREA = 0.1 * 1e6; // mm^2, in the STL's own units

function ChassisMesh({ position, rotation }) {
  const source = useLoader(STLLoader, `${FURNITURE_BASE}/chassis.stl`);
  const geometry = useMemo(() => {
    const pos = source.getAttribute('position');
    const frame = [];
    const panels = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      n.subVectors(b, a).cross(c.clone().sub(a));
      const area = n.length() / 2;
      const vertical = Math.abs(n.z) < 0.1 * n.length();
      (vertical && area > PANEL_MIN_AREA ? panels : frame).push(i);
    }
    const out = new THREE.BufferGeometry();
    const data = new Float32Array(pos.count * 3);
    let v = 0;
    [frame, panels].forEach((list) => {
      for (const i of list) for (let k = 0; k < 3; k += 1) {
        data.set([pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)], v * 3);
        v += 1;
      }
    });
    out.setAttribute('position', new THREE.BufferAttribute(data, 3));
    out.addGroup(0, frame.length * 3, 0);
    out.addGroup(frame.length * 3, panels.length * 3, 1);
    out.computeVertexNormals();
    return out;
  }, [source]);
  const materials = useMemo(() => [
    new THREE.MeshStandardMaterial({ ...CHASSIS, side: THREE.DoubleSide }),
    ACRYLIC,
  ], []);

  return (
    <mesh geometry={geometry} material={materials} scale={MM_TO_M} position={position} rotation={rotation} receiveShadow />
  );
}

/*
 * The conveyor with its belt in green. The belt is the up-facing surface at
 * z = 843 mm (the rails either side stand to 926), so those triangles are
 * split into their own group; the frame keeps the galvanised finish.
 */
const BELT = new THREE.MeshStandardMaterial({ color: '#2f8f4e', roughness: 0.85, metalness: 0 });

function ConveyorMesh() {
  const source = useLoader(STLLoader, `${FURNITURE_BASE}/conveyorbelt.stl`);
  const geometry = useMemo(() => {
    const pos = source.getAttribute('position');
    const frame = [];
    const belt = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      n.subVectors(b, a).cross(c.clone().sub(a));
      const z = (a.z + b.z + c.z) / 3;
      const up = n.z > 0.9 * n.length();
      (up && z > 836 && z < 850 ? belt : frame).push(i);
    }
    const out = new THREE.BufferGeometry();
    const data = new Float32Array(pos.count * 3);
    let v = 0;
    [frame, belt].forEach((list) => {
      for (const i of list) for (let k = 0; k < 3; k += 1) {
        data.set([pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)], v * 3);
        v += 1;
      }
    });
    out.setAttribute('position', new THREE.BufferAttribute(data, 3));
    out.addGroup(0, frame.length * 3, 0);
    out.addGroup(frame.length * 3, belt.length * 3, 1);
    out.computeVertexNormals();
    return out;
  }, [source]);
  const materials = useMemo(() => [
    new THREE.MeshStandardMaterial({ ...CONVEYOR, side: THREE.DoubleSide }),
    BELT,
  ], []);
  return <mesh geometry={geometry} material={materials} scale={MM_TO_M} receiveShadow />;
}

function Furniture() {
  return (
    <Suspense fallback={null}>
      <EnvMesh
        url={`${FURNITURE_BASE}/alumuniumtable.stl`}
        material={ALUMINUM}
        receiveShadow
      />
      <ConveyorMesh />
      <EnvMesh
        url={`${FURNITURE_BASE}/base_link.stl`}
        material={ALUMINUM}
        receiveShadow
      />
      {/* Turned end for end about its own vertical centre line
          (x -1.113, y 1.235), so its open side faces the Kawasaki and the arm
          reaches in through the gaps instead of meeting the side panels. */}
      <ChassisMesh position={[-2.226, 2.47, 0]} rotation={[0, 0, Math.PI]} />
    </Suspense>
  );
}

/* Perimeter/facility props -- heavier meshes, streamed in behind the furniture.
 * Each piece's raw STL coordinates already place it at its true position in
 * the shared room frame (see the note above), which packs everything in
 * tighter than is comfortable for a demo viewport. SPREAD pushes every piece
 * outward from the room origin by 20% of its own raw (X,Y) center -- distance
 * only, not size -- to open up clearance around the AGV/Kawasaki corner.
 * barrier_kaw1/2/3 are one contiguous wall (edge-to-edge along Y), so they
 * all get the SAME offset (derived from the wall's combined center) instead
 * of each segment's own center, otherwise the wall would fan apart. That
 * wall sits right behind the AGV/Kawasaki, so it's excluded from the general
 * spread (like ifarlab_ray below) and instead only nudged back in close to
 * line up with Kabinet's own (spread) position, closing the gap the general
 * spread had opened up there.
 * KAW_WALL_OFFSET's X also has to clear the Kawasaki's own reach, not just
 * look right at rest: sweeping joint1/2/3 through their full range against
 * the real base.stl/wall geometry (Three.js world-space bounding boxes, not
 * eyeballing) showed the arm can swing to X=-3.119 at a fully plausible pose
 * (base rotated 180 deg, shoulder raised 90 deg) -- with only -0.05 there the
 * wall's near face sat at X=-2.884, so the arm punched ~24cm into it. -0.35
 * keeps the wall's near face at X=-3.184, ~6.5cm clear of that worst case.
 * ifarlab_ray is excluded from the spread entirely: it's the AGV's own floor
 * guide rail, and its raw X (-2.298) already lines up almost exactly with
 * the AGV/Kawasaki spawn X (-2.301949) with the AGV's position falling
 * inside the rail's length -- spreading it breaks that real alignment. */
const SPREAD = 0.2;
const spreadOffset = (rawX, rawY) => [rawX * SPREAD, rawY * SPREAD, 0];
const KAW_WALL_OFFSET = [-0.35, 0, 0];

/* barrier.stl reused as generic 1.25m fence segments to close the perimeter.
 * Its own raw center is (0.216, -1.005); BARRIER_AT(x, y) returns the
 * position offset that puts a fresh copy's center at (x, y) in the same raw
 * frame everything else here uses, optionally rotated 90 deg (about the
 * Z-up vertical axis) to run the segment along Y instead of X. */
const BARRIER_RAW_CENTER = [0.316, -1.005];
const BARRIER_AT = (x, y, rotated = false) => {
  const [rawX, rawY] = rotated
    ? [-BARRIER_RAW_CENTER[1], BARRIER_RAW_CENTER[0]]
    : BARRIER_RAW_CENTER;
  return [x - rawX, y - rawY, 0];
};

/*
 * `infeedOpening` leaves out the south fence panel in front of the conveyor
 * (hall x 6.51..7.76): in a headset the pick-and-place training runs a roller
 * infeed through there to the belt (training/PickPlaceStation.js), and the
 * panel stood right across it.
 */
function Facility({ infeedOpening }) {
  return (
    <Suspense fallback={null}>
      {!infeedOpening && (
        <EnvMesh
          url={`${FACILITY_BASE}/barrier.stl`}
          material={FACILITY_GRAY}
          position={spreadOffset(3.716, -0.005)}
          receiveShadow
        />
      )}
      <EnvMesh
        url={`${FACILITY_BASE}/barrier.stl`}
        material={FACILITY_GRAY}
        position={spreadOffset(-3.116, -0.005)}
        receiveShadow
      />
      <EnvMesh
        url={`${FACILITY_BASE}/barrier_closekabinet.stl`}
        material={FACILITY_GRAY}
        position={spreadOffset(-5.134, -0.005)}
        receiveShadow
      />
      <EnvMesh
        url={`${FACILITY_BASE}/barrier_kaw1.stl`}
        material={FACILITY_GRAY}
        position={KAW_WALL_OFFSET}
        receiveShadow
      />
      <EnvMesh
        url={`${FACILITY_BASE}/barrier_kaw2.stl`}
        material={FACILITY_GRAY}
        position={KAW_WALL_OFFSET}
        receiveShadow
      />
      <EnvMesh
        url={`${FACILITY_BASE}/barrier_kaw3.stl`}
        material={FACILITY_GRAY}
        position={KAW_WALL_OFFSET}
        receiveShadow
      />
      <EnvMesh
        url={`${FACILITY_BASE}/ifarlab_ray.stl`}
        material={RAIL}
        receiveShadow
      />

      {/* Extra fence run: closes the open stretch along the top edge, from
          the existing barrier_closetable wall back over to the left
          (barrier_kaw) wall. */}
      <EnvMesh
        url={`${FACILITY_BASE}/barrier.stl`}
        material={FACILITY_GRAY}
        position={BARRIER_AT(-0.591, 3.594)}
        receiveShadow
      />
      <EnvMesh
        url={`${FACILITY_BASE}/barrier.stl`}
        material={FACILITY_GRAY}
        position={BARRIER_AT(-2.241, 3.594)}
        receiveShadow
      />

      {/* Corner + side fence where the mannequin used to stand -- turned 90
          degrees to run alongside the table, offset out from it so there's
          clearance to the aluminum table / conveyor. */}
      <EnvMesh
        url={`${FACILITY_BASE}/barrier.stl`}
        material={FACILITY_GRAY}
        position={BARRIER_AT(1.117, 3.594)}
        receiveShadow
      />
      <EnvMesh
        url={`${FACILITY_BASE}/barrier.stl`}
        material={FACILITY_GRAY}
        position={BARRIER_AT(1.7, 2.525, true)}
        rotation={[0, 0, Math.PI / 2]}
        receiveShadow
      />

      {/* Fence added in front of the conveyor */}
      <EnvMesh
        url={`${FACILITY_BASE}/barrier.stl`}
        material={FACILITY_GRAY}
        position={BARRIER_AT(1.7, -0.4, true)}
        rotation={[0, 0, Math.PI / 2]}
        receiveShadow
      />
      
    </Suspense>
  );
}

export default function EnvironmentElements({ showEnvironment = true, infeedOpening = false }) {
  if (!showEnvironment) return null;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <Furniture />
      <Facility infeedOpening={infeedOpening} />
    </group>
  );
}

import React, { useMemo, Suspense } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';
import { METAL, PAINT } from './scenePalette';

/*
 * The UR10e's own travelling mount (7th-axis linear carriage). The arm's
 * "ur10e_base_to_robot_mount" joint (see api/server.js) rides this carriage
 * along the fixed rail (EnvironmentElements' base_link.stl). The carriage's
 * raw STL center is only a few cm from base.stl's raw center, so re-using
 * UR10eRobot.js's own base.stl recentering offset lands it right under the
 * arm instead of at its unrelated resting spot on the rail.
 */

const MESH_SCALE = [0.001, 0.001, 0.001];
const MESH_URL = process.env.PUBLIC_URL + '/meshes/ur10e/linear_axis_moving_link.stl';
const RECENTER_OFFSET = [0.105561, -0.1260, -0.6445];
const CARRIAGE_MATERIAL = { ...METAL.aluminium };

// Neither the carriage nor the arm's own base.stl come with a mounting-plate
// mesh in the source package, and there's a real (small, ~2.5cm) gap between
// the carriage's own top and base.stl's own bottom once both are placed at
// their real raw-coordinate heights. This box just fills that measured gap
// so the arm doesn't sit with visible daylight under it -- there's no vendored
// xacro for this specific mount (unlike the AGV's manipulator_base_link), so
// the footprint is an estimate sized to base.stl's own cross-section, not a
// sourced dimension.
//
// Its X/Y must NOT reuse RECENTER_OFFSET's X/Y (0.105561, -0.1918) -- that's
// the carriage mesh's own recentering offset, not base.stl's. base.stl lives
// one extra parent group deeper in UR10eRobot.js (position [0.052439, 0.0768,
// ...]), and once that's folded in, base.stl's own raw footprint turns out to
// be centered almost exactly on that parent offset itself (0.052439, 0.0768)
// -- confirmed by placing both meshes' real STL geometry in a Three.js scene
// graph and reading off their world-space bounding boxes, rather than by eye.
// Using the carriage's own X/Y here (as the first version of this fix did)
// put the plate ~9-12cm off to the side of the base, not underneath it.
const PLATE_POSITION = [0.052439, 0.0768, 0.045575];
const PLATE_SIZE = [0.19, 0.19, 0.05];
const PLATE_MATERIAL = { ...PAINT.structure };

export default function UR10eMount() {
  const geometry = useLoader(STLLoader, MESH_URL);
  const prepared = useMemo(() => {
    if (!geometry.userData.__stlPrepared) {
      if (!geometry.attributes?.normal) geometry.computeVertexNormals();
      geometry.userData.__stlPrepared = true;
    }
    return geometry;
  }, [geometry]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <Suspense fallback={null}>
        <mesh geometry={prepared} scale={MESH_SCALE} position={RECENTER_OFFSET} castShadow receiveShadow>
          <meshStandardMaterial
            color={CARRIAGE_MATERIAL.color}
            metalness={CARRIAGE_MATERIAL.metalness}
            roughness={CARRIAGE_MATERIAL.roughness}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={PLATE_POSITION} castShadow receiveShadow>
          <boxGeometry args={PLATE_SIZE} />
          <meshStandardMaterial
            color={PLATE_MATERIAL.color}
            metalness={PLATE_MATERIAL.metalness}
            roughness={PLATE_MATERIAL.roughness}
          />
        </mesh>
      </Suspense>
    </group>
  );
}

import React, { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';

/*
 * Source: public/assets/bus/lift.glb -- a "Stylized_Industrial" mobile
 * construction lift/cage asset (7 meshes, one shared texture, no strays to
 * exclude, Blender-native export). Its own raw bounding box is 12.33 x 10.79
 * x 9.31 units; taken as meters (this generator's usual convention -- see
 * warehouse_blender.glb / drone.glb) that's an implausibly large lift, so
 * LIFT_SCALE brings it down to a still-substantial but warehouse-appropriate
 * ~5.5m footprint / ~4.9m tall.
 *
 * Almost all of the raw geometry sits at Y<0 (only the cage top pokes above
 * 0, up to +2.21), i.e. the model's own origin is already near its top --
 * convenient here, since that's exactly the point the ropes need to hang
 * from. So the whole scene is used as-is at that native origin, just scaled;
 * no recentering.
 *
 * Suspended rather than resting on the floor, per the ask: four vertical
 * cylinders run from a fixed ceiling height down to the lift's top. CEILING_Y
 * is a guess, not a measurement -- the roof here is a curved vault (see
 * Factory.js) and this file has no easy way to query its exact height at a
 * given X/Z, so this picks a value that should sit comfortably under the
 * roof near the building's center (where the lift is placed specifically to
 * keep well clear of the lower eaves out toward the side walls). If a rope
 * pokes through the roof when you look at it, lower CEILING_Y (or raise
 * DEFAULT_POSITION's own Y, which lowers the lift and lengthens the ropes
 * without moving the roof-crossing point).
 */
const LIFT_URL = process.env.PUBLIC_URL + '/assets/bus/lift.glb';
const LIFT_SCALE = 0.45;

const CEILING_Y = 8.5; // world-space, not relative to the group below
const ROPE_RADIUS = 0.02;
// Attachment points in the lift's own (already-scaled) local space, spread
// across the top platform's footprint.
const ROPE_POINTS = [
  [1.2, 1.0],
  [-1.2, 1.0],
  [1.2, -1.0],
  [-1.2, -1.0],
];

function Ropes({ groupY }) {
  // Rope run from the ceiling down to this group's own Y=0 (the lift's
  // near-top origin), so its length depends on where the group sits, not on
  // anything local to the lift mesh itself -- hence the world-space groupY
  // input rather than a local coordinate.
  const ropeLength = CEILING_Y - groupY;
  if (ropeLength <= 0) return null;

  return (
    <>
      {ROPE_POINTS.map(([x, z], i) => (
        <mesh key={i} position={[x, ropeLength / 2, z]} castShadow={false}>
          <cylinderGeometry args={[ROPE_RADIUS, ROPE_RADIUS, ropeLength, 8]} />
          <meshStandardMaterial color="#1c1c1e" roughness={0.8} metalness={0.1} />
        </mesh>
      ))}
    </>
  );
}

function LiftModel({ groupY }) {
  const { scene } = useGLTF(LIFT_URL);
  const clone = useMemo(() => scene.clone(true), [scene]);

  return (
    <>
      <primitive object={clone} scale={[LIFT_SCALE, LIFT_SCALE, LIFT_SCALE]} />
      <Ropes groupY={groupY} />
    </>
  );
}

useGLTF.preload(LIFT_URL);

const DEFAULT_POSITION = [7, 5, 7];

export default function Lift({ show = true, position = DEFAULT_POSITION }) {
  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <group position={position}>
        <LiftModel groupY={position[1]} />
      </group>
    </Suspense>
  );
}

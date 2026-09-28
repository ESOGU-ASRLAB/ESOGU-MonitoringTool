import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TeleportTarget, XROrigin, useXR, useXRControllerLocomotion } from '@react-three/xr';
import * as THREE from 'three';

/*
 * WALKING THE HALL IN A HEADSET.
 *
 * The headset owns the camera, so nothing here moves it. What moves is the
 * XROrigin -- the point on the floor the wearer's room is laid out around.
 * Their own height comes from the headset ('local-floor'), which is why there
 * is no eye height here as there is for the desktop walk.
 *
 *   left stick    walk, in the direction the head faces
 *   right stick   45 degree snap turn (smooth turning makes people sick)
 *   trigger       teleport along the arc onto the floor
 *   pinch         the same with hand tracking
 */

// Real walking pace is ~1.4 m/s; the desktop walk's 7.5 m/s is fine on a
// monitor and nauseating in a headset. This covers the 47 m hall in ~19 s,
// and the teleport arc is there for longer distances.
const WALK_SPEED = 2.5;
const SNAP_DEGREES = 45;
// Entering from the orbit view puts you this far back from what the view was
// centred on, on the same side, looking at it.
const SPAWN_DISTANCE = 8;
const WALL_MARGIN = 0.6;

const up = new THREE.Vector3(0, 1, 0);
const scratch = {
  head: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  offset: new THREE.Vector3(),
  stick: new THREE.Vector3(),
  level: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  yawQuat: new THREE.Quaternion(),
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
};

/*
 * The library turns the stick into a velocity with the head's FULL rotation,
 * pitch and roll included, and the caller keeps only x and z. So looking down
 * at the floor shrank the walk to a crawl (forward became mostly "down"), and
 * a tilted head bent the direction sideways. Undo the head rotation to get the
 * stick back, then turn it by the head's heading alone. YXZ order keeps that
 * heading stable even when looking straight down, where a projected forward
 * vector would collapse to nothing.
 */
function levelVelocity(velocity, camera, out) {
  camera.getWorldQuaternion(scratch.quat);
  scratch.stick.copy(velocity).applyQuaternion(scratch.quat.invert());
  camera.getWorldQuaternion(scratch.quat);
  scratch.euler.setFromQuaternion(scratch.quat, 'YXZ');
  scratch.yawQuat.setFromAxisAngle(up, scratch.euler.y);
  return out.set(scratch.stick.x, 0, scratch.stick.z).applyQuaternion(scratch.yawQuat);
}

function clampInside(value, min, max) {
  return THREE.MathUtils.clamp(value, min + WALL_MARGIN, max - WALL_MARGIN);
}

/*
 * Where the wearer starts: where the desktop view was. From the walk view that
 * is exactly where the walker stood; from the orbit view it is SPAWN_DISTANCE
 * short of the orbit target along the line of sight, on the floor -- the orbit
 * camera itself is usually metres up in the air.
 */
function spawnFrom(desktopCamera, walking, orbitTarget, bounds) {
  const dir = desktopCamera.getWorldDirection(scratch.dir).setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
  dir.normalize();
  const x = walking ? desktopCamera.position.x : orbitTarget[0] - dir.x * SPAWN_DISTANCE;
  const z = walking ? desktopCamera.position.z : orbitTarget[2] - dir.z * SPAWN_DISTANCE;
  return {
    x: clampInside(x, bounds.minX, bounds.maxX),
    z: clampInside(z, bounds.minZ, bounds.maxZ),
    // Rotating the origin by this turns its -z (where the wearer faces at the
    // start of the session) onto the view direction.
    yaw: Math.atan2(-dir.x, -dir.z),
  };
}

export default function VRWalk({ desktopCameraRef, walkingMode, orbitTarget, bounds }) {
  const originRef = useRef(null);
  const session = useXR((state) => state.session);
  // During a session this is the XR camera, parented to the origin.
  const camera = useThree((state) => state.camera);

  // Read at the moment the session starts, not on every walk-mode toggle.
  const entryRef = useRef({ walkingMode, orbitTarget, bounds });
  entryRef.current = { walkingMode, orbitTarget, bounds };

  useEffect(() => {
    const origin = originRef.current;
    const desktopCamera = desktopCameraRef.current;
    if (!session || !origin || !desktopCamera) return;
    const entry = entryRef.current;
    const spawn = spawnFrom(desktopCamera, entry.walkingMode, entry.orbitTarget, entry.bounds);
    origin.position.set(spawn.x, 0, spawn.z);
    origin.rotation.set(0, spawn.yaw, 0);
  }, [session, desktopCameraRef]);

  // Moves the origin so the HEAD, not the origin, lands on `point`. The
  // library's own offset ignores the origin's rotation, so after a snap turn it
  // put people up to a room-width away from where they aimed.
  const moveHeadTo = (x, z) => {
    const origin = originRef.current;
    camera.getWorldPosition(scratch.head);
    origin.position.x += x - scratch.head.x;
    origin.position.z += z - scratch.head.z;
  };

  useXRControllerLocomotion(
    (velocity, rotationY, delta) => {
      const origin = originRef.current;
      if (!origin) return;
      // On a snap-turn frame the library also pre-rotates the velocity, so that
      // one step is turned by the snap angle: ~3.5 cm at 72 Hz, not worth undoing.
      const level = levelVelocity(velocity, camera, scratch.level);
      origin.position.x += level.x * delta;
      origin.position.z += level.z * delta;
      if (rotationY) {
        // Turn about the head, not the origin: a wearer standing a metre off
        // the middle of their play space would otherwise be swung sideways.
        camera.getWorldPosition(scratch.head);
        scratch.offset.subVectors(origin.position, scratch.head).applyAxisAngle(up, rotationY);
        origin.position.x = scratch.head.x + scratch.offset.x;
        origin.position.z = scratch.head.z + scratch.offset.z;
        origin.rotation.y += rotationY;
      }
    },
    { speed: WALK_SPEED },
    { type: 'snap', degrees: SNAP_DEGREES },
  );

  // The walls. Checked on the head rather than the origin, so walking there
  // physically in the play space stops at the cladding as well.
  useFrame(() => {
    const origin = originRef.current;
    if (!session || !origin) return;
    camera.getWorldPosition(scratch.head);
    origin.position.x += clampInside(scratch.head.x, bounds.minX, bounds.maxX) - scratch.head.x;
    origin.position.z += clampInside(scratch.head.z, bounds.minZ, bounds.maxZ) - scratch.head.z;
  });

  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  return (
    <>
      <XROrigin ref={originRef} />
      <TeleportTarget onTeleport={(_, event) => moveHeadTo(event.point.x, event.point.z)}>
        {/* The hall floor as a teleport surface. It draws nothing -- no colour,
            no depth -- so the real floor under it renders untouched. */}
        <mesh
          rotation-x={-Math.PI / 2}
          position={[(bounds.minX + bounds.maxX) / 2, 0.02, (bounds.minZ + bounds.maxZ) / 2]}
        >
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial colorWrite={false} depthWrite={false} />
        </mesh>
      </TeleportTarget>
    </>
  );
}

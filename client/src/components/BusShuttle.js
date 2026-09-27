import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import Bus from './Bus';
import { busPose } from './busRoute';

/*
 * One of the two buses trading bays (busRoute.js). `startsInA` says which bay
 * it holds when the page opens. The bus model's nose is its +x, so it is drawn
 * unturned and the group carries the yaw.
 */
export default function BusShuttle({ livery, startsInA }) {
  const groupRef = useRef(null);
  // Signed distance rolled, for the wheels: movement along the bus's own nose
  // direction counts forward, backing up counts negative.
  const rollRef = useRef(0);
  const lampRef = useRef('off');

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const pose = busPose(startsInA, clock.getElapsedTime());
    let rolled = 0;
    if (pose.visible && group.visible) {
      const dx = pose.x - group.position.x;
      const dz = pose.z - group.position.z;
      rolled = dx * Math.cos(pose.yaw) - dz * Math.sin(pose.yaw);
      rollRef.current += rolled;
    }
    lampRef.current = rolled > 1e-4 ? 'forward' : rolled < -1e-4 ? 'reverse' : 'off';
    group.position.set(pose.x, 0, pose.z);
    group.rotation.y = pose.yaw;
    group.visible = pose.visible;
  });

  return (
    <group ref={groupRef}>
      <Bus position={[0, 0, 0]} rotation={0} livery={livery} rollRef={rollRef} lampRef={lampRef} />
    </group>
  );
}

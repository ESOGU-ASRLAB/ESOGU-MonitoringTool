import React from 'react';
import UR10eRobot from './UR10eRobot';
import KawasakiRobot from './KawasakiRobot';
import UR10eMount from './UR10eMount';
import AGVBase from './AGVBase';
import EnvironmentElements from './EnvironmentElements';
import { IfarlabCabinet } from './ServerCabinets';
import { OTOKAR_PICK_OFFSET } from './cellLayout';

// The only UR/Kawasaki pair driven by MongoDB joint telemetry. No task
// controller or synthetic motion is mounted in this station.
export default function OtokarPickPlace({ jointAngles, kawasakiAngles, railPosition, agvRailPosition, urToolRef, kawToolRef }) {
  return <group name="cell-monitoring" position={OTOKAR_PICK_OFFSET}>
    <group name="live-ur10e" position={[-.147, .58635, -railPosition]}>
      <UR10eMount />
      <UR10eRobot jointAngles={jointAngles} toolRef={urToolRef} telemetryId="ur10e" />
    </group>
    <group name="live-kawasaki" position={[-2.301949, .17, -agvRailPosition]} rotation={[0, Math.PI / 2, 0]}>
      <AGVBase />
      <group position={[.001, .263, .26]} rotation={[0, Math.PI, 0]}>
        <KawasakiRobot jointAngles={kawasakiAngles} toolRef={kawToolRef} telemetryId="kawasaki" />
      </group>
    </group>
    <EnvironmentElements />
    <IfarlabCabinet />
  </group>;
}

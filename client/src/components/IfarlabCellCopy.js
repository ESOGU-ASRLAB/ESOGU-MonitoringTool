import React, { useMemo, useRef } from 'react';
import UR10eRobot from './UR10eRobot';
import KawasakiRobot from './KawasakiRobot';
import AGVBase from './AGVBase';
import UR10eMount from './UR10eMount';
import EnvironmentElements from './EnvironmentElements';
import WindowPlatform from './WindowPlatform';
import WindowUsecaseTasks from './WindowUsecaseTasks';
import { IfarlabCabinet } from './ServerCabinets';
import { IFARLAB_COPY_OFFSET } from './cellLayout';

// The north cell has its own work program: fastening on the work table and door
// inspection. It shares the original cell's physical layout, not its controls.
export default function IfarlabCellCopy({ active, inVR = false, assistantToolRef, assistantActiveRef }) {
  const urGroupRef = useRef(null);
  const agvGroupRef = useRef(null);
  const urJointsRef = useRef(null);
  const urDriveRef = useRef(null);
  const kawJointsRef = useRef(null);
  const kawToolRef = useRef(null);
  const kawDriveRef = useRef(null);
  const spinRef = useRef(false);
  const screwLoadedRef = useRef(false);
  const ur = useMemo(() => ({
    groupRef: urGroupRef, jointsRef: urJointsRef, toolRef: assistantToolRef, driveRef: urDriveRef,
  }), [assistantToolRef]);
  const kawasaki = useMemo(() => ({
    groupRef: agvGroupRef, jointsRef: kawJointsRef, toolRef: kawToolRef, driveRef: kawDriveRef,
  }), []);

  return (
    <group position={IFARLAB_COPY_OFFSET}>
      <group ref={urGroupRef} position={[-0.147, 0.58635, -0.25]}>
        <UR10eMount />
        <UR10eRobot
          jointAngles={[0, -95, 100, -95, -90, 0]}
          jointsRef={urJointsRef}
          toolRef={assistantToolRef}
          driveRef={urDriveRef}
          toolMode="screwdriver"
          screwdriverSpinRef={spinRef}
          screwLoadedRef={screwLoadedRef}
          variant="north"
          reportTelemetry={false}
        />
      </group>
      <group ref={agvGroupRef} position={[-2.301949, 0.17, -0.48]} rotation={[0, Math.PI / 2, 0]}>
        <AGVBase />
        <group position={[0.001, 0.263, 0.26]} rotation={[0, Math.PI, 0]}>
          <KawasakiRobot
            jointAngles={[0, 20, -30, 0, 45, 0]}
            jointsRef={kawJointsRef}
            toolRef={kawToolRef}
            driveRef={kawDriveRef}
            variant="north"
            reportTelemetry={false}
          />
        </group>
      </group>
      <EnvironmentElements showChassis={false} workTableOpening={inVR} />
      <WindowPlatform />
      <WindowUsecaseTasks active={active} ur={ur} kawasaki={kawasaki} spinRef={spinRef} screwLoadedRef={screwLoadedRef} assistantActiveRef={assistantActiveRef} />
      <IfarlabCabinet />
    </group>
  );
}

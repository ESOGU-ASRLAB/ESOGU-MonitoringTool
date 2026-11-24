import React, { useEffect, useMemo, useRef } from 'react';
import UR10eRobot from './UR10eRobot';
import KawasakiRobot from './KawasakiRobot';
import AGVBase from './AGVBase';
import UR10eMount from './UR10eMount';
import EnvironmentElements from './EnvironmentElements';
import WindowPlatform from './WindowPlatform';
import WindowUsecaseTasks from './WindowUsecaseTasks';
import DoorFasteningTasks from './DoorFasteningTasks';
import DualDoorInspectionTasks, { CHASSIS_INSPECTION_HOME } from './DualDoorInspectionTasks';
import { IfarlabCabinet } from './ServerCabinets';
import CellDressing from './CellDressing';
import { CELL_SCENARIOS } from './cellScenarios';
import { FEED_TOOLS, registerFeedTool } from './RobotCameraFeeds';
import { IFARLAB_COPY_OFFSET } from './cellLayout';

// The copies of the original cell's physical layout, each with its own work
// program (`scenario`, see cellScenarios.js), not the original's controls:
//   screwdriving  north cell: a part off the conveyor, screwed on the table
//   door          a fitting off the conveyor, mounted and screwed on the door
//   inspection    both arms inspect the two door leaves
export default function IfarlabCellCopy({
  active, inVR = false, offset = IFARLAB_COPY_OFFSET, scenario = 'screwdriving',
  assistantHandleRef, assistantActiveRef, operatorRef,
}) {
  const urGroupRef = useRef(null);
  const agvGroupRef = useRef(null);
  const urJointsRef = useRef(null);
  const urToolRef = useRef(null);
  const urDriveRef = useRef(null);
  const kawJointsRef = useRef(null);
  const kawToolRef = useRef(null);
  const kawDriveRef = useRef(null);
  const spinRef = useRef(false);
  const screwLoadedRef = useRef(false);
  const productHeldRef = useRef(false);
  const inspecting = scenario === 'inspection';
  const { livery, number } = CELL_SCENARIOS[scenario];
  // The panel lists these arms numbered by their cell, after the original
  // cell's two (ControlPanel.js): readouts and the camera feed.
  const tag = String(number).padStart(2, '0');
  useEffect(() => {
    registerFeedTool(`ur10e-${tag}`, { ref: urToolRef, ...FEED_TOOLS.ur10e });
    registerFeedTool(`kawasaki-${tag}`, { ref: kawToolRef, ...FEED_TOOLS.kawasaki });
    return () => {
      registerFeedTool(`ur10e-${tag}`, null);
      registerFeedTool(`kawasaki-${tag}`, null);
    };
  }, [tag]);
  const ur = useMemo(() => ({
    groupRef: urGroupRef, jointsRef: urJointsRef, toolRef: urToolRef, driveRef: urDriveRef,
  }), []);
  const kawasaki = useMemo(() => ({
    groupRef: agvGroupRef, jointsRef: kawJointsRef, toolRef: kawToolRef, driveRef: kawDriveRef,
  }), []);

  return (
    <group name={`cell-${scenario}`} position={offset}>
      <group name={`ur10e-${scenario}`} ref={urGroupRef} position={[-0.147, 0.58635, -(inspecting ? CHASSIS_INSPECTION_HOME.ur.rail : .25)]}>
        <UR10eMount />
        <UR10eRobot
          jointAngles={inspecting ? CHASSIS_INSPECTION_HOME.ur.angles : [0, -95, 100, -95, -90, 0]}
          jointsRef={urJointsRef}
          toolRef={urToolRef}
          driveRef={urDriveRef}
          toolMode={inspecting ? 'inspection' : 'screwdriver'}
          screwdriverSpinRef={spinRef}
          screwLoadedRef={screwLoadedRef}
          productHeldRef={productHeldRef}
          livery={livery}
          telemetryId={`ur10e-${tag}`}
        />
      </group>
      <group ref={agvGroupRef} position={[-2.301949, 0.17, -(inspecting ? CHASSIS_INSPECTION_HOME.kawasaki.rail : .48)]} rotation={[0, Math.PI / 2, 0]}>
        <AGVBase />
        <group position={[0.001, 0.263, 0.26]} rotation={[0, Math.PI, 0]}>
          <KawasakiRobot
            jointAngles={inspecting ? CHASSIS_INSPECTION_HOME.kawasaki.angles : [0, 20, -30, 0, 45, 0]}
            jointsRef={kawJointsRef}
            toolRef={kawToolRef}
            driveRef={kawDriveRef}
            toolMode={inspecting || scenario === 'door' ? 'inspection' : 'gripper'}
            livery={livery}
            telemetryId={`kawasaki-${tag}`}
          />
        </group>
      </group>
      {/* The headset's screw-driving station is at the north cell's table. */}
      <EnvironmentElements showChassis={inspecting} chassisName={inspecting ? "guide-inspection-panel" : undefined} workTableOpening={scenario === 'screwdriving' && inVR} />
      {!inspecting && <WindowPlatform name={`guide-${scenario}-panel`} />}
      {scenario === 'inspection' && <DualDoorInspectionTasks active={active} ur={ur} kawasaki={kawasaki} />}
      {scenario === 'screwdriving' && (
        <WindowUsecaseTasks active={active} operator={!inVR} ur={ur} kawasaki={kawasaki} spinRef={spinRef} screwLoadedRef={screwLoadedRef} productHeldRef={productHeldRef} assistantHandleRef={assistantHandleRef} assistantActiveRef={assistantActiveRef} />
      )}
      {scenario === 'door' && (
        <DoorFasteningTasks active={active} ur={ur} kawasaki={kawasaki} spinRef={spinRef} screwLoadedRef={screwLoadedRef} productHeldRef={productHeldRef} assistantActiveRef={assistantActiveRef} operatorRef={operatorRef} />
      )}
      <IfarlabCabinet />
      <CellDressing running={active} />
    </group>
  );
}

import React, { Suspense, useCallback, useState } from 'react';
import AssemblyStation from './AssemblyStation';
import EmergencyStopStation from './EmergencyStopStation';
import PickPlaceStation from './PickPlaceStation';
import SafetyGearStation from './SafetyGearStation';
import ScrewDrivingStation from './ScrewDrivingStation';
import { useXRHands } from './xrHands';
import { IS_TEST_HOST } from '../xrSession';

/*
 * HANDS-ON TRAINING, IN THE HEADSET ONLY.
 *
 * Mounted by DigitalTwin while a session runs; the web page never sees it.
 * Four stations stand along the front of the IFARLAB cell, west to east,
 * each with a start button that appears as the wearer walks up:
 *
 *   Assemble the arm   take a UR10e apart piece by piece and build it again
 *                      (AssemblyStation.js)
 *   Pick & place       hand the UR10e boxes; it picks and sets each one down
 *                      (PickPlaceStation.js)
 *   Emergency stop     stop the cell the moment its light turns red, then
 *                      release and reset it (EmergencyStopStation.js)
 *   Safety gear        put on helmet, glasses, ear defenders and vest
 *                      (SafetyGearStation.js)
 * The north cell has a fifth station for placing and driving four screws
 * on its work table (ScrewDrivingStation.js).
 *
 * Every move is spelled out as it comes, with arrows (guide.js). One station
 * runs at a time; the others' buttons wait.
 */
export default function TrainingStations() {
  const hands = useXRHands();
  const [running, setRunning] = useState(null);
  const onRunning = useCallback((id) => (on) => setRunning((current) => (on ? id : current === id ? null : current)), []);
  const handlers = React.useMemo(() => ({
    assembly: onRunning('assembly'), pick: onRunning('pick'), estop: onRunning('estop'), gear: onRunning('gear'),
    screw: onRunning('screw'),
  }), [onRunning]);
  const busy = (id) => running !== null && running !== id;
  // Automated emulator runs read the hands; never on production.
  if (IS_TEST_HOST) window.__trainingHands = hands;

  return (
    <>
      <PickPlaceStation hands={hands} busy={busy('pick')} onRunning={handlers.pick} />
      <EmergencyStopStation hands={hands} busy={busy('estop')} onRunning={handlers.estop} />
      <SafetyGearStation hands={hands} busy={busy('gear')} onRunning={handlers.gear} />
      <ScrewDrivingStation hands={hands} busy={busy('screw')} onRunning={handlers.screw} />
      <Suspense fallback={null}>
        <AssemblyStation hands={hands} busy={busy('assembly')} onRunning={handlers.assembly} />
      </Suspense>
    </>
  );
}

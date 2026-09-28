import React, { Suspense, useCallback, useState } from 'react';
import AssemblyStation from './AssemblyStation';
import PickPlaceStation from './PickPlaceStation';
import { useXRHands } from './xrHands';
import { IS_TEST_HOST } from '../xrSession';

/*
 * HANDS-ON TRAINING, IN THE HEADSET ONLY.
 *
 * Mounted by DigitalTwin while a session runs; the web page never sees it.
 * Two stations stand in front of the IFARLAB cell, each with a start button
 * that appears as the wearer walks up:
 *
 *   Pick & place       hand the UR10e boxes; it picks and sets each one down
 *                      (PickPlaceStation.js)
 *   Assemble the arm   take a UR10e apart piece by piece and build it again
 *                      (AssemblyStation.js)
 *
 * No question cards: the headset's first test asked for doing, not reading.
 * One station runs at a time; the other's button waits.
 */
export default function TrainingStations() {
  const hands = useXRHands();
  const [running, setRunning] = useState(null);
  const pickRunning = useCallback((on) => setRunning(on ? 'pick' : null), []);
  const assemblyRunning = useCallback((on) => setRunning(on ? 'assembly' : null), []);
  // Automated emulator runs read the hands; never on production.
  if (IS_TEST_HOST) window.__trainingHands = hands;

  return (
    <>
      <PickPlaceStation hands={hands} busy={running === 'assembly'} onRunning={pickRunning} />
      <Suspense fallback={null}>
        <AssemblyStation hands={hands} busy={running === 'pick'} onRunning={assemblyRunning} />
      </Suspense>
    </>
  );
}

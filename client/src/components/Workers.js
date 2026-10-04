import React from 'react';
import Worker from './Worker';
import { IFARLAB_COPY_OFFSET, IFARLAB_DOOR_OFFSET, IFARLAB_OFFSET } from './cellLayout';

/*
 * Five workers, one at each machine that needs an operator, each moving
 * between a few stations around it with her own rhythm (Worker.js):
 *
 *   1  the Otokar gantries' south end
 *   2  the Otokar gantries' north end
 *   3  the IFARLAB workcell (x 2.90..7.93, z 7.36..12.13), far side
 *   4  the north workcell, steadying the UR10e at the work table
 *   5  the door-fastening workcell, steadying the UR10e at the car door
 *
 * The north fastening operator stands still and takes the driver's side
 * handle while each screw goes in; in a headset she walks the cell's far side
 * instead, leaving the table to the screw-driving station. The door cell's
 * operator kits its parts: her cell's program walks her from the tote to the
 * conveyor and back in step with the robot (DoorFasteningTasks.js), and with
 * the cell stopped she stands at her place below.
 *
 * The hall's other people have jobs of their own: the scrubber operator
 * (FloorCleaner.js) and the forklift driver (Forklift.js). Every station and
 * the walk between them stays outside the robots' swept volumes, the forklift
 * aisle and both buses' routes (busRoute.js).
 */
export const WORKERS = Object.freeze([
  {
    seed: 11,
    stations: [
      { at: [-5.6, -13.0], look: [-4.2, -9.6] },
      { at: [-3.6, -13.2], look: [-3.0, -9.6] },
      { at: [-2.6, -12.2], look: [-1.2, -9.4] },
    ],
  },
  {
    seed: 23,
    stations: [
      { at: [-5.9, 8.9], look: [-4.2, 6.4] },
      { at: [-3.3, 8.9], look: [-2.6, 6.4] },
      { at: [-4.6, 10.2], look: [-4.6, 6.9] },
    ],
  },
  {
    seed: 37,
    // The UR10e's operator: always on its teach pendant.
    modes: ['pendant'],
    stations: [
      // Behind the cell, on the far-wall side, so from the opening camera she
      // works beyond the robots rather than standing in front of them.
      { at: [3.8, 6.7], look: [4.4, 8.6] },
      { at: [5.4, 6.6], look: [5.4, 8.6] },
      { at: [7.0, 6.7], look: [6.6, 8.6] },
    ],
  },
  {
    seed: 47,
    modes: ['observe'],
    // Beside the work table, far enough inside the east fence for both elbows
    // and close enough to reach all four screw positions on the support bar.
    stations: [{
      at: [IFARLAB_COPY_OFFSET[0] + 1.27, IFARLAB_COPY_OFFSET[2] - 2.45],
      look: [IFARLAB_COPY_OFFSET[0] + 0.7, IFARLAB_COPY_OFFSET[2] - 2.45],
    }],
    vrStations: [
      { at: [3.8, 6.7], look: [4.4, 8.6] },
      { at: [5.4, 6.6], look: [5.4, 8.6] },
      { at: [7.0, 6.7], look: [6.6, 8.6] },
    ].map(({ at, look }) => ({
      at: [at[0], at[1] + IFARLAB_COPY_OFFSET[2] - IFARLAB_OFFSET[2]],
      look: [look[0], look[1] + IFARLAB_COPY_OFFSET[2] - IFARLAB_OFFSET[2]],
    })),
  },
  {
    seed: 59,
    modes: ['observe'],
    // Her place, east of the conveyor, watching the fitting on the door
    // (DoorFasteningTasks.js SPOTS.watch).
    stations: [{
      at: [IFARLAB_DOOR_OFFSET[0] + 1.4, IFARLAB_DOOR_OFFSET[2] - 1.05],
      look: [IFARLAB_DOOR_OFFSET[0] - 0.825, IFARLAB_DOOR_OFFSET[2] - 0.85],
    }],
  },
]);

export default function Workers({ inVR = false, tableAssist, doorAssist }) {
  return WORKERS.map(({ vrStations, ...worker }) => {
    const walking = inVR && vrStations;
    const assist = { 47: walking ? null : tableAssist }[worker.seed];
    return (
      <Worker
        key={`${worker.seed}:${walking ? 'vr' : 'floor'}`}
        {...worker}
        stations={walking ? vrStations : worker.stations}
        assistTargetRef={assist?.handleRef}
        assistActiveRef={assist?.activeRef}
        scriptRef={worker.seed === 59 ? doorAssist?.operatorRef : undefined}
      />
    );
  });
}

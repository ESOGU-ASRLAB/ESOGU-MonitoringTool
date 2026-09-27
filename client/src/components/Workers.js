import React from 'react';
import Worker from './Worker';

/*
 * Three workers, one at each machine that needs an operator, each moving
 * between a few stations around it with her own rhythm (Worker.js):
 *
 *   1  the Otokar gantries' south end
 *   2  the Otokar gantries' north end
 *   3  the IFARLAB workcell (x 2.90..7.93, z 7.36..12.13), far side
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
]);

export default function Workers() {
  return WORKERS.map((worker) => <Worker key={worker.seed} {...worker} />);
}

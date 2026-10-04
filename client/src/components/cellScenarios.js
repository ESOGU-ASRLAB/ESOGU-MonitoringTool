import { ROBOT_LIVERY } from './scenePalette';

/*
 * The four IFARLAB cells share one physical layout and run four programs. For
 * a presentation each needs to be named and recognisable from across the
 * hall, so every cell has its name tag over it (CellLabel.js, switched from
 * the view controls) and its two robots wear one livery.
 *
 *   pickPlace     the original cell (IfarlabTasks.js)
 *   screwdriving  north cell, part screwed on the table (WindowUsecaseTasks.js)
 *   inspection    north-east cell, both door faces (DualDoorInspectionTasks.js)
 *   door          east cell, fitting fixed to the car door (DoorFasteningTasks.js)
 */
export const CELL_SCENARIOS = Object.freeze({
  pickPlace: Object.freeze({
    number: 1,
    title: 'Pick & Place',
    livery: ROBOT_LIVERY.graphite,
  }),
  screwdriving: Object.freeze({
    number: 2,
    title: 'Screwdriving',
    livery: ROBOT_LIVERY.orange,
  }),
  inspection: Object.freeze({
    number: 3,
    title: 'Dual Robot',
    livery: ROBOT_LIVERY.white,
  }),
  door: Object.freeze({
    number: 4,
    title: 'Assembly',
    livery: ROBOT_LIVERY.yellow,
  }),
});

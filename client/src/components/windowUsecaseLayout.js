import { IFARLAB_COPY_OFFSET } from './cellLayout';

// CAD frame: metres, Z-up. The north cell group converts (x, y, z) to
// world (x, z, -y). Shared by the automatic task and the VR station.
export const TABLE_TOP = 0.855;
export const SCREW_POINTS = Object.freeze([[0.535, 2.25], [0.855, 2.25], [0.535, 2.65], [0.855, 2.65]]);
export const SCREW_FEEDER = Object.freeze([0.44, 2.055]);
export const SCREW_SUPPLY = Object.freeze(SCREW_POINTS.map((_, i) => [0.39 + (i % 2) * 0.085, 2.015 + Math.floor(i / 2) * 0.075]));
export const windowCellWorld = (x, y, height) => [IFARLAB_COPY_OFFSET[0] + x, height, IFARLAB_COPY_OFFSET[2] - y];

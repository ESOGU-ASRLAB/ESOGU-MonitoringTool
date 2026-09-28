import { OTOKAR_AXES } from './otokarAxes';
import { ifarlab, inspection } from './inspectionState';
import { readTelemetry } from './robotTelemetry';

/*
 * WHAT EACH MACHINE IS, AND WHAT IT IS DOING NOW.
 *
 * One description per robot for the info panel (RobotInfo.js) and the
 * Documentation page, so the two cannot drift apart. The static part is the
 * datasheet; the live part is read on demand from the same places the rest of
 * the page reads it: the telemetry store (robotTelemetry.js) for axis values
 * and the shared task state (inspectionState.js) for what the cell is doing.
 */

export const UR10E_SPECS = [
  ['Payload', '12.5 kg'],
  ['Reach', '1300 mm'],
  ['Degrees of freedom', '6 rotating joints (+ linear rail, 0 to 2.4 m in this cell)'],
  ['Pose repeatability', '± 0.05 mm'],
  ['Joint range', '± 360° on all joints'],
  ['Joint speed', 'Base and shoulder 120 °/s, elbow and wrists 180 °/s'],
  ['Weight', '33.5 kg'],
  ['Sensing', 'Built-in force/torque sensor at the tool flange'],
  ['Task', 'Pick and place: detects a box on the conveyor, grips it and sets it on the table'],
];

export const KAWASAKI_SPECS = [
  ['Payload', '5 kg'],
  ['Maximum reach', '705 mm'],
  ['Degrees of freedom', '6 rotating joints (+ AGV on its rail)'],
  ['Pose repeatability', '± 0.03 mm'],
  ['Mobile base', 'OTA AGV, differential drive with casters'],
  ['Task', 'Chassis inspection: scans the outside, reaches in through the upper bay, scans inside and withdraws'],
];

const JOINT_NAMES = ['Base', 'Shoulder', 'Elbow', 'Wrist 1', 'Wrist 2', 'Wrist 3'];
const ARM_AXES = JOINT_NAMES.map((name, i) => ({ label: `J${i + 1} ${name}`, unit: '°', digits: 1 }));
const GANTRY_AXES = OTOKAR_AXES.map((axis) => ({
  label: `${axis.deckName} ${axis.label}`,
  unit: axis.unit === 'mm' ? ' mm' : '°',
  digits: axis.unit === 'mm' ? 0 : 1,
}));

const OTOKAR_SPECS = [
  ['Axes', '3 linear + 2 rotary, nested rail → column → arm → wrist → camera'],
  ['Rail travel', `${(OTOKAR_AXES[0].max / 1000).toFixed(2)} m`],
  ['Camera head', 'Basler ace, Intel RealSense D455, SICK DT35'],
];

// PICKING -> Picking
const readable = (state) => (state ? state.charAt(0) + state.slice(1).toLowerCase() : 'Idle');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function otokarTask() {
  return [
    `Inspection: ${readable(inspection.status)} · ${Math.round(inspection.progress * 100)}%`,
    `Body #${inspection.cycle} · ${plural(inspection.defects, 'defect')} found`,
  ];
}

export const ROBOTS = {
  ur10e: {
    name: 'UR10e',
    maker: 'Universal Robots',
    role: 'Collaborative 6-axis arm on a linear 7th axis',
    description:
      'Picks boxes off the conveyor with a 2-finger gripper, guided by the SICK camera on its flange, and sets them on the table.',
    specs: UR10E_SPECS,
    keySpecs: ['Payload', 'Reach', 'Pose repeatability', 'Joint speed'],
    axes: ARM_AXES,
    streamed: true,
    task: () => [`Task: ${readable(ifarlab.ur)}`, `Boxes moved: ${ifarlab.picks}`],
    docs: '/docs#ur10e',
  },
  kawasaki: {
    name: 'Kawasaki RS005L',
    maker: 'Kawasaki Robotics',
    role: 'Compact 6-axis arm on an OTA AGV',
    description:
      'Rides its floor rail on the AGV to the chassis, scans the outside, reaches in through the upper bay to scan inside, then withdraws.',
    specs: KAWASAKI_SPECS,
    keySpecs: ['Payload', 'Maximum reach', 'Pose repeatability', 'Mobile base'],
    axes: ARM_AXES,
    streamed: true,
    task: () => [`Task: ${readable(ifarlab.kawasaki)}`, `Bays scanned: ${ifarlab.scans} · ${plural(ifarlab.findings, 'finding')}`],
    docs: '/docs#kawasaki',
  },
  robot1: {
    name: 'Otokar R1',
    maker: 'Otokar · MATISSE inspection cell',
    role: '5-axis gantry robot, underbody scan',
    description:
      'Column low, arm extended under the floor pan and camera turned up; slides along the bus body while it scans the underbody.',
    specs: OTOKAR_SPECS,
    keySpecs: OTOKAR_SPECS.map(([key]) => key),
    axes: GANTRY_AXES,
    streamed: false,
    task: otokarTask,
    docs: '/docs#otokar',
  },
  robot2: {
    name: 'Otokar R2',
    maker: 'Otokar · MATISSE inspection cell',
    role: '5-axis gantry robot, roof scan',
    description:
      'Reaches through the window band into the cabin with the camera turned up at the roof; pans, nods, rises and traces rings on the roof panel.',
    specs: OTOKAR_SPECS,
    keySpecs: OTOKAR_SPECS.map(([key]) => key),
    axes: GANTRY_AXES,
    streamed: false,
    task: otokarTask,
    docs: '/docs#otokar',
  },
};

/*
 * How the machine is being driven right now. The demo program wins over
 * everything (DigitalTwin skips live updates while it runs); the IFARLAB arms
 * follow the MongoDB stream when it is live; otherwise the sliders drive them.
 */
export function driveMode(id, { animate, liveStatus }) {
  if (animate) return { label: 'Demo program', tone: 'demo' };
  if (ROBOTS[id].streamed && liveStatus === 'live') return { label: 'Live telemetry', tone: 'live' };
  return { label: 'Manual control', tone: 'manual' };
}

/** Everything the panel shows for one robot, as plain strings, at this instant. */
export function snapshotInfo(id, context) {
  const robot = ROBOTS[id];
  const values = readTelemetry(id) || [];
  return {
    ...robot,
    mode: driveMode(id, context),
    taskLines: robot.task(),
    axisRows: robot.axes.map((axis, i) => [
      axis.label,
      Number.isFinite(values[i]) ? `${values[i].toFixed(axis.digits)}${axis.unit}` : '–',
    ]),
    specRows: robot.specs.filter(([key]) => robot.keySpecs.includes(key)),
  };
}

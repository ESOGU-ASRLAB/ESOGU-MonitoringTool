// Permanent display outside the robot cells and clear of the bus shuttle's
// front cross-aisle (z ~19). Every entry has its own real scene anchor.
export const SHOWCASE_ORIGIN = Object.freeze([-4.1, 0, 14.8]);
export const SHOWCASE_TOP = .94;
export const SHOWCASE_ITEMS = Object.freeze([
  { topic: 'quick-changer', shot: 'quickChanger', anchor: 'guide-equipment-changer', x: -2.4, title: 'Dual Quick Changer', short: 'Quick Changer', kind: 'illustration' },
  { topic: 'gripper', shot: 'gripper', anchor: 'guide-equipment-gripper', x: -1.2, title: 'OnRobot 2FG14', short: '2FG14', kind: 'project-mesh' },
  { topic: 'vacuum', shot: 'vacuum', anchor: 'guide-equipment-vacuum', x: 0, title: 'OnRobot VGC10', short: 'VGC10', kind: 'illustration' },
  { topic: 'visionary', shot: 'visionary', anchor: 'guide-equipment-visionary', x: 1.2, title: 'SICK Visionary-T Mini', short: 'Visionary-T', kind: 'project-mesh' },
  { topic: 'sensingcam', shot: 'sensingcam', anchor: 'guide-equipment-sec100', x: 2.4, title: 'SICK sensingCam SEC100', short: 'SEC100', kind: 'illustration' },
]);
export const SHOWCASE_BY_TOPIC = Object.fromEntries(SHOWCASE_ITEMS.map((item) => [item.topic, item]));

/*
 * The Otokar body inspection's live state, shared between the scene that runs
 * it (BodyInspection.js) and the hall monitor that reports it (HallMonitor.js).
 *
 * A plain mutable object rather than React state: it changes every frame, and
 * neither reader re-renders on it -- the scene draws from it in useFrame and
 * the monitor repaints its canvas twice a second.
 */
export const inspection = {
  status: 'SCANNING', // 'SCANNING' | 'COMPLETE' | 'IDLE'
  progress: 0, // 0..1 of the body's length covered by either camera
  defects: 0,
  cycle: 1, // body number, counting completed inspections
};

// The IFARLAB workcell's jobs (IfarlabTasks.js).
export const ifarlab = {
  ur: 'IDLE', // what the UR10e is doing, for the monitor
  picks: 0, // boxes moved conveyor -> table
  kawasaki: 'IDLE',
  scans: 0, // chassis bays inspected by the Kawasaki
  findings: 0,
};

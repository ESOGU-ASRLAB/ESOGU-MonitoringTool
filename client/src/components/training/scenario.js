/*
 * THE HEADSET TRAINING MODULES, AS DATA.
 *
 * TrainingMode.js walks a module step by step. Each step is one of:
 *
 *   intro   text and a button to go on
 *   goto    walk to a ring on the floor: { x, z, radius } in hall metres
 *   select  point at a robot and pull the trigger: robots = accepted ids
 *           (ur10e, kawasaki, robot1, robot2 -- the RobotInfo targets)
 *   quiz    one question, several answers; `answer` is the right one's index
 *   outro   the summary at the end
 *
 * Facts in the questions come from the same datasheets as the robot panels
 * (robotDetails.js) and the technical guide. Positions were read off the
 * scene: the IFARLAB cell spans x 2.9..7.9, z 7.4..12.1; the Otokar gantries'
 * north end is around z 8, with their operator standing at z ~9-10.
 */

export const ORIENTATION = {
  id: 'orientation',
  title: 'Hall orientation',
  steps: [
    {
      kind: 'intro',
      title: 'Welcome to the MATISSE hall',
      text: 'This short training takes you through the two robot cells. Follow the blue markers, point at machines and pull the trigger to learn about them, and answer a few questions on the way.',
      button: 'Start',
    },
    {
      kind: 'goto',
      title: 'Walk to the IFARLAB workcell',
      text: 'Push the left stick to walk, or push the right stick forward to aim a teleport and let go. Stop on the blue ring in front of the fenced cell.',
      target: { x: 5.4, z: 13.6, radius: 1.3 },
    },
    {
      kind: 'intro',
      title: 'Safety first',
      text: 'The workcell is fenced and guarded by a light curtain. While the robots run, stay outside the fence: breaking the curtain stops the cell.',
      button: 'Understood',
    },
    {
      kind: 'select',
      title: 'Meet the UR10e',
      text: 'Point at the robot arm riding on the rail and pull the trigger to open its details.',
      robots: ['ur10e'],
    },
    {
      kind: 'quiz',
      title: 'Quick check',
      question: 'How much can the UR10e carry?',
      options: ['5 kg', '12.5 kg', '50 kg'],
      answer: 1,
      explain: 'Its payload is 12.5 kg: plenty for the boxes it moves from the conveyor to the table.',
    },
    {
      kind: 'select',
      title: 'Meet the Kawasaki RS005L',
      text: 'Point at the smaller arm standing on the mobile base and pull the trigger.',
      robots: ['kawasaki'],
    },
    {
      kind: 'quiz',
      title: 'Quick check',
      question: 'What carries the Kawasaki arm around the cell?',
      options: ['A ceiling gantry', 'An AGV on a floor rail', 'Nothing, it is fixed'],
      answer: 1,
      explain: 'It rides an OTA AGV along its floor rail to reach the chassis it inspects.',
    },
    {
      kind: 'goto',
      title: 'Walk to the Otokar inspection cell',
      text: 'Two gantry robots inspect a bus body here. Follow the marker to the end of their runways.',
      target: { x: -2.0, z: 11.2, radius: 1.5 },
    },
    {
      kind: 'select',
      title: 'Meet a gantry robot',
      text: 'Point at either gantry robot and pull the trigger to see its axes and what it is scanning.',
      robots: ['robot1', 'robot2'],
    },
    {
      kind: 'quiz',
      title: 'Quick check',
      question: 'Which gantry scans the roof of the bus?',
      options: ['R1', 'R2'],
      answer: 1,
      explain: 'R2 reaches in through the window band to scan the roof; R1 works on the underbody.',
    },
    {
      kind: 'outro',
      title: 'Training complete',
      text: 'You have walked both cells, met their four robots and know how to keep clear of them.',
    },
  ],
};

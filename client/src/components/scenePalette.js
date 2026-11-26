/*
 * Shared finishes and lighting for the factory. Paint, rubber and concrete
 * are dielectric; bare metal is metallic. Neutral architecture leaves the
 * safety colours and robot liveries readable without a coloured light wash.
 * Material values are shared between desktop and VR. Lighting is tuned for
 * the model's scale and the renderer's AgX display transform.
 */
export const LIGHTING = Object.freeze({
  environment: 0.59,
  ambient: 0.105,
  hemisphere: 0.34,
  key: 1.38,
  desktopKey: 0.96,
  fixtureBanks: 1.04,
  clerestory: 1.95,
  daylight: 0.38,
  desktopDaylight: 0.21,
  exposure: 1,
  lampEmission: 2.6,
  windowEmission: 2.85,
});

export const ARCHITECTURE = Object.freeze({
  floor: Object.freeze({ color: '#96999a', metalness: 0, roughness: 0.76 }),
  roof: Object.freeze({ color: '#b1babd', metalness: 0, roughness: 0.76 }),
  wall: Object.freeze({ color: '#e2e3e3', metalness: 0, roughness: 0.79 }),
  steel: Object.freeze({ color: '#5a5e61', metalness: 0.04, roughness: 0.68 }),
  details: Object.freeze({ color: '#81878a', metalness: 0, roughness: 0.73 }),
});

export const PAINT = Object.freeze({
  shell: Object.freeze({ color: '#535555', metalness: 0.05, roughness: 0.42 }),
  body: Object.freeze({ color: '#878d90', metalness: 0.05, roughness: 0.54 }),
  structure: Object.freeze({ color: '#3d4347', metalness: 0.05, roughness: 0.65 }),
  dark: Object.freeze({ color: '#2b3033', metalness: 0.05, roughness: 0.6 }),
  mid: Object.freeze({ color: '#555c60', metalness: 0.05, roughness: 0.6 }),
});

export const ACCENT = Object.freeze({
  signalRed: Object.freeze({ color: '#ad4542', metalness: 0.05, roughness: 0.5 }),
  hazardAmber: Object.freeze({ color: '#bf8b2c', metalness: 0.05, roughness: 0.58 }),
  guardYellow: Object.freeze({ color: '#d8aa26', metalness: 0.03, roughness: 0.56 }),
  brandBlue: Object.freeze({ color: '#003054', metalness: 0.05, roughness: 0.46 }),
});

// Keep the four cells' existing robot liveries; only the surrounding hall
// uses the neutral building palette.
const ENAMEL = { metalness: 0.05, roughness: 0.44 };
export const ROBOT_LIVERY = Object.freeze({
  graphite: Object.freeze({ shell: Object.freeze({ color: '#68767c', ...ENAMEL }), accent: ACCENT.brandBlue }),
  orange: Object.freeze({ shell: Object.freeze({ color: '#01204b', ...ENAMEL }), accent: PAINT.dark }),
  white: Object.freeze({ shell: Object.freeze({ color: '#cbd2d1', ...ENAMEL }), accent: Object.freeze({ color: '#365f86', ...ENAMEL }) }),
  yellow: Object.freeze({ shell: Object.freeze({ color: '#d1c9b5', ...ENAMEL }), accent: Object.freeze({ color: '#7d775f', ...ENAMEL }) }),
});

export const METAL = Object.freeze({
  aluminium: Object.freeze({ color: '#788082', metalness: 0.85, roughness: 0.45 }),
  machined: Object.freeze({ color: '#969b9d', metalness: 0.9, roughness: 0.28 }),
  galvanised: Object.freeze({ color: '#606665', metalness: 0.8, roughness: 0.6 }),
  worn: Object.freeze({ color: '#424847', metalness: 0.75, roughness: 0.54 }),
});

export const POLYMER = Object.freeze({
  chain: Object.freeze({ color: '#555a59', metalness: 0, roughness: 0.88 }),
  rubber: Object.freeze({ color: '#181c1b', metalness: 0, roughness: 0.92 }),
  glass: Object.freeze({ color: '#010b0f', metalness: 0, roughness: 0.12 }),
});

// One muted primer hue, with a gentle value progression to separate the
// roof, pillars and inner structure in the inspection body.
export const BODY_IN_WHITE = Object.freeze({
  roof: '#82a494',
  upper: '#739584',
  crossMember: '#658674',
  pillar: '#577865',
  inner: '#4a6958',
  sill: '#3d594a',
});

export const BUS_LIVERY = Object.freeze({
  sand: Object.freeze({ body: '#d3c7b5', chassis: '#776d5d' }),
  forest: Object.freeze({ body: '#668679', chassis: '#495f57' }),
  graphite: Object.freeze({ body: '#4c555c', chassis: '#343c42' }),
});

export const MARKING = Object.freeze({
  bay: Object.freeze({ color: '#cea94b', metalness: 0, roughness: 0.9 }),
});

export const ROOM = Object.freeze({
  background: '#c8c9c6',
  fog: '#c8c9c6',
  ambient: '#f5f4ef',
  lamp: '#fffbf5',
  daylight: '#edf3fa',
  skyBounce: '#f0f2f3',
  groundBounce: '#a3a39e',
});

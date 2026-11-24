/*
 * Checks the scene palette against the rules it claims to follow.
 *
 * scenePalette.js states three rules. Two of them are mechanical, so they can
 * be tested rather than asserted in a comment and then quietly broken later --
 * which is exactly what happened to the factory shell, where the comment
 * described a cool darker floor and separated beams while the values beside it
 * had drifted to four shades of white 1.01:1 apart.
 *
 *   node scripts/otokar/verify_palette.mjs
 */
import {
  ARCHITECTURE, PAINT, ACCENT, METAL, POLYMER, MARKING, BODY_IN_WHITE, BUS_LIVERY, LIGHTING,
} from '../../client/src/components/scenePalette.js';

const lin = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contrast = (a, b) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const saturation = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

// Neutral-value approximation of Three's AgX curve. The sum of the broad
// light levels provides a repeatable highlight stress test for the palette.
const agx = (linear) => {
  const exposure = Math.log2(Math.max(1e-10, linear));
  const x = Math.min(1, Math.max(0, (exposure + 12.47393) / 16.499999));
  const curve = 15.5 * x ** 6 - 40.14 * x ** 5 + 31.96 * x ** 4 - 6.868 * x ** 3
    + 0.4298 * x ** 2 + 0.1191 * x - 0.00232;
  return Math.min(1, Math.max(0, curve) ** 2.2);
};
const TOTAL_LIGHT = LIGHTING.key + LIGHTING.environment + LIGHTING.ambient + LIGHTING.hemisphere;
const rendered = (hex) => agx(luminance(hex) * TOTAL_LIGHT * LIGHTING.exposure);

let failures = 0;
const fail = (msg) => { console.log('  FAIL ' + msg); failures += 1; };
const pass = (msg) => console.log('  ok   ' + msg);

/* RULE 1: dielectrics are dielectric. */
console.log('\nRule 1 -- paint, polymer and concrete must be dielectric (metalness <= 0.05)');
const dielectricGroups = { ARCHITECTURE, PAINT, ACCENT, POLYMER, MARKING };
for (const [groupName, group] of Object.entries(dielectricGroups)) {
  for (const [name, m] of Object.entries(group)) {
    if (typeof m !== 'object' || m.metalness === undefined) continue;
    // The building's structural steel is the one exception: it is bare rolled
    // section, not painted, so a little metallic response is correct.
    const allowed = groupName === 'ARCHITECTURE' && name === 'steel' ? 0.15 : 0.05;
    if (m.metalness > allowed + 1e-9) {
      fail(`${groupName}.${name} metalness ${m.metalness} > ${allowed}`);
    } else {
      pass(`${groupName}.${name} metalness ${m.metalness}`);
    }
  }
}

console.log('\nRule 1b -- bare metal must actually be metallic (metalness >= 0.7)');
for (const [name, m] of Object.entries(METAL)) {
  if (m.metalness < 0.7) fail(`METAL.${name} metalness ${m.metalness} < 0.7`);
  else pass(`METAL.${name} metalness ${m.metalness}`);
}

/* RULE 3: neighbours separated by value. */
const MIN_CONTRAST = 1.25;
const NEIGHBOURS = [
  ['floor / wall', ARCHITECTURE.floor.color, ARCHITECTURE.wall.color],
  ['wall / steel', ARCHITECTURE.wall.color, ARCHITECTURE.steel.color],
  ['floor / steel', ARCHITECTURE.floor.color, ARCHITECTURE.steel.color],
  ['floor / machine shell', ARCHITECTURE.floor.color, PAINT.shell.color],
  ['floor / machine structure', ARCHITECTURE.floor.color, PAINT.structure.color],
  ['shell / body', PAINT.shell.color, PAINT.body.color],
  ['body / structure', PAINT.body.color, PAINT.structure.color],
  ['structure / dark', PAINT.structure.color, PAINT.dark.color],
  ['shell / brand blue', PAINT.shell.color, ACCENT.brandBlue.color],
  ['structure / signal red', PAINT.structure.color, ACCENT.signalRed.color],
  ['structure / hazard amber', PAINT.structure.color, ACCENT.hazardAmber.color],
  ['floor / bay marking', ARCHITECTURE.floor.color, MARKING.bay.color],
  ['structure / chain', PAINT.structure.color, POLYMER.chain.color],
  ['machined metal / structure', METAL.machined.color, PAINT.structure.color],
];
console.log(`\nRule 3 -- neighbouring surfaces at least ${MIN_CONTRAST}:1 apart in luminance`);
for (const [label, a, b] of NEIGHBOURS) {
  const c = contrast(a, b);
  if (c < MIN_CONTRAST) fail(`${label}  ${c.toFixed(2)}:1`);
  else pass(`${label.padEnd(28)} ${c.toFixed(2)}:1`);
}

/* RULE 2: saturation is rationed. */
console.log('\nRule 2 -- only the ACCENT group may be saturated (others < 0.20)');
for (const [groupName, group] of Object.entries({ ARCHITECTURE, PAINT, METAL, POLYMER })) {
  for (const [name, m] of Object.entries(group)) {
    if (!m || !m.color) continue;
    const s = saturation(m.color);
    // Vehicle glazing is tinted by nature; it is glass, not a painted surface.
    if (s >= 0.2 && !(groupName === 'POLYMER' && name === 'glass')) {
      fail(`${groupName}.${name} saturation ${s.toFixed(2)} -- belongs in ACCENT or should be duller`);
    } else {
      pass(`${groupName}.${name.padEnd(12)} saturation ${s.toFixed(2)}`);
    }
  }
}

/*
 * The vehicles, which carry the scene's two remaining colour systems.
 *
 * The inspection body used to be held to steel grey (saturation <= 0.25). It
 * now wears an oxide primer on purpose -- grey lost it among the hall's grey
 * machines -- so what is guarded is what that limit was really protecting:
 * ONE hue, not the CAD's six-hue part coding, and short of fluorescent.
 */
const hue = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const max = Math.max(r, g, b); const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
console.log('\nRule 2 -- the inspection body is one primed colour, not a part-coded rainbow');
const bodyHues = Object.values(BODY_IN_WHITE).map(hue);
const hueSpread = Math.max(...bodyHues) - Math.min(...bodyHues);
if (hueSpread > 12) fail(`BODY_IN_WHITE hue spread ${hueSpread.toFixed(1)} deg -- more than one colour`);
else pass(`BODY_IN_WHITE hue spread ${hueSpread.toFixed(1)} deg`);
for (const [name, hex] of Object.entries(BODY_IN_WHITE)) {
  const sat = saturation(hex);
  if (sat > 0.7) fail(`BODY_IN_WHITE.${name} saturation ${sat.toFixed(2)} > 0.70`);
  else pass(`BODY_IN_WHITE.${name.padEnd(12)} saturation ${sat.toFixed(2)}`);
}

/*
 * The body's structural coding lives in its VALUE ORDER, not its hue, which is
 * what let it survive moving from a saturated blue to a realistic grey. This
 * is the check that guards it: roof lightest down to sill darkest,
 * monotonically, with enough total spread to read at a glance.
 */
console.log('\nRule 3 -- the body-in-white value order must stay monotonic');
const ORDER = ['roof', 'upper', 'crossMember', 'pillar', 'inner', 'sill'];
let previous = Infinity;
for (const name of ORDER) {
  const lum = luminance(BODY_IN_WHITE[name]);
  if (lum >= previous) fail(`BODY_IN_WHITE.${name} (${lum.toFixed(3)}) is not darker than the member above it`);
  else pass(`${name.padEnd(12)} luminance ${lum.toFixed(3)}`);
  previous = lum;
}
const spread = contrast(BODY_IN_WHITE.roof, BODY_IN_WHITE.sill);
if (spread < 2.5) fail(`roof-to-sill spread ${spread.toFixed(2)}:1 -- structure will not read`);
else pass(`roof-to-sill spread ${spread.toFixed(2)}:1`);

/*
 * The parked buses stand on the concrete and beside each other, so those are
 * the pairs that matter. Roofs are deliberately not checked: the opening
 * camera sits at 1.3 m, below their waistline, so no bus roof is ever in shot
 * and separating it would spend contrast where nothing can see it.
 */
console.log('\nRule 3 -- parked buses must separate from the floor and from each other');
const liveries = ['sand', 'forest', 'graphite'];
for (const name of liveries) {
  const l = BUS_LIVERY[name];
  for (const [label, other] of [
    ['floor', ARCHITECTURE.floor.color],
    ['own chassis', l.chassis],
  ]) {
    const c = contrast(l.body, other);
    if (c < MIN_CONTRAST) fail(`${name} body vs ${label}  ${c.toFixed(2)}:1`);
    else pass(`${name.padEnd(9)} vs ${label.padEnd(12)} ${c.toFixed(2)}:1`);
  }
}
for (let i = 0; i < liveries.length; i += 1) {
  for (let j = i + 1; j < liveries.length; j += 1) {
    const c = contrast(BUS_LIVERY[liveries[i]].body, BUS_LIVERY[liveries[j]].body);
    if (c < MIN_CONTRAST) fail(`${liveries[i]} vs ${liveries[j]}  ${c.toFixed(2)}:1`);
    else pass(`${liveries[i]} vs ${liveries[j].padEnd(9)} ${c.toFixed(2)}:1`);
  }
}

/*
 * RULE 4 -- nothing large may render into the top of the curve.
 *
 * Above about 0.85 the tone curve has so little range left that neighbouring
 * values become indistinguishable: that is where "two buses are still white"
 * comes from. Lamps and emissive details are exempt, since being at the top of
 * the range is their job.
 */
const MAX_RENDERED = 0.85;
console.log('\nRule 4 -- large surfaces must not clip after tone mapping');
const SCREEN_SURFACES = [
  ['architecture.floor', ARCHITECTURE.floor.color],
  ['architecture.wall', ARCHITECTURE.wall.color],
  ['architecture.steel', ARCHITECTURE.steel.color],
  ['paint.shell', PAINT.shell.color],
  ['body roof', BODY_IN_WHITE.roof],
  ['bus sand', BUS_LIVERY.sand.body],
  ['bus forest', BUS_LIVERY.forest.body],
  ['bus graphite', BUS_LIVERY.graphite.body],
];
for (const [label, hex] of SCREEN_SURFACES) {
  const value = rendered(hex);
  if (value > MAX_RENDERED) fail(`${label} renders at ${value.toFixed(2)} -- past the curve's usable top`);
  else pass(`${label.padEnd(20)} renders at ${value.toFixed(2)}`);
}

/*
 * And the buses specifically must stay apart ON SCREEN, not just on paper.
 * This is the check that would have caught the round that shipped two white
 * buses while every albedo pair passed.
 */
const MIN_RENDERED_GAP = 0.1;
console.log('\nRule 4 -- the parked buses must separate in rendered value');
for (let i = 0; i < liveries.length; i += 1) {
  for (let j = i + 1; j < liveries.length; j += 1) {
    const a = rendered(BUS_LIVERY[liveries[i]].body);
    const b = rendered(BUS_LIVERY[liveries[j]].body);
    const gap = Math.abs(a - b);
    if (gap < MIN_RENDERED_GAP) fail(`${liveries[i]} and ${liveries[j]} both render near ${a.toFixed(2)}`);
    else pass(`${liveries[i]} ${a.toFixed(2)} vs ${liveries[j]} ${b.toFixed(2)}  gap ${gap.toFixed(2)}`);
  }
}

console.log(failures
  ? `\n${failures} check(s) FAILED`
  : '\nAll palette rules hold.');
process.exit(failures ? 1 : 0);

// Build the headset's hall sounds from CC0 field recordings on Freesound.
//
//   node scripts/audio/build_vr_sounds.mjs        (needs ffmpeg with libopus on PATH)
//
// The first two synthesised soundscapes failed on the headset: a mains hum and
// hard clanks ("scary"), then soft synthetic swells and a robot hum that
// rose and fell with every move ("vuuuuv vuuuuv"). So the hall now plays real
// recordings of factories and workshops, all Creative Commons 0 -- no
// attribution required, credited anyway in CREDITS.md.
//
// For each source this downloads Freesound's high-quality preview (the
// original needs a login), cuts the clips listed below, evens their loudness
// out (beds to -24 LUFS, one-shots to -20; the scene sets the final levels),
// and writes mono Opus to client/public/assets/audio/<name>.ogg. Beds are
// made into seamless loops: the clip runs XFADE seconds past its end, and
// that tail is cross-faded into its start, so the end flows into the start
// with no seam. A lossy codec cannot rebuild a file's first milliseconds
// (they come out of silence), so each loop is also wrapped in LOOP_PAD of
// itself -- its own end before, its own start after -- and the player loops
// between LOOP_PAD and duration - LOOP_PAD (VRSoundscape.js), never touching
// the edges. Where to cut was read off each recording's loudness over time
// (0.25 s windows): the busy stretches, not the pauses between them.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../client/public/assets/audio');
const CACHE = path.join(os.tmpdir(), 'matisse-vr-sounds');

// clip: [name, from s, to s, kind] -- kind 'bed' (loop, with a 3 s cross-fade
// taken from past `to`) or 'shot' (short fades at both ends).
const SOURCES = [
  {
    id: 450117, user: 'kyles', title: 'General Fusion industrial workshop factory ambience11 overlooking factory floor',
    preview: 'https://cdn.freesound.org/previews/450/450117_612689-hq.mp3',
    clips: [['hall-floor', 2, 62, 'bed']],
  },
  {
    id: 679019, user: 'nicoproson', title: 'FACTORY_Production Line (warehouse, workers chatting, boxes)',
    preview: 'https://cdn.freesound.org/previews/679/679019_457982-hq.mp3',
    clips: [['hall-workers', 10, 70, 'bed']],
  },
  {
    id: 454082, user: 'kyles', title: 'metal rollers conveyor belt ... boxes',
    preview: 'https://cdn.freesound.org/previews/454/454082_612689-hq.mp3',
    clips: [['conveyor-roll', 9.3, 15.6, 'shot']],
  },
  {
    id: 131302, user: 'reg7783', title: 'release_air_pffft.wav (nail gun off its air line)',
    preview: 'https://cdn.freesound.org/previews/131/131302_2394357-hq.mp3',
    clips: [['air-release', 0, 1.9, 'shot']],
  },
  {
    id: 349398, user: 'sevenbsb', title: 'Air Impact Wrench',
    preview: 'https://cdn.freesound.org/previews/349/349398_6242013-hq.mp3',
    clips: [['impact-wrench-a', 0, 3.2, 'shot'], ['impact-wrench-b', 3.3, 7.0, 'shot']],
  },
  {
    id: 212941, user: 'nuckan', title: 'hydraulics.wav (forklift)',
    preview: 'https://cdn.freesound.org/previews/212/212941_3910980-hq.mp3',
    clips: [['hydraulics-a', 0.2, 4.6, 'shot'], ['hydraulics-b', 4.8, 9.2, 'shot']],
  },
  {
    id: 221927, user: 'peridactyloptrix', title: 'Forklift reverse beeping',
    preview: 'https://cdn.freesound.org/previews/221/221927_2737063-hq.mp3',
    clips: [['forklift-reverse', 2, 8, 'shot']],
  },
  {
    id: 532137, user: 'j1987', title: 'toolbox.wav',
    preview: 'https://cdn.freesound.org/previews/532/532137_367313-hq.mp3',
    clips: [['toolbox-a', 10.5, 13.5, 'shot'], ['toolbox-b', 15.8, 17.9, 'shot'], ['toolbox-c', 19.8, 22.8, 'shot']],
  },
  {
    id: 426848, user: 'Bibow', title: '34 Wrench on concrete floor, indoor, 5 impacts.wav',
    preview: 'https://cdn.freesound.org/previews/426/426848_8363218-hq.mp3',
    clips: [['wrench-drop', 3.5, 5.5, 'shot']],
  },
  {
    id: 266626, user: 'producerdan', title: 'Car/Auto Mechanic Shop',
    preview: 'https://cdn.freesound.org/previews/266/266626_2115985-hq.mp3',
    clips: [['mechanic-shop', 0, 13.6, 'shot']],
  },
  {
    id: 188821, user: 'peridactyloptrix', title: 'Servo noises',
    preview: 'https://cdn.freesound.org/previews/188/188821_2737063-hq.mp3',
    clips: [['servo-a', 13.2, 16.2, 'shot'], ['servo-b', 16.5, 19.5, 'shot']],
  },
];

const XFADE = 3;
const LOOP_PAD = 0.05; // keep in step with VRSoundscape.js
const TARGET = { bed: -24, shot: -20 };

// ffmpeg's log (where ebur128 reports) is its stderr.
function ffmpeg(args) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(run.stderr.slice(-2000));
  return run.stderr;
}

function filterFor(from, to, kind) {
  if (kind === 'bed') {
    const len = to - from; // the loop's length; the clip runs XFADE past it
    return [
      `[0:a]atrim=${from}:${to + XFADE},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,asplit=3[s1][s2][s3]`,
      `[s1]atrim=0:${XFADE},asetpts=PTS-STARTPTS,afade=t=in:d=${XFADE}[head]`,
      `[s2]atrim=${len}:${len + XFADE},asetpts=PTS-STARTPTS,afade=t=out:d=${XFADE}[tail]`,
      `[s3]atrim=${XFADE}:${len},asetpts=PTS-STARTPTS[body]`,
      '[head][tail]amix=inputs=2:normalize=0[joint]',
      '[joint][body]concat=n=2:v=0:a=1[cut]',
    ].join(';');
  }
  const fade = Math.min(0.3, (to - from) / 8);
  return `[0:a]atrim=${from}:${to},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,afade=t=in:d=0.02,afade=t=out:st=${to - from - fade}:d=${fade}[cut]`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const credits = [];

for (const source of SOURCES) {
  const raw = path.join(CACHE, `${source.id}.mp3`);
  if (!fs.existsSync(raw)) {
    const res = await fetch(source.preview);
    if (!res.ok) throw new Error(`${source.preview}: ${res.status}`);
    fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  }
  for (const [name, from, to, kind] of source.clips) {
    const graph = filterFor(from, to, kind);
    // Pass 1: how loud the cut is. Pass 2: evened out and encoded.
    const measured = ffmpeg(['-i', raw, '-filter_complex', `${graph};[cut]ebur128=peak=sample[m]`, '-map', '[m]', '-f', 'null', '-']);
    const summary = measured.slice(measured.lastIndexOf('Integrated loudness'));
    const loudness = Number((summary.match(/I:\s+(-?[0-9.]+) LUFS/) || [])[1]);
    const peak = Number((summary.match(/Peak:\s+(-?[0-9.]+) dBFS/) || [])[1]);
    // Up to the target, but never so far that the loudest sample clips. No
    // limiter: its state differs at a loop's two ends, which puts a step in
    // the seam.
    const gain = Math.min(Number.isFinite(loudness) ? TARGET[kind] - loudness : 0, Number.isFinite(peak) ? -1 - peak : 0);
    const file = path.join(OUT, `${name}.ogg`);
    let finish = `[cut]volume=${gain.toFixed(2)}dB`;
    if (kind === 'bed') {
      const len = to - from;
      finish += `,asplit=3[x1][x2][x3];[x1]atrim=start=${len - LOOP_PAD},asetpts=PTS-STARTPTS[pre];`
        + `[x3]atrim=0:${LOOP_PAD},asetpts=PTS-STARTPTS[post];[pre][x2][post]concat=n=3:v=0:a=1`;
    }
    ffmpeg(['-i', raw, '-filter_complex', `${graph};${finish}[out]`, '-map', '[out]',
      '-c:a', 'libopus', '-b:a', kind === 'bed' ? '40k' : '48k', '-ar', '48000', '-ac', '1', file]);
    console.log(`${name.padEnd(18)} ${kind}  ${(to - from).toFixed(1)} s  ${loudness.toFixed(1)} LUFS, peak ${peak.toFixed(1)} dBFS, ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB -> ${(loudness + gain).toFixed(1)} LUFS  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
  credits.push(`| ${source.clips.map(([n]) => `\`${n}\``).join(', ')} | [${source.title}](https://freesound.org/s/${source.id}/) | ${source.user} | CC0 |`);
}

fs.writeFileSync(path.join(OUT, 'CREDITS.md'), `# Headset hall sounds

Field recordings from [Freesound](https://freesound.org), all released under
[Creative Commons 0](https://creativecommons.org/publicdomain/zero/1.0/)
(public domain: no attribution required -- credited here anyway, with thanks).
Cut, levelled and encoded by \`scripts/audio/build_vr_sounds.mjs\`; played in
the VR session only (\`client/src/components/VRSoundscape.js\`).

| Files | Recording | By | Licence |
|---|---|---|---|
${credits.join('\n')}
`);
console.log(`\n${OUT}`);

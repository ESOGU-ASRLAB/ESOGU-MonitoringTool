import React from 'react';
import './Documentation.css';
import { Anchor, Callout, DocSidebar, SpecTable } from './docKit';

/*
 * What the VR integration is, how to use it and how it is built, in the same
 * layout as the technical guide. The figures here (speeds, angles, parameters)
 * are the ones in VRWalk.js, VRStatsHud.js and xrSession.js; change them
 * together.
 */
const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'entering', title: 'Entering VR' },
  { id: 'controls', title: 'Controls' },
  { id: 'how', title: 'How it works' },
  { id: 'performance', title: 'Headset performance' },
  { id: 'testing', title: 'Testing and release' },
  { id: 'next', title: 'Next steps' },
];

function GridTable({ head, rows }) {
  return (
    <table className="doc-table is-grid">
      <thead>
        <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(([a, b], i) => (
          <tr key={i}>
            <td>{a}</td>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function VRIntegration() {
  return (
    <div className="doc-page">
      <DocSidebar label="VR integration" sections={SECTIONS} />

      <article className="doc-content">
        <header className="doc-hero">
          <p className="doc-kicker">MATISSE IFARLAB-EDIH Monitoring Tool</p>
          <h1>VR integration</h1>
          <p className="doc-lead">
            Walk the digital twin at full scale in a Meta Quest 3. The headset opens this same web
            app in its browser through WebXR, so there is nothing to install, and the hall, the
            robots and the live telemetry are the ones on the desktop.
          </p>
        </header>

        <Anchor id="overview">Overview</Anchor>
        <p>
          Put on the headset, open the site and press <strong>Enter VR</strong>: you stand on the
          hall floor between the Otokar inspection cell and the IFARLAB workcell, at real scale,
          while the gantries run their inspection program and the arms their tasks.
        </p>
        <SpecTable rows={[
          ['Headset', 'Meta Quest 3 standalone, or a PC VR headset through Chrome or Edge (Quest Link / Air Link)'],
          ['Technology', <>WebXR in the browser; <code>@react-three/xr</code> on the existing React Three Fiber scene</>],
          ['Install', 'None: the same address as the desktop app'],
          ['Scale', '1:1; eye height is the wearer\'s own'],
        ]} />

        <Anchor id="entering">Entering VR</Anchor>
        <ol>
          <li>Open the site in the Quest browser and bookmark it.</li>
          <li>Wait until the hall has loaded. The first visit downloads the models; later visits load them from the cache.</li>
          <li>Press <strong>Enter VR</strong>, under <strong>Walk</strong> in the view controls.</li>
          <li>To leave, press the Meta button on the right controller.</li>
        </ol>
        <Callout title="Only where VR is possible">
          The button appears only in browsers that can start an immersive session, such as the Quest
          browser. Desktop and phone visitors do not see it.
        </Callout>
        <p>
          You start where the desktop view was: where the walker stood in walk mode, otherwise 8 m
          in front of what the orbit view was centred on, facing it.
        </p>

        <Anchor id="controls">Controls</Anchor>
        <GridTable
          head={['Input', 'Action']}
          rows={[
            ['Left thumbstick', 'Walk in the direction you face, at 2.5 m/s'],
            ['Right thumbstick', 'Turn 45° on the spot'],
            ['Trigger', 'Teleport: an arc shows where you will land on the floor'],
            ['Pinch (hand tracking)', 'Teleport without controllers'],
            ['Walking in the room', 'Moves you 1:1 in the hall; the hall walls stop you'],
            ['Meta button', 'Leave VR'],
          ]}
        />

        <Anchor id="how">How it works</Anchor>
        <ul>
          <li><strong>The headset owns the camera.</strong> Moving means moving the XR origin, the point on the floor the wearer's room is laid out around, never the camera itself.</li>
          <li><strong>Turning</strong> rotates the origin about the head, so a wearer standing off-centre in the room still turns on the spot.</li>
          <li><strong>Teleport</strong> puts the head, not the origin, on the target point, so it lands where aimed after any number of turns.</li>
          <li><strong>Walls</strong> are checked against the head, so walking physically in the room stops at the cladding too.</li>
          <li><strong>Leaving VR</strong> gives the page back exactly the view it had before.</li>
        </ul>

        <Anchor id="performance">Headset performance</Anchor>
        <p>
          A Quest 3 draws every frame twice, once per eye, at 72 to 120 Hz on a mobile GPU. The
          headset therefore uses a lighter profile than the desktop:
        </p>
        <SpecTable rows={[
          ['Shadows', 'Soft (contact-hardening) shadows off, the standard shadow map kept. On the Quest browser this applies from page load, so entering VR recompiles nothing.'],
          ['Robot camera feeds', 'Paused in VR: each would draw the hall a second time and stall the GPU to read it back'],
          ['Foveation', 'Full fixed foveation: the edges of each eye, blurred by the lens anyway, render at lower resolution'],
          ['Detail tiers', 'The Otokar cell picks its mesh detail by distance from the headset'],
        ]} />

        <Anchor id="testing">Testing and release</Anchor>
        <p>
          Changes reach this site in two steps: first a separate QA environment, where they are tried
          on the headset, then production. On the QA environment a frame-rate card follows the view:
          green within 5% of the display rate, yellow within 20%, red below. These address
          parameters change the headset profile without a new release:
        </p>
        <GridTable
          head={['Parameter', 'Effect']}
          rows={[
            [<code>?vrshadows=soft|hard|off</code>, 'Shadow quality in VR (default hard)'],
            [<code>?lod=auto|lo|hi</code>, 'Otokar mesh detail (default auto)'],
            [<code>?vrscale=0.8</code>, 'Render scale; below 1 trades sharpness for frame rate'],
            [<code>?vrstats=1|0</code>, 'Frame-rate card on or off'],
            [<code>?vremu=1</code>, 'Meta Quest 3 emulator in a desktop browser, to test without a headset'],
          ]}
        />

        <Anchor id="next">Next steps</Anchor>
        <ul>
          <li><strong>Presence:</strong> a headset user appears in the desktop view as an avatar (head, hands, name and pointer), streamed over a WebSocket from the existing API.</li>
          <li><strong>Follow view:</strong> desktop viewers watch through the headset user's eyes, or from behind them, for presentations.</li>
          <li><strong>&quot;Look here&quot;:</strong> a desktop viewer marks a machine and the headset user sees the marker.</li>
          <li><strong>Robot panels in VR:</strong> point at a robot to see its axes and live telemetry.</li>
          <li><strong>Collisions with machines:</strong> today only the hall walls stop you.</li>
        </ul>
      </article>
    </div>
  );
}

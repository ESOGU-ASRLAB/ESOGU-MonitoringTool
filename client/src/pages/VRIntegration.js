import React from 'react';
import './Documentation.css';
import { Anchor, Callout, DocSidebar, SpecTable } from './docKit';

/*
 * What the VR integration is, how to use it and how it is built, in the same
 * layout as the technical guide. The figures here (speeds, angles, distances,
 * rates, limits, parameters) are the ones in VRWalk.js, VRStatsHud.js,
 * xrSession.js, Visitors.js, presence.js, RobotInfo.js and api/presence.js;
 * change them together.
 */
const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'entering', title: 'Entering VR' },
  { id: 'controls', title: 'Controls' },
  { id: 'visitors', title: 'Other visitors' },
  { id: 'robots', title: 'Robot details' },
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
        {rows.map((cells, i) => (
          <tr key={i}>
            {cells.map((cell, j) => <td key={j}>{cell}</td>)}
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
            robots and the live telemetry are the ones on the desktop. Everyone else looking at
            the hall, in a browser or in a headset, stands in it with you.
          </p>
        </header>

        <Anchor id="overview">Overview</Anchor>
        <p>
          Put on the headset, open the site and press <strong>Enter VR</strong>: you stand on the
          hall floor between the Otokar inspection cell and the IFARLAB workcell, at real scale,
          while the gantries run their inspection program and the arms their tasks. Other visitors
          appear as workers where they are looking from, and pointing at a robot opens its details.
        </p>
        <SpecTable rows={[
          ['Headset', 'Meta Quest 3 standalone, or a PC VR headset through Chrome or Edge (Quest Link / Air Link)'],
          ['Technology', <>WebXR in the browser; <code>@react-three/xr</code> on the existing React Three Fiber scene</>],
          ['Install', 'None: the same address as the desktop app'],
          ['Scale', '1:1; eye height is the wearer\'s own'],
          ['Shared hall', 'Every open page, desktop or headset, is shown to the others as a worker (see Other visitors)'],
          ['Robot details', 'Point and pull the trigger, or click on the desktop, for a robot\'s specifications and live values'],
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
            ['Left thumbstick', 'Walk where your head faces, at 2.5 m/s, whether you look ahead, down or up'],
            ['Right thumbstick', 'Turn 45° on the spot'],
            ['Trigger, pointing at a robot', 'Open that robot\'s details panel; the robot is outlined while pointed at'],
            ['Trigger, pointing at the panel', 'Close the details panel'],
            ['Trigger, pointing at the floor', 'Teleport: an arc shows where you will land'],
            ['Pinch (hand tracking)', 'Teleport without controllers'],
            ['Walking in the room', 'Moves you 1:1 in the hall; the hall walls stop you'],
            ['Meta button', 'Leave VR'],
          ]}
        />
        <p>
          The trigger acts on whatever the pointer reaches first: a robot or the panel in the way
          takes the press, open floor teleports.
        </p>

        <Anchor id="visitors">Other visitors</Anchor>
        <p>
          Everyone with the page open is in the hall at the same time. Each other visitor is drawn
          as a worker, with a blue ring at the feet and a name tag, so they are easy to tell from
          the hall&apos;s own staff:
        </p>
        <GridTable
          head={['Visitor', 'Where they appear', 'Tag']}
          rows={[
            ['In a headset', 'Where they stand, facing where they look', <><code>Visitor 2 · VR</code></>],
            ['On a desktop, walk mode', 'Where they walk', <code>Visitor 3</code>],
            ['On a desktop, orbit view', 'On the floor under their camera, kept inside the hall', <code>Visitor 4</code>],
          ]}
        />
        <ul>
          <li><strong>Movement</strong> is eased between updates: the worker walks while its visitor moves, with a stride matched to the speed, and stands still when they stop.</li>
          <li><strong>Names</strong> are handed out by the server when a page connects (<code>Visitor 1</code>, <code>Visitor 2</code>, ...); a number is reused once its visitor has left. Nothing about the person is asked for or stored.</li>
          <li><strong>Leaving</strong> removes the worker at once; a page that disappears without closing (a headset put to sleep, a laptop lid shut) is removed within about a minute.</li>
          <li>You never see yourself, only the others.</li>
        </ul>
        <SpecTable rows={[
          ['Connection', <>One WebSocket per page to the API, at <code>/api/presence</code></>],
          ['What is sent', 'Floor position and heading only, rounded to 1 cm, at most 5 times a second and only after a move of 3 cm or a turn of about 2°; nothing while standing still'],
          ['Reconnects', 'Automatically after 1, 2, 4 ... up to 30 s, so a sleeping API is picked up when it wakes'],
          ['Limits', 'Up to 40 pages at once; the server drops messages sent too often and closes a connection that sends an oversized one'],
        ]} />

        <Anchor id="robots">Robot details</Anchor>
        <p>
          The UR10e, the Kawasaki RS005L and both Otokar gantries each open a details panel. In the
          headset, point at the robot and pull the trigger; on the desktop, click it. The panel
          refreshes four times a second and shows:
        </p>
        <ul>
          <li><strong>What it is:</strong> maker, model and its role in the cell.</li>
          <li><strong>How it is driven:</strong> <em>Demo program</em>, <em>Live telemetry</em> (the IFARLAB arms, while the MongoDB stream is live) or <em>Manual control</em>.</li>
          <li><strong>What it is doing:</strong> the current task step and counters, such as boxes moved, chassis bays scanned, or the body inspection&apos;s progress and defects found.</li>
          <li><strong>Live values:</strong> every joint or axis, in degrees or millimetres.</li>
          <li><strong>Key specifications</strong> and a short description, with a link to the full entry in the technical guide.</li>
        </ul>
        <SpecTable rows={[
          ['In the headset', 'A panel opens 1.1 m in front of you, just below eye height, facing you. It stays where it opened, so you can walk up to it or away; choosing another robot brings it back in front of you. Point at it and pull the trigger to close.'],
          ['On the desktop', 'A card in the corner of the 3D view. Close it with its button or the Escape key.'],
        ]} />

        <Anchor id="how">How it works</Anchor>
        <ul>
          <li><strong>The headset owns the camera.</strong> Moving means moving the XR origin, the point on the floor the wearer&apos;s room is laid out around, never the camera itself.</li>
          <li><strong>Walking</strong> follows the head&apos;s heading only. Its tilt is ignored, so looking down at the floor does not slow you down and a tilted head does not bend the path.</li>
          <li><strong>Turning</strong> rotates the origin about the head, so a wearer standing off-centre in the room still turns on the spot.</li>
          <li><strong>Teleport</strong> puts the head, not the origin, on the target point, so it lands where aimed after any number of turns.</li>
          <li><strong>Walls</strong> are checked against the head, so walking physically in the room stops at the cladding too.</li>
          <li><strong>Pointing at robots</strong> hits simple invisible boxes that follow each robot&apos;s moving part, not the robot meshes: testing every controller ray against the machines&apos; millions of triangles on every frame would cost the headset its frame rate.</li>
          <li><strong>Leaving VR</strong> gives the page back exactly the view it had before.</li>
        </ul>

        <Anchor id="performance">Headset performance</Anchor>
        <p>
          A Quest 3 draws every frame twice, once per eye, on a mobile GPU. Measured on the hall as
          it loads, the Otokar cell alone is 0.79 million triangles at its light detail tier and
          6.1 million at its detailed one, and a shadow map draws every shadow-casting part a
          second time. Walking up to the cell on the desktop settings asked the headset for about
          26 million triangles a frame. The headset therefore uses its own profile:
        </p>
        <SpecTable rows={[
          ['Refresh rate', '72 Hz, which gives each frame 13.9 ms; the headset\'s highest rate (90 or 120 Hz) leaves 8 to 11 ms'],
          ['Otokar detail', 'Always the light tier on the headset, wherever you stand'],
          ['Shadows', 'Off. On the Quest browser this applies from page load, so entering VR recompiles nothing.'],
          ['Robot camera feeds', 'Paused in VR: each would draw the hall again and stall the GPU to read it back'],
          ['Foveation', 'Full fixed foveation: the edges of each eye, blurred by the lens anyway, render at lower resolution'],
        ]} />
        <Callout title="What is left">
          With this profile the headset draws about 2.9 million triangles per eye, of which 1.6
          million are the IFARLAB workcell&apos;s CAD meshes, which are not yet simplified. Lighter
          versions of those meshes are the next step for frame rate (see Next steps).
        </Callout>

        <Anchor id="testing">Testing and release</Anchor>
        <p>
          Changes are tried in a desktop browser with the Meta Quest 3 emulator, then released to
          this site, where the headset settings can still be changed from the address bar without
          a new release. The page is served by Cloudflare Pages; the telemetry stream and the
          visitor connection come from the API on Render.
        </p>
        <p>
          With <code>?vrstats=1</code> a frame-rate card follows the view in the headset: green
          within 5% of the display rate, yellow within 20%, red below.
        </p>
        <GridTable
          head={['Parameter', 'Effect']}
          rows={[
            [<code>?vrhz=72|90|120</code>, 'Refresh rate asked of the headset (default 72)'],
            [<code>?vrshadows=off|hard|soft</code>, 'Shadow quality in VR (default off)'],
            [<code>?lod=auto|lo|hi</code>, 'Otokar mesh detail (default: light on the headset, by distance elsewhere)'],
            [<code>?vrscale=0.8</code>, 'Render scale; below 1 trades sharpness for frame rate'],
            [<code>?vrstats=1|0</code>, 'Frame-rate card on or off'],
            [<code>?vremu=1</code>, 'Meta Quest 3 emulator in a desktop browser, to test without a headset'],
          ]}
        />
        <p>
          Parameters combine, for example <code>?vrstats=1&amp;vrhz=90&amp;vrshadows=hard</code> to
          compare a richer setting against the default on the headset.
        </p>

        <Anchor id="next">Next steps</Anchor>
        <ul>
          <li><strong>Lighter IFARLAB meshes:</strong> simplify the workcell&apos;s CAD meshes, the largest remaining cost on the headset and the largest download on a first visit.</li>
          <li><strong>Head and hands for headset visitors:</strong> show where a headset visitor is looking and pointing, not only where they stand.</li>
          <li><strong>Follow view:</strong> desktop viewers watch through a headset visitor&apos;s eyes, or from behind them, for presentations.</li>
          <li><strong>&quot;Look here&quot;:</strong> a desktop viewer marks a machine and the headset user sees the marker.</li>
          <li><strong>Collisions with machines:</strong> today only the hall walls stop you.</li>
        </ul>
      </article>
    </div>
  );
}

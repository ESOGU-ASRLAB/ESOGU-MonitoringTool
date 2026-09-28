import React from 'react';
import './Documentation.css';
import { Anchor, Callout, DocSidebar, SpecTable } from './docKit';

/*
 * What the VR integration is, how to use it and how it is built, in the same
 * layout as the technical guide. The figures here (speeds, angles, distances,
 * rates, limits, parameters) are the ones in VRWalk.js, VRStatsHud.js,
 * xrSession.js, Visitors.js, presence.js, RobotInfo.js, training/TrainingMode.js,
 * training/scenario.js, VRSoundscape.js, vrAudio.js and api/presence.js;
 * change them together.
 */
const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'entering', title: 'Entering VR' },
  { id: 'controls', title: 'Controls' },
  { id: 'visitors', title: 'Other visitors' },
  { id: 'robots', title: 'Robot details' },
  { id: 'training', title: 'Training' },
  { id: 'sound', title: 'Sound' },
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
        <header className="doc-hero has-media">
          <div>
            <p className="doc-kicker">MATISSE IFARLAB-EDIH Monitoring Tool</p>
            <h1>VR integration</h1>
            <p className="doc-lead">
              Walk the digital twin at full scale in a Meta Quest 3. The headset opens this same web
              app in its browser through WebXR, so there is nothing to install, and the hall, the
              robots and the live telemetry are the ones on the desktop. Everyone else looking at
              the hall, in a browser or in a headset, stands in it with you.
            </p>
            <ul className="doc-hero-tags" aria-label="At a glance">
              <li>Meta Quest 3</li>
              <li>WebXR</li>
              <li>No install</li>
              <li>Shared hall</li>
            </ul>
          </div>
          <figure className="doc-hero-media">
            <img
              src={`${process.env.PUBLIC_URL}/assets/vr/quest3-hero.webp`}
              alt="A person wearing a Meta Quest 3 headset, reaching for virtual objects with its controllers"
              width="936"
              height="496"
            />
            <figcaption>Meta Quest 3 · image: Meta</figcaption>
          </figure>
        </header>

        <Anchor id="overview">Overview</Anchor>
        <p>
          Put on the headset, open the site and press <strong>Enter VR</strong>: you stand on the
          hall floor between the Otokar inspection cell and the IFARLAB workcell, at real scale,
          while the gantries run their inspection program and the arms their tasks. Other visitors
          appear as workers where they are looking from, and pointing at a robot opens its details.
          In the headset the hall also sounds like one, and a guided training takes you through
          it step by step.
        </p>
        <SpecTable rows={[
          ['Headset', 'Meta Quest 3 standalone, or a PC VR headset through Chrome or Edge (Quest Link / Air Link)'],
          ['Technology', <>WebXR in the browser; <code>@react-three/xr</code> on the existing React Three Fiber scene</>],
          ['Install', 'None: the same address as the desktop app'],
          ['Scale', '1:1; eye height is the wearer\'s own'],
          ['Shared hall', 'Every open page, desktop or headset, is shown to the others as a worker (see Other visitors)'],
          ['Robot details', 'Point and pull the trigger, or click on the desktop, for a robot\'s specifications and live values'],
          ['Training', 'A guided hall orientation with tasks and questions, in the headset only'],
          ['Sound', 'Hall ambience, robot servos and feedback sounds, in the headset only'],
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
            ['Right thumbstick, left or right', 'Turn 45° on the spot'],
            ['Right thumbstick, forward', 'Aim a teleport: an arc falls from the controller to a ring on the floor; let the stick go to land there. A red arc lands outside the hall and does nothing.'],
            ['Trigger, pointing at a robot', 'Open that robot\'s details panel; the chosen robot is outlined'],
            ['Trigger, pointing at the details panel', 'Close it'],
            ['Trigger, pointing at a training button', 'Press it'],
            ['X, left controller', 'Show or hide the training panel'],
            ['Pinch (hand tracking)', 'Acts as the trigger'],
            ['Walking in the room', 'Moves you 1:1 in the hall; the hall walls stop you'],
            ['Meta button', 'Leave VR'],
          ]}
        />
        <p>
          The trigger only selects and never moves you. A press counts when it is let go within
          1.5 s, so a deliberate, unhurried pull works as well as a quick one.
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
            ['On a desktop, orbit view', '5 m in front of what their view is centred on, facing it: in the opening view, just ahead of where a headset wearer starts', <code>Visitor 4</code>],
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
          ['In the headset', 'A panel opens 1.1 m away, a little to the right of where you face and just below eye height, turned towards you, clear of the training panel on your left. It stays where it opened, so you can walk up to it or away; choosing another robot brings it back in front of you. Point at it and pull the trigger to close.'],
          ['On the desktop', 'A card in the corner of the 3D view. Close it with its button or the Escape key.'],
        ]} />

        <Anchor id="training">Training</Anchor>
        <p>
          On entering VR a panel on your front left offers <strong>Start training</strong> or
          <strong> Free walk</strong>. The training, <em>Hall orientation</em>, takes about five
          minutes: it walks you to both cells, has you find their four robots and checks what you
          picked up with a few questions. Each step is one task:
        </p>
        <GridTable
          head={['Task', 'What you do', 'What shows you where']}
          rows={[
            ['Read', 'Read the card and press its button', '-'],
            ['Go to', 'Walk or teleport onto a ring on the floor', 'A pulsing blue ring, a column of light over it and a turning marker above'],
            ['Find a robot', 'Point at the named robot and pull the trigger; its details panel opens too', 'An amber arrow bobbing over the robot'],
            ['Question', 'Press one of the answers', 'A wrong answer turns red and you try again; the right one turns green with a short explanation'],
          ]}
        />
        <ol>
          <li>Welcome</li>
          <li>Walk to the IFARLAB workcell</li>
          <li>Safety: the fence and the light curtain</li>
          <li>Find the UR10e</li>
          <li>Question: how much the UR10e carries</li>
          <li>Find the Kawasaki RS005L</li>
          <li>Question: what carries the Kawasaki arm</li>
          <li>Walk to the Otokar inspection cell</li>
          <li>Find a gantry robot</li>
          <li>Question: which gantry scans the roof</li>
          <li>Summary: time taken and questions answered right first time</li>
        </ol>
        <ul>
          <li><strong>Every finished step</strong> plays a chime, gives both controllers a short buzz and throws up a burst of sparks; the last one plays a fanfare.</li>
          <li><strong>The panel</strong> stands 1.15 m away, 40° to the left of where you face and below eye height, with a progress bar along the top. It stays put while you look around, and glides back beside you at every new step, or once you walk more than 2.2 m from it or turn more than about 65° away.</li>
          <li><strong>Skip step</strong> moves on from a go-to or find step; X on the left controller hides the panel and brings it back.</li>
          <li>At the end, <strong>Start again</strong> repeats the module and <strong>Free walk</strong> puts the panel away.</li>
        </ul>
        <Callout title="Headset only">
          The training, its markers and its sounds exist only inside a VR session. Desktop and
          phone visitors see the hall exactly as before. A module is a list of steps in{' '}
          <code>training/scenario.js</code>, so a new one needs no new code.
        </Callout>

        <Anchor id="sound">Sound</Anchor>
        <GridTable
          head={['Sound', 'Where it comes from']}
          rows={[
            ['Hall ambience', 'A low rumble and ventilation hum all around you'],
            ['Robots', 'A servo whine from each robot\'s moving part, louder and higher the faster its axes move, from the same values as its details panel; silent while it stands still'],
            ['The hall', 'Every 3 to 9 s, a metal clank from one of its four far corners'],
            ['Feedback', 'A click for every button, a chime for a finished step, a low buzz for a wrong answer, a whoosh for a teleport'],
            ['Haptics', 'The controllers buzz with the chime, a wrong answer and a teleport'],
          ]}
        />
        <p>
          The robots and clanks are placed in the hall: they are heard from where they are, fade
          with distance and move as you turn your head. Everything is synthesised in the browser
          with Web Audio, so no sound files are downloaded. Sound starts with the Enter VR press,
          since browsers only allow it after a tap or click; outside VR the page is silent.
        </p>

        <Anchor id="how">How it works</Anchor>
        <ul>
          <li><strong>The headset owns the camera.</strong> Moving means moving the XR origin, the point on the floor the wearer&apos;s room is laid out around, never the camera itself.</li>
          <li><strong>Walking</strong> follows the head&apos;s heading only. Its tilt is ignored, so looking down at the floor does not slow you down and a tilted head does not bend the path.</li>
          <li><strong>Turning</strong> rotates the origin about the head, so a wearer standing off-centre in the room still turns on the spot.</li>
          <li><strong>Teleport</strong> puts the head, not the origin, on the target point, so it lands where aimed after any number of turns.</li>
          <li><strong>Teleport is on the stick, not the trigger.</strong> With both on the trigger, the nearer hit took the press, and a teleport arc landing on the floor a few metres ahead is nearer than most robots: pointing at a robot moved you instead of opening its panel.</li>
          <li><strong>Walls</strong> are checked against the head, so walking physically in the room stops at the cladding too.</li>
          <li><strong>Pointing at robots</strong> hits simple invisible boxes that follow each robot&apos;s moving part, not the robot meshes: testing every controller ray against the machines&apos; millions of triangles on every frame would cost the headset its frame rate.</li>
          <li><strong>Leaving VR</strong> gives the page back exactly the view it had before.</li>
        </ul>

        <Anchor id="performance">Headset performance</Anchor>
        <p>
          A Quest 3 draws every frame twice, once per eye, on a mobile GPU. Measured on the hall as
          it loads, the two cells were modelled at CAD density: the IFARLAB workcell 1.13 million
          triangles, the Otokar cell 1.16 million at its light detail tier and 6.1 million at its
          detailed one, and a shadow map drew every shadow-casting part a second time. The hall
          came to 2.9 million triangles per eye before walking anywhere. Now:
        </p>
        <SpecTable rows={[
          ['IFARLAB meshes', 'Simplified to 0.15 million triangles for every viewer, within 0.2% of each part\'s shape (the fence wire mesh within 0.03%); a 54 MB download became about 6 MB'],
          ['Otokar detail', 'Its own headset tier, 0.32 million triangles, wherever you stand'],
          ['Scenery', 'The parked buses, forklift, floor scrubber, drones and yard are left out in the headset; the staff, signs and safety equipment stay'],
          ['Refresh rate', '72 Hz, which gives each frame 13.9 ms; the headset\'s highest rate (90 or 120 Hz) leaves 8 to 11 ms'],
          ['Shadows', 'Off. On the Quest browser this applies from page load, so entering VR recompiles nothing.'],
          ['Robot camera feeds', 'Paused in VR: each would draw the hall again and stall the GPU to read it back'],
          ['Foveation', 'Full fixed foveation: the edges of each eye, blurred by the lens anyway, render at lower resolution'],
        ]} />
        <Callout title="Result">
          The headset now draws about 0.7 million triangles per eye, down from 2.9 million, in
          150 draw calls instead of 193.
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
            [<code>?lod=auto|vr|lo|hi</code>, 'Otokar mesh detail (default: vr on the headset, by distance elsewhere)'],
            [<code>?vrscenery=lite|full</code>, 'Hall decoration in the headset (default lite)'],
            [<code>?vrscale=0.8</code>, 'Render scale; below 1 trades sharpness for frame rate'],
            [<code>?vrstats=1|0</code>, 'Frame-rate card on or off'],
            [<code>?vremu=1</code>, 'Meta Quest 3 emulator in a desktop browser, to test without a headset'],
            [<code>?vrclickms=1500</code>, 'Longest trigger press that still counts as a click, in ms (default 1500); raised only for automated emulator runs'],
          ]}
        />
        <p>
          Parameters combine, for example <code>?vrstats=1&amp;vrhz=90&amp;vrshadows=hard</code> to
          compare a richer setting against the default on the headset.
        </p>

        <Anchor id="next">Next steps</Anchor>
        <ul>
          <li><strong>Head and hands for headset visitors:</strong> show where a headset visitor is looking and pointing, not only where they stand.</li>
          <li><strong>Follow view:</strong> desktop viewers watch through a headset visitor&apos;s eyes, or from behind them, for presentations.</li>
          <li><strong>&quot;Look here&quot;:</strong> a desktop viewer marks a machine and the headset user sees the marker.</li>
          <li><strong>Collisions with machines:</strong> today only the hall walls stop you.</li>
          <li><strong>More training modules:</strong> the Otokar inspection program step by step, an emergency-stop drill.</li>
        </ul>
      </article>
    </div>
  );
}

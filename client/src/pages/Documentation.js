import React, { useEffect, useState } from 'react';
import './Documentation.css';
import { OTOKAR_AXES } from '../components/otokarAxes';

/*
 * Technical guide, laid out like the Node.js / GitHub docs: a sticky table of
 * contents on the left, one long page of sections on the right, each heading
 * linkable. The Otokar axis table is generated from otokarAxes.js, so the
 * guide cannot drift from what the twin actually runs.
 */
const LOGO = `${process.env.PUBLIC_URL}/assets/logo/`;

const SECTIONS = [
  { id: 'matisse', title: 'About MATISSE' },
  { id: 'labs', title: 'ESOGU laboratories' },
  { id: 'ur10e', title: 'UR10e' },
  { id: 'kawasaki', title: 'Kawasaki RS005L' },
  { id: 'otokar', title: 'Inspection cell' },
  { id: 'confidentiality', title: 'Confidentiality and model use' },
  { id: 'credits', title: 'Credits and licences' },
];

function Anchor({ id, children }) {
  return (
    <h2 id={id} className="doc-h2">
      <a href={`#${id}`} className="doc-anchor" aria-hidden="true">#</a>
      {children}
    </h2>
  );
}

function Callout({ kind = 'note', title, children }) {
  return (
    <div className={`doc-callout is-${kind}`}>
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

function SpecTable({ rows }) {
  return (
    <table className="doc-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LabCard({ logo, name, full, href }) {
  return (
    <a className="doc-lab" href={href} target="_blank" rel="noopener noreferrer">
      <img src={LOGO + logo} alt="" />
      <span>
        <strong>{name}</strong>
        <small>{full}</small>
        <em>{href.replace(/^https?:\/\//, '').replace(/\/$/, '')}</em>
      </span>
    </a>
  );
}

export default function Documentation() {
  const [active, setActive] = useState(SECTIONS[0].id);

  // Highlight the section being read in the sidebar.
  useEffect(() => {
    const root = document.querySelector('.doc-content');
    if (!root) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root, rootMargin: '0px 0px -70% 0px' },
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="doc-page">
      <aside className="doc-sidebar" aria-label="Contents">
        <div className="doc-sidebar-head">
          <span>Technical guide</span>
        </div>
        <nav>
          <ul>
            {SECTIONS.map(({ id, title }) => (
              <li key={id}>
                <a href={`#${id}`} className={active === id ? 'is-active' : ''}>{title}</a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <article className="doc-content">
        <header className="doc-hero">
          <p className="doc-kicker">MATISSE IFARLAB-EDIH Monitoring Tool</p>
          <h1>Technical guide</h1>
          <p className="doc-lead">
            A 3D digital twin of two robot cells: the IFARLAB workcell at Eskişehir Osmangazi
            University and the Otokar bus-body inspection cell developed within MATISSE. This guide
            describes the robots it models and the terms under which the industrial models may be
            used.
          </p>
        </header>

        <Anchor id="matisse">About MATISSE</Anchor>
        <p>
          MATISSE is a European collaborative research project on model-based digital twins for the
          early verification and validation of industrial systems. Eskişehir Osmangazi University
          (ESOGU) and Otokar take part as partners; this tool is ESOGU's digital-twin demonstrator,
          bringing a university robot cell and an industrial inspection use case into one live,
          inspectable model.
        </p>
        <p>
          Project website: <a href="https://matisse-kdt.eu/" target="_blank" rel="noopener noreferrer">matisse-kdt.eu</a>
        </p>

        <Anchor id="labs">ESOGU laboratories</Anchor>
        <div className="doc-labs">
          <LabCard logo="logo3.png" name="ESOGU" full="Eskişehir Osmangazi University" href="https://www.ogu.edu.tr/" />
          <LabCard logo="asrlab.png" name="ASRLab" full="ESOGU research laboratory" href="https://srlab.ogu.edu.tr/" />
          <LabCard logo="ifarlab.png" name="IFARLAB" full="Intelligent Factory and Robotics Laboratory" href="https://ifarlab.ogu.edu.tr/" />
        </div>

        <Anchor id="ur10e">
          <img className="doc-h2-logo" src={`${LOGO}ur_icon.png`} alt="" />
          UR10e
        </Anchor>
        <p>
          A collaborative 6-axis arm by Universal Robots, mounted on a linear 7th-axis carriage. It
          carries a 2-finger gripper and a SICK camera on its flange.
        </p>
        <SpecTable rows={[
          ['Payload', '12.5 kg'],
          ['Reach', '1300 mm'],
          ['Degrees of freedom', '6 rotating joints (+ linear rail, 0 to 2.4 m in this cell)'],
          ['Pose repeatability', '± 0.05 mm'],
          ['Joint range', '± 360° on all joints'],
          ['Joint speed', 'Base and shoulder 120 °/s, elbow and wrists 180 °/s'],
          ['Weight', '33.5 kg'],
          ['Sensing', 'Built-in force/torque sensor at the tool flange'],
          ['Task', 'Pick and place: detects a box on the conveyor, grips it and sets it on the table'],
        ]} />

        <Anchor id="kawasaki">
          <img className="doc-h2-logo is-wide" src={`${LOGO}kawasaki_icon.png`} alt="" />
          Kawasaki RS005L
        </Anchor>
        <p>
          A compact 6-axis industrial arm mounted on an OTA AGV mobile base, which itself rides a
          floor rail. The arm carries a SCHUNK EGP-50 gripper.
        </p>
        <SpecTable rows={[
          ['Payload', '5 kg'],
          ['Maximum reach', '705 mm'],
          ['Degrees of freedom', '6 rotating joints (+ AGV on its rail)'],
          ['Pose repeatability', '± 0.03 mm'],
          ['Mobile base', 'OTA AGV, differential drive with casters'],
          ['Task', 'Chassis inspection: scans the outside, reaches in through the upper bay, scans inside and withdraws'],
        ]} />

        <Anchor id="otokar">
          <img className="doc-h2-logo is-wide" src={`${LOGO}logo2.png`} alt="" />
          Inspection cell
        </Anchor>
        <p>
          Two 5-axis portal (gantry) robots on parallel runways straddle a bus body in white. Each
          carries a camera head (Basler ace, Intel RealSense D455, SICK DT35) on a chain nested
          axis 1, 2, 3, 4, 5 and the camera. Axis limits and speeds follow Otokar's trajectory
          documentation:
        </p>
        <table className="doc-table is-grid">
          <thead>
            <tr><th>Axis</th><th>Name</th><th>Range</th><th>Speed</th><th>Limit</th></tr>
          </thead>
          <tbody>
            {OTOKAR_AXES.map((axis, i) => (
              <tr key={axis.id}>
                <td><code>{axis.deckName}</code> {i + 1}</td>
                <td>{axis.label}</td>
                <td>{axis.kind === 'linear' ? `0 to ${(axis.max / 1000).toFixed(2)} m` : `${axis.min}° to ${axis.max}°`}</td>
                <td>{axis.speed} {axis.motionUnit}</td>
                <td>{axis.maxSpeed} {axis.motionUnit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul>
          <li><strong>R1, underbody:</strong> column low, arm extended under the floor pan, camera turned up; slides along the body while scanning.</li>
          <li><strong>R2, roof:</strong> arm through the window band into the cabin, camera turned up at the roof; pans, nods, rises and traces rings on the roof panel.</li>
        </ul>

        <Anchor id="confidentiality">Confidentiality and model use</Anchor>
        <Callout kind="danger" title="Confidential industrial data">
          The Otokar cell (the gantry robots, the bus body and their placement data) is derived
          from Otokar's own engineering CAD, made available to ESOGU within the MATISSE project
          under a confidentiality agreement between the MATISSE consortium, ESOGU and Otokar.
        </Callout>
        <ul>
          <li>The models may be used only for the MATISSE project and its authorised demonstrations.</li>
          <li>They may not be extracted, copied, redistributed, reverse-engineered or used to reproduce the equipment.</li>
          <li>The source STEP files are not part of the repository; only the converted meshes needed to render the cell are shipped, and they carry the same restrictions.</li>
          <li>Screenshots or recordings showing the Otokar cell outside the project require the partners' approval.</li>
          <li>The UR10e and Kawasaki meshes come from their public ROS description packages under those packages' own licences.</li>
        </ul>

        <Anchor id="credits">Credits and licences</Anchor>
        <ul>
          <li>Factory hall: Blender model, exported to glTF.</li>
          <li>Props (forklift, fire extinguisher, first-aid kit, exit sign, traffic cone, wet-floor sign) from <a href="https://poly.pizza" target="_blank" rel="noopener noreferrer">Poly Pizza</a> under CC-BY 3.0 and CC0; authors are listed in <code>client/public/assets/props/CREDITS.md</code>.</li>
          <li>UR10e: <a href="https://github.com/UniversalRobots/Universal_Robots_ROS2_Description" target="_blank" rel="noopener noreferrer">Universal_Robots_ROS2_Description</a>.</li>
          <li>Robot and company names and logos belong to their respective owners and are used for identification only.</li>
        </ul>

      </article>
    </div>
  );
}

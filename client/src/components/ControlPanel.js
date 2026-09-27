import React from 'react';
import './ControlPanel.css';
import { OTOKAR_AXES, OTOKAR_ROBOT_HOME, formatAxis } from './otokarAxes';
import { useTelemetry, normaliseTrace } from './robotTelemetry';
import { registerFeedCanvas, FEED_W, FEED_H } from './RobotCameraFeeds';

/*
 * Each machine's maker, as a small brand mark beside its name: Universal
 * Robots, Kawasaki (its "K" alone -- the wordmark is unreadable this small),
 * and Otokar for both gantries. All sit in one 30 x 16 box, scaled to fit.
 */
const LOGO_BASE = `${process.env.PUBLIC_URL}/assets/logo/`;
const MAKER_LOGOS = {
  ur10e: { src: 'ur_icon.png', alt: 'Universal Robots', width: 15 },
  kawasaki: { src: 'kawasaki_icon.png', alt: 'Kawasaki', width: 21 },
  robot1: { src: 'logo2.png', alt: 'Otokar', width: 30 },
  robot2: { src: 'logo2.png', alt: 'Otokar', width: 30 },
};

function RobotIcon({ kind }) {
  const logo = MAKER_LOGOS[kind];
  if (!logo) return null;
  // A fixed slot, so every name plate starts at the same x whatever the mark's
  // shape; each mark is sized for its own proportions inside it.
  return (
    <span className="telemetry-icon">
      <img src={LOGO_BASE + logo.src} alt={logo.alt} style={{ width: logo.width }} />
    </span>
  );
}

// The robot's own camera, live (RobotCameraFeeds.js paints the canvas).
function CameraFeed({ feedKey }) {
  return (
    <div className="telemetry-feed" title="Live view from the robot's camera">
      <canvas
        ref={(el) => registerFeedCanvas(feedKey, el)}
        width={FEED_W}
        height={FEED_H}
        aria-label="Robot camera view"
      />
      <span className="telemetry-feed-tag">CAM</span>
    </div>
  );
}

const JOINT_LABELS = ['Base (J1)', 'Shoulder (J2)', 'Elbow (J3)', 'Wrist 1 (J4)', 'Wrist 2 (J5)', 'Wrist 3 (J6)'];

// The Otokar gantries don't fit the six-revolute-joints-plus-rail shape the
// two IFARLAB arms share: three of their five axes are linear and measured in
// millimetres of travel. They get their own slider block rather than being
// forced through JOINT_LABELS.
const OTOKAR_ROBOTS = { otokar1: 'robot1', otokar2: 'robot2' };

const ROBOT_TABS = [
  { id: 'ur10e', label: 'UR10e' },
  { id: 'kawasaki', label: 'Kawasaki' },
  { id: 'otokar1', label: 'Otokar R1' },
  { id: 'otokar2', label: 'Otokar R2' },
];

/*
 * THE LIVE READOUT.
 *
 * One row per machine, in the order they appear on the floor, each showing
 * every axis it has. The two families do not share a shape -- the IFARLAB arms
 * are six revolute joints, the Otokar gantries three linear axes in
 * millimetres plus two rotary -- so each carries its own axis labels and units
 * rather than being forced into one table.
 *
 * `key` is the telemetry id the robot component publishes under.
 */
const TELEMETRY_ROWS = [
  {
    key: 'ur10e',
    name: 'UR10e',
    meta: '6-DOF on rail',
    axes: ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'],
    unit: '°',
    digits: 0,
  },
  {
    key: 'kawasaki',
    name: 'Kawasaki',
    meta: '6-DOF on AGV',
    axes: ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'],
    unit: '°',
    digits: 0,
  },
  {
    key: 'robot1',
    name: 'R1',
    meta: '5-axis gantry',
    axes: ['Z', 'Y', 'X', 'AX', 'AZ'],
    // Axes 1-3 are travel in millimetres, 4-5 are degrees. Per-axis units, not
    // one for the row: printing a 12 000 mm rail position with a degree sign
    // is the kind of small lie a readout should not tell.
    units: ['mm', 'mm', 'mm', '°', '°'],
    digits: 0,
  },
  {
    key: 'robot2',
    name: 'R2',
    meta: '5-axis gantry',
    axes: ['Z', 'Y', 'X', 'AX', 'AZ'],
    units: ['mm', 'mm', 'mm', '°', '°'],
    digits: 0,
  },
];

// Each axis is scaled to its own recent range. The chart shows motion;
// the readouts above it provide absolute positions and matching line keys.
const SPARK_WIDTH = 240;
const SPARK_HEIGHT = 64;
const SPARK_PAD = 5;
// One colour per channel, the standard categorical set of scientific plots.
/*
 * Channels are told apart by shade and dash, inside the panel's one blue
 * family, rather than by six unrelated hues.
 */
const TRACE_COLORS = ['#2060cd', '#0f2a57', '#3d6fd6', '#111827', '#1a3f80', '#4b5563'];
const TRACE_DASHES = [undefined, undefined, '4 2', '4 2', '1.5 2', '1.5 2'];
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const TICK_LENGTH = 3;

function traceStyle(index) {
  return { stroke: TRACE_COLORS[index % TRACE_COLORS.length], strokeDasharray: TRACE_DASHES[index] };
}

function Sparkline({ traces }) {
  const usable = SPARK_HEIGHT - SPARK_PAD * 2;
  const lines = (traces || []).map((trace) => {
    const points = normaliseTrace(trace);
    if (points.length < 2) return null;
    // y is flipped: the box's origin is top-left, and a rising value should
    // rise on screen.
    return points
      .map(([x, y]) => `${(SPARK_PAD + x * (SPARK_WIDTH - SPARK_PAD * 2)).toFixed(1)},${(SPARK_PAD + (1 - y) * usable).toFixed(1)}`)
      .join(' ');
  });

  return (
    <div className="telemetry-chart" title="Motion history, scaled per axis. Latest samples on the right.">
      <div className="telemetry-spark-frame">
      <svg
        className="telemetry-spark"
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {TICKS.map((fraction) => {
          const x = SPARK_PAD + fraction * (SPARK_WIDTH - SPARK_PAD * 2);
          const y = SPARK_PAD + fraction * usable;
          return (
            <React.Fragment key={fraction}>
              <line className="telemetry-spark-grid" x1={x} y1={SPARK_PAD} x2={x} y2={SPARK_HEIGHT - SPARK_PAD} />
              <line className={fraction === 0.5 ? 'telemetry-spark-base' : 'telemetry-spark-grid'}
                x1={SPARK_PAD} y1={y} x2={SPARK_WIDTH - SPARK_PAD} y2={y} />
              <line className="telemetry-spark-tick"
                x1={x} y1={SPARK_HEIGHT - SPARK_PAD} x2={x} y2={SPARK_HEIGHT - SPARK_PAD - TICK_LENGTH} />
              <line className="telemetry-spark-tick"
                x1={SPARK_PAD} y1={y} x2={SPARK_PAD + TICK_LENGTH} y2={y} />
            </React.Fragment>
          );
        })}
        <rect className="telemetry-spark-axes" rx={3} x={SPARK_PAD} y={SPARK_PAD}
          width={SPARK_WIDTH - SPARK_PAD * 2} height={usable} />
        {lines.map((d, i) => (d ? (
          <polyline
            key={i}
            className="telemetry-spark-line"
            points={d}
            style={traceStyle(i)}
          />
        ) : null))}
      </svg>
      <span className="telemetry-spark-scale is-max">1.0</span>
      <span className="telemetry-spark-scale is-min">0.0</span>
      <span className="telemetry-spark-scale is-origin">t−</span>
      <span className="telemetry-spark-scale is-time">t (s)</span>
      {!lines.some(Boolean) && <span className="telemetry-chart-empty">Awaiting samples</span>}
      </div>
    </div>
  );
}

function TelemetryPanel({ animate }) {
  const telemetry = useTelemetry(8);

  return (
    <section className="control-section telemetry" aria-label="Live axis data">

      {TELEMETRY_ROWS.map((row) => {
        const entry = telemetry[row.key];
        return (
          <div className="telemetry-robot" key={row.key}>
            <div className="telemetry-robot-head">
              <span className="telemetry-id">
                <RobotIcon kind={row.key} />
                <span className="telemetry-name">{row.name}</span>
              </span>
              <span className="telemetry-meta">{row.meta}</span>
            </div>
            <div className="telemetry-body">
              <div className="telemetry-axes">
                {row.axes.map((axis, i) => {
                  const value = entry && entry.values[i];
                  const unit = row.units ? row.units[i] : row.unit;
                  return (
                    <span className="telemetry-axis" key={axis}>
                      <span className="telemetry-axis-label">
                        <svg className="telemetry-axis-key" viewBox="0 0 12 4" aria-hidden="true">
                          <line x1="0" y1="2" x2="12" y2="2" className="telemetry-spark-line" style={traceStyle(i)} />
                        </svg>
                        {axis}
                      </span>
                      <span className="telemetry-axis-value">
                        {/* An em dash until the robot has published once, rather
                            than a zero: a zero is a reading, and this is the
                            absence of one. */}
                        {value === undefined || value === null
                          ? '—'
                          : <>{value.toFixed(row.digits)}<span className="telemetry-axis-unit">{unit}</span></>}
                      </span>
                    </span>
                  );
                })}
              </div>
              <div className="telemetry-plot-row">
                <Sparkline traces={entry && entry.traces} />
                <CameraFeed feedKey={row.key} />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default function ControlPanel({
  selectedRobot,
  setSelectedRobot,
  jointAngles,
  setJointAngles,
  kawasakiAngles,
  setKawasakiAngles,
  railPosition,
  setRailPosition,
  agvRailPosition,
  setAgvRailPosition,
  animate,
  setAnimate,
  gripperOpen,
  setGripperOpen,
  showFactory,
  setShowFactory,
  otokarAxes,
  setOtokarAxes,
}) {
  const otokarKey = OTOKAR_ROBOTS[selectedRobot];
  const isUR10e = selectedRobot === 'ur10e';
  const angles = isUR10e ? jointAngles : kawasakiAngles;
  const setAngles = isUR10e ? setJointAngles : setKawasakiAngles;
  const railValue = isUR10e ? railPosition : agvRailPosition;
  const setRailValue = isUR10e ? setRailPosition : setAgvRailPosition;
  const railLabel = isUR10e ? 'Rail (7th axis)' : 'AGV rail (7th axis)';
  const railRange = isUR10e ? { min: 0, max: 2.4 } : { min: -0.45, max: 3 };

  const handleOtokarChange = (index, value) => {
    setOtokarAxes((prev) => {
      const next = [...prev[otokarKey]];
      next[index] = Number(value);
      return { ...prev, [otokarKey]: next };
    });
  };

  const resetOtokarHome = () => {
    setOtokarAxes((prev) => ({
      ...prev,
      [otokarKey]: OTOKAR_ROBOT_HOME[otokarKey],
    }));
  };

  const handleJointChange = (index, value) => {
    setAngles((prev) => {
      const next = [...prev];
      next[index] = Number(value);
      return next;
    });
  };

  return (
    <div className="control-panel">
      {/* Above the controls rather than below them: this is the state of the
          cell, and the sliders underneath are what acts on it. It also stays
          in view without scrolling, which a readout has to do to be read. */}
      <TelemetryPanel animate={animate} />

      <div className="manual-head">
        <h3>Manual control</h3>
        <p className={`manual-note${animate ? ' is-locked' : ''}`}>
          Turn off Start engine to move the axes by hand.
        </p>
      </div>

      {/* Which machine the controls below act on, directly above them. */}
      <div className="robot-tabs" role="tablist" aria-label="Robot">
        {ROBOT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selectedRobot === tab.id}
            className={selectedRobot === tab.id ? 'active' : ''}
            onClick={() => setSelectedRobot(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {otokarKey ? (
        <section className="control-section">
          <h3>Gantry axes</h3>
          {OTOKAR_AXES.map((axis, index) => (
            <label className="joint-slider gantry-axis" key={axis.id}>
              <span className="joint-slider-label">
                <span className="axis-title">
                  <span className="axis-code">{axis.deckName}</span>
                  <span className="axis-description">
                    <span className="axis-number">Axis {index + 1}</span>
                    <span>{axis.label}</span>
                  </span>
                </span>
                <span className="joint-slider-value">
                  {formatAxis(index, otokarAxes[otokarKey][index])}
                </span>
              </span>
              <input
                type="range"
                min={axis.min}
                max={axis.max}
                step={axis.step}
                value={otokarAxes[otokarKey][index]}
                disabled={animate}
                onChange={(e) => handleOtokarChange(index, e.target.value)}
              />
              <span className="axis-range">
                <span className="axis-range-item">
                  <span className="axis-range-label">Range</span>
                  <span>
                    {axis.kind === 'linear'
                      ? `0 to ${(axis.max / 1000).toFixed(2)} m`
                      : `${axis.min}° to ${axis.max}°`}
                  </span>
                </span>
                <span className="axis-range-item">
                  <span className="axis-range-label">Speed</span>
                  <span>{axis.speed} {axis.motionUnit}</span>
                </span>
                <span className="axis-range-item">
                  <span className="axis-range-label">Limit</span>
                  <span>{axis.maxSpeed} {axis.motionUnit}</span>
                </span>
              </span>
            </label>
          ))}
          <button
            type="button"
            className="panel-button"
            onClick={resetOtokarHome}
            disabled={animate}
          >
            Reset home pose
          </button>
        </section>
      ) : (
      <section className="control-section">
        <h3>Joints</h3>
        {angles.map((angle, index) => (
          <label className="joint-slider" key={JOINT_LABELS[index]}>
            <span className="joint-slider-label">
              {JOINT_LABELS[index]}
              <span className="joint-slider-value">{Math.round(angle)}°</span>
            </span>
            <input
              type="range"
              min={-360}
              max={360}
              step={1}
              value={angle}
              disabled={animate}
              onChange={(e) => handleJointChange(index, e.target.value)}
            />
          </label>
        ))}

        <label className="joint-slider">
          <span className="joint-slider-label">
            {railLabel}
            <span className="joint-slider-value">{railValue.toFixed(2)} m</span>
          </span>
          <input
            type="range"
            min={railRange.min}
            max={railRange.max}
            step={0.01}
            value={railValue}
            disabled={animate}
            onChange={(e) => setRailValue(Number(e.target.value))}
          />
        </label>
      </section>
      )}

      {!otokarKey && <section className="control-section">
        <h3>Gripper</h3>
        <label className="joint-slider">
          <span className="joint-slider-label">
            Opening
            <span className="joint-slider-value">{Math.round(gripperOpen * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={gripperOpen}
            onChange={(e) => setGripperOpen(Number(e.target.value))}
          />
        </label>
      </section>}

      <section className="control-section control-switches">
        <label className="control-toggle">
          <span className="control-toggle-title">Start engine</span>
          <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
        </label>
        <label className="control-toggle">
          <span className="control-toggle-title">Show factory</span>
          <input
            type="checkbox"
            checked={showFactory}
            onChange={(e) => setShowFactory(e.target.checked)}
          />
        </label>
      </section>
    </div>
  );
}

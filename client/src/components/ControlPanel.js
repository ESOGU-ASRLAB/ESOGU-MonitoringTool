import React from 'react';
import './ControlPanel.css';
import { OTOKAR_AXES, OTOKAR_ROBOT_HOME, formatAxis } from './otokarAxes';
import { useTelemetry, normaliseTrace } from './robotTelemetry';

const JOINT_LABELS = ['Base (J1)', 'Shoulder (J2)', 'Elbow (J3)', 'Wrist 1 (J4)', 'Wrist 2 (J5)', 'Wrist 3 (J6)'];

// The Otokar gantries don't fit the six-revolute-joints-plus-rail shape the
// two IFARLAB arms share: three of their five axes are linear and measured in
// millimetres of travel. They get their own slider block rather than being
// forced through JOINT_LABELS.
const OTOKAR_ROBOTS = { otokar1: 'robot1', otokar2: 'robot2' };

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
    axes: ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'],
    unit: '°',
    digits: 0,
  },
  {
    key: 'kawasaki',
    name: 'Kawasaki',
    axes: ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'],
    unit: '°',
    digits: 0,
  },
  {
    key: 'robot1',
    name: 'Otokar R1',
    axes: ['Z', 'Y', 'X', 'AX', 'AZ'],
    // Axes 1-3 are travel in millimetres, 4-5 are degrees. Per-axis units, not
    // one for the row: printing a 12 000 mm rail position with a degree sign
    // is the kind of small lie a readout should not tell.
    units: ['mm', 'mm', 'mm', '°', '°'],
    digits: 0,
  },
  {
    key: 'robot2',
    name: 'Otokar R2',
    axes: ['Z', 'Y', 'X', 'AX', 'AZ'],
    units: ['mm', 'mm', 'mm', '°', '°'],
    digits: 0,
  },
];

/*
 * A ROLLING STRIP OF THE LAST FEW SECONDS, one trace per axis.
 *
 * Why this chart and not another: the numbers beside it already say WHERE each
 * axis is, exactly, and a chart cannot beat a number at that. What a number
 * cannot show is whether the axis is moving, how fast, and whether it is in a
 * steady cycle or a one-off move -- which is the whole question you ask of a
 * machine that is running. A strip chart answers that at a glance and keeps
 * the last six seconds of it, so a move that has just finished is still
 * visible. A bar or a dial would show the same instant the digits already do.
 *
 * Every axis is drawn in one box rather than stacked, because at this size --
 * about 110 by 34 px in a side panel -- six separate strips would be four
 * pixels tall each. Bundled, the shape of the whole machine's motion reads
 * even when a single trace does not.
 *
 * SVG rather than canvas: at 8 Hz over 48 samples this is a few hundred points
 * redrawn eight times a second, which React handles without a canvas, and it
 * stays sharp on a high-DPI screen for free.
 */
const SPARK_WIDTH = 110;
const SPARK_HEIGHT = 34;
const SPARK_PAD = 3;

function Sparkline({ traces }) {
  if (!traces || !traces.length) {
    return <svg className="telemetry-spark" viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} />;
  }

  const usable = SPARK_HEIGHT - SPARK_PAD * 2;
  const lines = traces.map((trace) => {
    const points = normaliseTrace(trace);
    if (points.length < 2) return null;
    // y is flipped: the box's origin is top-left, and a rising value should
    // rise on screen.
    return points
      .map(([x, y]) => `${(x * SPARK_WIDTH).toFixed(1)},${(SPARK_PAD + (1 - y) * usable).toFixed(1)}`)
      .join(' ');
  });

  return (
    <svg
      className="telemetry-spark"
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Mid-line, so a flat trace reads as "parked at rest" rather than as a
          stray mark floating in an empty box. */}
      <line
        className="telemetry-spark-base"
        x1="0"
        y1={SPARK_HEIGHT / 2}
        x2={SPARK_WIDTH}
        y2={SPARK_HEIGHT / 2}
      />
      {lines.map((d, i) => (d ? (
        <polyline
          key={i}
          className="telemetry-spark-line"
          points={d}
          /* Later axes are drawn fainter, so the bundle has a front and a back
             instead of six identical lines crossing each other. */
          style={{ opacity: 0.85 - i * 0.1 }}
        />
      ) : null))}
    </svg>
  );
}

function TelemetryPanel({ animate }) {
  const telemetry = useTelemetry(8);

  return (
    <section className="control-section telemetry">
      <div className="telemetry-header">
        <h4>Live axis data</h4>
        {/*
          The dot says whether the numbers are MOVING, not whether they exist.
          With the engine off the readout is still live -- it follows the
          sliders -- so calling that state "offline" would be wrong; it is the
          machine that is idle, not the link.
        */}
        <span className={`telemetry-state${animate ? ' is-running' : ''}`}>
          {animate ? 'streaming' : 'idle'}
        </span>
      </div>

      {TELEMETRY_ROWS.map((row) => {
        const entry = telemetry[row.key];
        return (
          <div className="telemetry-robot" key={row.key}>
            <span className="telemetry-name">{row.name}</span>
            <div className="telemetry-body">
              <div className="telemetry-axes">
                {row.axes.map((axis, i) => {
                  const value = entry && entry.values[i];
                  const unit = row.units ? row.units[i] : row.unit;
                  return (
                    <span className="telemetry-axis" key={axis}>
                      <span className="telemetry-axis-label">{axis}</span>
                      <span className="telemetry-axis-value">
                        {/* An em dash until the robot has published once, rather
                            than a zero: a zero is a reading, and this is the
                            absence of one. */}
                        {value === undefined || value === null
                          ? '—'
                          : `${value.toFixed(row.digits)}${unit}`}
                      </span>
                    </span>
                  );
                })}
              </div>
              <Sparkline traces={entry && entry.traces} />
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
      <div className="robot-tabs">
        <button
          className={isUR10e ? 'active' : ''}
          onClick={() => setSelectedRobot('ur10e')}
        >
          UR10e
        </button>
        <button
          className={selectedRobot === 'kawasaki' ? 'active' : ''}
          onClick={() => setSelectedRobot('kawasaki')}
        >
          Kawasaki
        </button>
      </div>
      <div className="robot-tabs">
        <button
          className={selectedRobot === 'otokar1' ? 'active' : ''}
          onClick={() => setSelectedRobot('otokar1')}
        >
          Otokar R1
        </button>
        <button
          className={selectedRobot === 'otokar2' ? 'active' : ''}
          onClick={() => setSelectedRobot('otokar2')}
        >
          Otokar R2
        </button>
      </div>

      {/* Above the controls rather than below them: this is the state of the
          cell, and the sliders underneath are what acts on it. It also stays
          in view without scrolling, which a readout has to do to be read. */}
      <TelemetryPanel animate={animate} />

      {otokarKey ? (
        <section className="control-section">
          <h3>Gantry axes</h3>
          {OTOKAR_AXES.map((axis, index) => (
            <label className="joint-slider" key={axis.id}>
              <span className="joint-slider-label">
                <span>
                  {axis.deckName} · {axis.label}
                  {!axis.confirmed && (
                    <abbr
                      className="axis-inferred"
                      title="Mapping inferred from presentation slide order, not confirmed against the CAD. See docs/otokar-cad-notes.md."
                    >
                      ?
                    </abbr>
                  )}
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
                {axis.kind === 'linear'
                  ? `0 – ${(axis.max / 1000).toFixed(2)} m`
                  : `${axis.min}° – ${axis.max}°`}
                {` · ${axis.speed} ${axis.motionUnit} (max ${axis.maxSpeed})`}
              </span>
            </label>
          ))}
          <button
            type="button"
            className="panel-button"
            onClick={resetOtokarHome}
            disabled={animate}
          >
            Reset to home pose
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

      <section className="control-section">
        <h3>Engine</h3>
        <label className="control-toggle">
          <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
          Start engine
        </label>
      </section>

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

      <section className="control-section">
        <label className="control-toggle">
          <input
            type="checkbox"
            checked={showFactory}
            onChange={(e) => setShowFactory(e.target.checked)}
          />
          Show factory building
        </label>
      </section>

    </div>
  );
}

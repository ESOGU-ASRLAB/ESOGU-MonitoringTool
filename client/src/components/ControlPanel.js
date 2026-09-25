import React from 'react';
import './ControlPanel.css';
import { OTOKAR_AXES, OTOKAR_ROBOT_HOME, formatAxis } from './otokarAxes';

const JOINT_LABELS = ['Base (J1)', 'Shoulder (J2)', 'Elbow (J3)', 'Wrist 1 (J4)', 'Wrist 2 (J5)', 'Wrist 3 (J6)'];

// The Otokar gantries don't fit the six-revolute-joints-plus-rail shape the
// two IFARLAB arms share: three of their five axes are linear and measured in
// millimetres of travel. They get their own slider block rather than being
// forced through JOINT_LABELS.
const OTOKAR_ROBOTS = { otokar1: 'robot1', otokar2: 'robot2' };

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

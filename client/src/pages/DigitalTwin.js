import React, { useEffect, useRef, useState, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import "./DigitalTwin.css";
import UR10eRobot from "../components/UR10eRobot";
import KawasakiRobot from "../components/KawasakiRobot";
import AGVBase from "../components/AGVBase";
import UR10eMount from "../components/UR10eMount";
import RailAnimator from "../components/RailAnimator";
import EnvironmentElements from "../components/EnvironmentElements";
import Factory from "../components/Factory";
import Bus from "../components/Bus";
import Drones from "../components/Drones";
import Workers from "../components/Workers";
import Lift from "../components/Lift";
import AmbientSound from "../components/AmbientSound";
import ControlPanel from "../components/ControlPanel";
import Scene from "../components/Scene";
import { Ramp } from "../components/Bus";

const API_BASE = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace(/\/api\/auth\/?$/, "/api")
  : "http://localhost:3001/api";

function Loader() {
  return (
    <Html center>
      <div
        style={{
          color: "#1d1d1f",
          fontSize: "15px",
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          fontWeight: 500,
          background: "rgba(255,255,255,0.92)",
          padding: "16px 28px",
          borderRadius: "12px",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          backdropFilter: "blur(20px)",
        }}
      >
        Loading...
      </div>
    </Html>
  );
}

// Ticks once a second off a plain setInterval rather than requestAnimationFrame
// -- this is header chrome, not part of the R3F render loop, so there's no
// reason to redraw it more often than the seconds digit actually changes.
function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = now.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="live-clock">
      <span className="live-clock-date">{date}</span>
      <span className="live-clock-time">{time}</span>
    </div>
  );
}

function AnimatedLift({ show, position, rotation, speed = 1, range = 2 }) {
  const groupRef = useRef();
  const baseY = position[1]; // Başlangıç Y pozisyonu

  useFrame((state) => {
    if (groupRef.current) {
      // elapsed time ve sinüs kullanılarak Y ekseninde salınım hareketi
      groupRef.current.position.y =
        baseY + Math.sin(state.clock.elapsedTime * speed) * range;
    }
  });

  if (!show) return null;

  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Lift bileşeninin kendi pozisyonunu sıfırlayarak gruba bağla */}
      <Lift show={true} position={[0, 0, 0]} rotation={[0, 0, 0]} />
    </group>
  );
}

export default function DigitalTwin() {
  const [selectedRobot, setSelectedRobot] = useState("ur10e");
  const [jointAngles, setJointAngles] = useState([0, -90, 0, -90, 0, 0]);
  const [animate, setAnimate] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [gripperOpen, setGripperOpen] = useState(0.5);
  const [showEnvironment, setShowEnvironment] = useState(true);
  const [showFactory, setShowFactory] = useState(true);
  const [kawasakiAngles, setKawasakiAngles] = useState([0, 20, -30, 0, 45, 0]);
  const [railPosition, setRailPosition] = useState(1.115); // UR10e's 7th-axis carriage, metres along its rail
  const [agvRailPosition, setAgvRailPosition] = useState(0.530401); // Kawasaki AGV's position along its floor rail
  const [panelOpen, setPanelOpen] = useState(false);
  // Desktop-only: collapses the sidebar to zero width so the viewport takes the
  // full row. Separate from panelOpen, which drives the mobile slide-in drawer.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [liveStatus, setLiveStatus] = useState("connecting"); // 'connecting' | 'live' | 'offline'

  const lastTelemetryTsRef = useRef(null);
  const lastSuccessfulEventRef = useRef(0);
  const ur10eGroupRef = useRef(null);
  const agvGroupRef = useRef(null);
  const controlsRef = useRef(null);

  // On-screen equivalents of the mouse gestures (left-drag orbit, scroll
  // zoom) for the view-control buttons -- mutate the camera directly and
  // call controls.update(), same as what OrbitControls does per drag frame.
  const ROTATE_STEP = Math.PI / 10;

  const orbitBy = (deltaTheta, deltaPhi) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;
    const offset = new THREE.Vector3()
      .copy(camera.position)
      .sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += deltaTheta;
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi + deltaPhi,
      0.05,
      controls.maxPolarAngle,
    );
    spherical.makeSafe();
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    controls.update();
  };

  const zoomBy = (factor) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;
    const offset = new THREE.Vector3()
      .copy(camera.position)
      .sub(controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    );
    offset.setLength(distance);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  };

  useEffect(() => {
    const url = `${API_BASE}/telemetry/joint-states/stream?interval=250`;
    const es = new EventSource(url);

    const markRecentActivity = () => {
      lastSuccessfulEventRef.current = Date.now();
      setLiveStatus((prev) => (prev === "offline" ? "connecting" : prev));
    };

    es.addEventListener("open", () => {
      setLiveStatus((prev) => (prev === "live" ? prev : "connecting"));
    });

    es.addEventListener("hello", () => {
      markRecentActivity();
      setLiveStatus((prev) => (prev === "live" ? prev : "connecting"));
    });

    es.addEventListener("joint_states", (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        const ur10eOk =
          Array.isArray(payload?.ur10e) && payload.ur10e.length === 6;
        const kawasakiOk =
          Array.isArray(payload?.kawasaki) && payload.kawasaki.length === 6;
        if (!ur10eOk && !kawasakiOk) return;
        if (
          payload.timestamp &&
          payload.timestamp === lastTelemetryTsRef.current
        )
          return;
        lastTelemetryTsRef.current = payload.timestamp || null;

        lastSuccessfulEventRef.current = Date.now();
        setLiveStatus("live");

        // If user enabled demo animation, don't override angles.
        if (animate) return;
        if (ur10eOk) setJointAngles(payload.ur10e);
        if (kawasakiOk) setKawasakiAngles(payload.kawasaki);
        if (Number.isFinite(payload.ur10eRail))
          setRailPosition(payload.ur10eRail);
        if (Number.isFinite(payload.agvRail))
          setAgvRailPosition(payload.agvRail);
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("error", () => {
      const noRecentData = Date.now() - lastSuccessfulEventRef.current > 10000;
      if (noRecentData) {
        setLiveStatus("offline");
      } else {
        setLiveStatus((prev) => (prev === "live" ? prev : "connecting"));
      }
    });

    return () => {
      es.close();
    };
  }, [animate]);

  return (
    <div className="dt-wrapper">
      <AmbientSound play={showFactory && soundOn} />

      {/* Header bar */}
      <header className="ndoc-header">
        <div className="ndoc-header-inner">
          <span className="ndoc-header-title">Monitoring Tool</span>
          <span className="ndoc-header-version">3D Workcell Visualizer</span>
          <div className="live-badge" data-status={liveStatus}>
            <span className="live-dot" />
            <span className="live-label">
              {liveStatus === "live"
                ? "Live"
                : liveStatus === "offline"
                  ? "Offline"
                  : "Connecting"}
            </span>
            <span className="live-caption">
              {liveStatus === "live"
                ? "Streaming real robot data from the backend"
                : "Backend not sending robot data"}
            </span>
          </div>
          <LiveClock />
        </div>
      </header>

      {/* Split layout: sidebar + 3D viewport */}
      <div className="twin-layout">
        {/* Left sidebar (control panel) */}
        <div
          className={`twin-sidebar${panelOpen ? " open" : ""}${
            sidebarCollapsed ? " collapsed" : ""
          }`}
          aria-hidden={sidebarCollapsed}
        >
          <ControlPanel
            selectedRobot={selectedRobot}
            setSelectedRobot={setSelectedRobot}
            jointAngles={jointAngles}
            setJointAngles={setJointAngles}
            kawasakiAngles={kawasakiAngles}
            setKawasakiAngles={setKawasakiAngles}
            railPosition={railPosition}
            setRailPosition={setRailPosition}
            agvRailPosition={agvRailPosition}
            setAgvRailPosition={setAgvRailPosition}
            animate={animate}
            setAnimate={setAnimate}
            animationSpeed={animationSpeed}
            setAnimationSpeed={setAnimationSpeed}
            gripperOpen={gripperOpen}
            setGripperOpen={setGripperOpen}
            showEnvironment={showEnvironment}
            setShowEnvironment={setShowEnvironment}
            showFactory={showFactory}
            setShowFactory={setShowFactory}
          />
        </div>

        {/* Mobile drawer overlay */}
        {panelOpen && (
          <div className="drawer-overlay" onClick={() => setPanelOpen(false)} />
        )}

        {/* Right viewport */}
        <div className="twin-viewport">
          <button
            className="panel-toggle"
            onClick={() => setPanelOpen((o) => !o)}
            aria-label="Toggle control panel"
          >
            Menu
          </button>

          {/* Desktop collapse handle + sound toggle, grouped so the sound
              button sits right after the panel toggle regardless of that
              button's width (it changes with its label text, "Control
              Panel" vs "Hide Panel" -- a fixed `left` on a second
              absolutely-positioned button would drift out of place). Both
              stay reachable once the sidebar is fully closed since they live
              in the viewport, not the sidebar. */}
          <div className="viewport-top-left">
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-expanded={!sidebarCollapsed}
              aria-label={
                sidebarCollapsed ? "Show control panel" : "Hide control panel"
              }
              title={
                sidebarCollapsed ? "Show control panel" : "Hide control panel"
              }
            >
              <span className="sidebar-toggle-arrow">
                {sidebarCollapsed ? "›" : "‹"}
              </span>
              <span className="sidebar-toggle-label">
                {sidebarCollapsed ? "Control Panel" : "Hide Panel"}
              </span>
            </button>

            <button
              type="button"
              className="sound-toggle"
              onClick={() => setSoundOn((s) => !s)}
              aria-pressed={soundOn}
              aria-label={
                soundOn ? "Mute factory ambience" : "Unmute factory ambience"
              }
              title={
                soundOn ? "Mute factory ambience" : "Unmute factory ambience"
              }
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
          </div>

          <Canvas
            shadows
            gl={{ antialias: true, alpha: false }}
            style={{ background: "#e8e8ed" }}
            dpr={[1, 2]}
            camera={{ position: [-3, 7.5, -21], fov: 45, near: 0.05, far: 150 }}
          >
            <Suspense fallback={<Loader />}>
              <Scene showGrid={!showFactory} interior={showFactory}>
                {/* UR10e sits on its own 7th-axis carriage (UR10eMount), which
                    rides the fixed rail rendered in EnvironmentElements
                    (base_link.stl). railPosition is that 7th axis --
                    ur10e_base_to_robot_mount from Mongo (metres along the
                    rail) when live, or the slider in ControlPanel otherwise. */}
                <group
                  ref={ur10eGroupRef}
                  position={[-0.147, 0.58635, -railPosition]}
                >
                  <UR10eMount />
                  <UR10eRobot
                    jointAngles={jointAngles}
                    gripperOpen={gripperOpen}
                    animate={animate}
                    animationSpeed={animationSpeed}
                  />
                </group>
                <group
                  ref={agvGroupRef}
                  position={[-2.301949, 0.17, -agvRailPosition]}
                  rotation={[0, Math.PI / 2, 0]}
                >
                  {/* AGV (OTA) base -- ota_base.xacro is the true root of the
                      "mobile_manipulator" spawn; the arm mounts on top of it
                      via manipulator_base_link + the rs005l joint below. */}
                  <AGVBase />
                  <group
                    position={[0.001, 0.263, 0.26]}
                    rotation={[0, Math.PI, 0]}
                  >
                    <KawasakiRobot
                      jointAngles={kawasakiAngles}
                      animate={animate}
                      animationSpeed={animationSpeed * 0.6}
                      gripperOpen={gripperOpen}
                    />
                  </group>
                </group>
                <EnvironmentElements showEnvironment={showEnvironment} />
                <Factory show={showFactory} />
                <Bus
                  show={showFactory}
                  position={[7, 0.3, -2]}
                  rotation={[0.1, Math.PI / 2, 0]}
                />
                <Bus
                  show={showFactory}
                  position={[7, 0, 12]}
                  rotation={[0, Math.PI / 2, 0]}
                />

                <Ramp
                  show={showFactory}
                  position={[7, 0, -2]}
                  rotation={[0, Math.PI / 1, 0]}
                />
                <Drones show={showFactory} />
                <Workers show={showFactory} />
                <Lift show={showFactory} position={[7, 5, 7]} />
                <Lift
                  show={showFactory}
                  position={[7, 5, 20]}
                  rotation={[0, Math.PI / 2, 0]}
                />
                <AnimatedLift
                  show={showFactory}
                  position={[7, 9, -1]}
                  rotation={[0, Math.PI / 1, 0]}
                  speed={0.4} // Hareket hızı
                  range={1.7} // Aşağı/yukarı hareket mesafesi
                />
                <Lift
                  show={showFactory}
                  position={[-9.4, 3.7, 11]}
                  rotation={[0, Math.PI / 2, 0]}
                />
                <Bus
                  show={showFactory}
                  position={[-9, 0, -10]}
                  rotation={[0, Math.PI / 1, 0]}
                />
                <Bus
                  show={showFactory}
                  position={[-10.2, 2.9, 11]}
                  rotation={[0, Math.PI / 1, 0]}
                />
              </Scene>
              <RailAnimator
                animate={animate}
                animationSpeed={animationSpeed}
                ur10eGroupRef={ur10eGroupRef}
                agvGroupRef={agvGroupRef}
              />
            </Suspense>
            <OrbitControls
              ref={controlsRef}
              enableDamping
              dampingFactor={0.05}
              minDistance={0.5}
              maxDistance={45}
              maxPolarAngle={Math.PI / 2 + 0.1}
              target={[-1.1, 0.6, -0.7]}
            />
          </Canvas>

          {/* Manual equivalents of the mouse gestures (rotate / zoom) */}
          <div className="view-controls" aria-label="3D view controls">
            <div className="view-dpad">
              <button
                type="button"
                className="view-btn view-btn-up"
                onClick={() => orbitBy(0, -ROTATE_STEP)}
                aria-label="Rotate up"
                title="Rotate up"
              >
                ▲
              </button>
              <button
                type="button"
                className="view-btn view-btn-left"
                onClick={() => orbitBy(-ROTATE_STEP, 0)}
                aria-label="Rotate left"
                title="Rotate left"
              >
                ◀
              </button>
              <button
                type="button"
                className="view-btn view-btn-right"
                onClick={() => orbitBy(ROTATE_STEP, 0)}
                aria-label="Rotate right"
                title="Rotate right"
              >
                ▶
              </button>
              <button
                type="button"
                className="view-btn view-btn-down"
                onClick={() => orbitBy(0, ROTATE_STEP)}
                aria-label="Rotate down"
                title="Rotate down"
              >
                ▼
              </button>
            </div>
            <div className="view-zoom">
              <button
                type="button"
                className="view-btn"
                onClick={() => zoomBy(1.25)}
                aria-label="Zoom out"
                title="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="view-btn"
                onClick={() => zoomBy(0.8)}
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

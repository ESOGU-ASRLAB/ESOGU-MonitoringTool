import React, { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, useProgress } from "@react-three/drei";
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
import Workers from "../components/Workers";
import Drones from "../components/Drones";
import FactoryMarkings, { PARKED_BUSES } from "../components/FactoryMarkings";
import ControlPanel from "../components/ControlPanel";
import Scene from "../components/Scene";
import OtokarCell from "../components/OtokarCell";
import { OTOKAR_ROBOT_HOME } from "../components/otokarAxes";
import { LIGHTING } from "../components/scenePalette";
import { IFARLAB_OFFSET } from "../components/cellLayout";

const API_BASE = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace(/\/api\/auth\/?$/, "/api")
  : "http://localhost:3001/api";

// Where the IFARLAB workcell stands. See components/cellLayout.js for what it
// does, what it does NOT move, and the check to run after changing it.

// Camera limits are kept just inside the warehouse shell. They prevent the
// orbit camera and the first-person camera from escaping through the walls or
// zooming above the roof.
const FACTORY_CAMERA_BOUNDS = Object.freeze({
  minX: -15.45,
  maxX: 15.45,
  minY: 0.7,
  maxY: 9.15,
  minZ: -23.75,
  maxZ: 23.75,
});
const WALK_EYE_HEIGHT = 1.75;
const WALK_SPEED = 4.2;

function clampFactoryCamera(camera) {
  camera.position.x = THREE.MathUtils.clamp(
    camera.position.x,
    FACTORY_CAMERA_BOUNDS.minX,
    FACTORY_CAMERA_BOUNDS.maxX,
  );
  camera.position.y = THREE.MathUtils.clamp(
    camera.position.y,
    FACTORY_CAMERA_BOUNDS.minY,
    FACTORY_CAMERA_BOUNDS.maxY,
  );
  camera.position.z = THREE.MathUtils.clamp(
    camera.position.z,
    FACTORY_CAMERA_BOUNDS.minZ,
    FACTORY_CAMERA_BOUNDS.maxZ,
  );
}

function FactoryCameraController({
  controlsRef,
  walkingMode,
  keysRef,
  walkStepRef,
  walkLookRef,
  walkZoomRef,
}) {
  const camera = useThree((state) => state.camera);

  const moveCamera = useCallback((forwardAmount, strafeAmount) => {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) return;
    forward.normalize();

    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    camera.position.addScaledVector(forward, forwardAmount);
    camera.position.addScaledVector(right, strafeAmount);
    camera.position.y = WALK_EYE_HEIGHT;
    clampFactoryCamera(camera);
  }, [camera]);

  useEffect(() => {
    walkStepRef.current = walkingMode ? moveCamera : null;
    return () => {
      walkStepRef.current = null;
    };
  }, [walkingMode, walkStepRef, moveCamera]);

  const lookCamera = useCallback((deltaX, deltaY) => {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    euler.y -= deltaX * 0.004;
    euler.x = THREE.MathUtils.clamp(
      euler.x - deltaY * 0.003,
      -Math.PI / 2 + 0.08,
      Math.PI / 2 - 0.08,
    );
    camera.quaternion.setFromEuler(euler);
  }, [camera]);

  const zoomCamera = useCallback((deltaY) => {
    camera.fov = THREE.MathUtils.clamp(camera.fov + deltaY * 0.035, 30, 75);
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    walkLookRef.current = walkingMode ? lookCamera : null;
    walkZoomRef.current = walkingMode ? zoomCamera : null;
    return () => {
      walkLookRef.current = null;
      walkZoomRef.current = null;
    };
  }, [walkingMode, walkLookRef, walkZoomRef, lookCamera, zoomCamera]);

  useEffect(() => {
    if (!walkingMode) return;

    const controls = controlsRef.current;
    const direction = new THREE.Vector3();
    if (controls) {
      direction.subVectors(controls.target, camera.position);
    } else {
      camera.getWorldDirection(direction);
    }
    direction.y = 0;
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, -1);
    direction.normalize();

    camera.position.y = WALK_EYE_HEIGHT;
    clampFactoryCamera(camera);
    camera.lookAt(
      camera.position.x + direction.x,
      WALK_EYE_HEIGHT,
      camera.position.z + direction.z,
    );
  }, [walkingMode, controlsRef, camera]);

  useFrame((_, delta) => {
    if (!walkingMode) {
      clampFactoryCamera(camera);
      return;
    }

    const keys = keysRef.current;
    const forwardAmount = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const strafeAmount = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if (forwardAmount === 0 && strafeAmount === 0) return;

    const length = Math.hypot(forwardAmount, strafeAmount) || 1;
    moveCamera(
      (forwardAmount / length) * WALK_SPEED * delta,
      (strafeAmount / length) * WALK_SPEED * delta,
    );
  });

  return null;
}

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

/*
 * WHAT THE PAGE SHOWS WHILE THE MESHES ARE STILL COMING DOWN.
 *
 * The cell's GLBs are large -- the bus body alone is 72 MB -- so on a cold
 * cache there are several seconds where the canvas is drawn, lit and empty.
 * That reads as a broken page rather than a loading one.
 *
 * This is a DOM overlay ON TOP of the canvas, not the <Suspense> fallback
 * below. The fallback is a drei <Html>, which only mounts once R3F has a scene
 * to attach it to and is positioned in world space, so it can sit off-screen or
 * behind geometry; an absolutely-positioned div over the canvas cannot. The
 * fallback stays as a second line of defence for anything that suspends later.
 *
 * useProgress is drei's zustand store around THREE.DefaultLoadingManager, and a
 * zustand hook works outside the Canvas as well as inside it -- which is the
 * whole reason this can live out here.
 *
 * `active` (not `progress < 100`) drives the overlay: the manager reports 100%
 * between batches, so progress alone flickers the overlay away and back as each
 * LOD level starts. A 400 ms fade on the way out keeps the hand-off from the
 * overlay to the finished scene from snapping.
 */
function ModelLoadingOverlay() {
  const { active, progress, loaded, total } = useProgress();
  // Kept mounted through the fade, then unmounted so it stops intercepting
  // nothing-in-particular over a live canvas.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (active) {
      setVisible(true);
      return undefined;
    }
    const t = setTimeout(() => setVisible(false), 450);
    return () => clearTimeout(t);
  }, [active]);

  if (!visible) return null;

  const pct = Math.min(100, Math.round(progress));

  return (
    <div
      className={`model-loading-overlay${active ? "" : " is-done"}`}
      role="status"
      aria-live="polite"
    >
      <div className="model-loading-card">
        <div className="model-loading-spinner" aria-hidden="true" />
        <div className="model-loading-text">
          <span className="model-loading-title">Loading models</span>
          <span className="model-loading-sub">
            {total > 0 ? `${loaded} / ${total} · ${pct}%` : "Preparing scene…"}
          </span>
        </div>
        <div className="model-loading-bar" aria-hidden="true">
          <div
            className="model-loading-bar-fill"
            style={{ width: `${total > 0 ? pct : 8}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function DigitalTwin({ setLiveStatus }) {
  const [selectedRobot, setSelectedRobot] = useState("otokar1");
  const [jointAngles, setJointAngles] = useState([0, -90, 0, -90, 0, 0]);
  /*
   * The engine runs from the moment the page opens. The cell's whole point is
   * the inspection sequence, and a still machine on first load reads as a
   * broken one -- the sliders are there for anyone who wants to stop it and
   * pose the arms by hand.
   */
  const [animate, setAnimate] = useState(true);
  const [gripperOpen, setGripperOpen] = useState(0.5);
  const [showFactory, setShowFactory] = useState(true);
  const [kawasakiAngles, setKawasakiAngles] = useState([0, 20, -30, 0, 45, 0]);
  const [railPosition, setRailPosition] = useState(1.115); // UR10e's 7th-axis carriage, metres along its rail
  const [agvRailPosition, setAgvRailPosition] = useState(0.530401); // Kawasaki AGV's position along its floor rail
  const [panelOpen, setPanelOpen] = useState(true);
  // Desktop-only: collapses the sidebar to zero width so the viewport takes the
  // full row. Separate from panelOpen, which drives the mobile slide-in drawer.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Otokar MATISSE cell -- manual/demo only, no live telemetry yet. Axes are
  // millimetres of travel for 1-3 and degrees for 4-5; see otokarAxes.js.
  // Both portals share one runway, so they start at different stations along
  // it -- see OTOKAR_ROBOT_HOME.
  const [otokarAxes, setOtokarAxes] = useState(OTOKAR_ROBOT_HOME);
  const [walkingMode, setWalkingMode] = useState(false);

  const lastTelemetryTsRef = useRef(null);
  const lastSuccessfulEventRef = useRef(0);
  const ur10eGroupRef = useRef(null);
  const agvGroupRef = useRef(null);
  const controlsRef = useRef(null);
  const walkKeysRef = useRef({});
  const walkStepRef = useRef(null);
  const walkLookRef = useRef(null);
  const walkZoomRef = useRef(null);
  const walkMouseRef = useRef({ dragging: false, x: 0, y: 0 });

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
    clampFactoryCamera(camera);
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
    clampFactoryCamera(camera);
    controls.update();
  };

  const moveWalkBy = (forwardAmount, strafeAmount) => {
    walkStepRef.current?.(forwardAmount, strafeAmount);
  };

  const handleViewportMouseDown = (event) => {
    if (!walkingMode || event.button !== 0) return;
    if (event.target.closest(".view-controls")) return;
    event.preventDefault();
    walkMouseRef.current = {
      dragging: true,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handleViewportWheel = (event) => {
    if (!walkingMode || event.target.closest(".view-controls")) return;
    event.preventDefault();
    walkZoomRef.current?.(event.deltaY);
  };

  useEffect(() => {
    const onMouseMove = (event) => {
      const mouse = walkMouseRef.current;
      if (!walkingMode || !mouse.dragging) return;

      const deltaX = event.clientX - mouse.x;
      const deltaY = event.clientY - mouse.y;
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      walkLookRef.current?.(deltaX, deltaY);
    };
    const onMouseUp = () => {
      walkMouseRef.current.dragging = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      walkMouseRef.current.dragging = false;
    };
  }, [walkingMode]);

  useEffect(() => {
    if (!walkingMode) {
      walkKeysRef.current = {};
      return undefined;
    }

    const walkKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
    const onKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return;
      }
      if (!walkKeys.has(event.code)) return;
      event.preventDefault();
      walkKeysRef.current[event.code] = true;
    };
    const onKeyUp = (event) => {
      if (walkKeys.has(event.code)) {
        event.preventDefault();
        walkKeysRef.current[event.code] = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      walkKeysRef.current = {};
    };
  }, [walkingMode]);

  useEffect(() => {
    if (!showFactory && walkingMode) setWalkingMode(false);
  }, [showFactory, walkingMode]);

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
  }, [animate, setLiveStatus]);

  return (
    <div className="dt-wrapper">
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
            gripperOpen={gripperOpen}
            setGripperOpen={setGripperOpen}
            showFactory={showFactory}
            setShowFactory={setShowFactory}
            otokarAxes={otokarAxes}
            setOtokarAxes={setOtokarAxes}
          />
        </div>

        {/* Mobile drawer overlay */}
        {panelOpen && (
          <div className="drawer-overlay" onClick={() => setPanelOpen(false)} />
        )}

        {/* Right viewport */}
        <div
          className={`twin-viewport${walkingMode ? " walking-mode" : ""}`}
          onMouseDown={handleViewportMouseDown}
          onWheel={handleViewportWheel}
        >
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
          </div>

          <ModelLoadingOverlay />

          <Canvas
            shadows
            /*
             * Tone mapping and exposure, set rather than left to whatever the
             * default happens to be. ACES filmic rolls the highlights off
             * instead of clipping them, which is the difference between a lit
             * white panel that still has panel in it and one that has gone to
             * flat paper. Exposure slightly under 1 keeps the roof lights and
             * the pale mast inside the range they roll off in.
             */
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: "high-performance",
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: LIGHTING.exposure,
            }}
            style={{ background: "#dfe8ef" }}
            dpr={[1, 1.5]}
            /* PRESENTATION OVERVIEW, FROM THE OTHER SIDE OF THE CELL.
               Searched by scripts/otokar/camera_framing_reverse.mjs.

               The previous pose looked from +z. This one looks back across the
               hall from -z, closer in, and is scored on THE SMALLER OF THE TWO
               GANTRIES' on-screen areas rather than on the cells' -- maximising
               their sum lets one machine fill the frame while the other is a
               sliver, which is not what "see the robots better" asks for.

               A literal 180-degree flip of the old azimuth is not available and
               the search shows why: it lands within 8 degrees of the rail axis,
               where the 12 m vehicle foreshortens to nothing and the cell reads
               as a line. The band either side of it is empty for the same
               reason. This is the nearest good direction on the reverse side.

               The top-scoring pose was NOT taken. It sits against the west wall
               at x -15.37 and fills 55.6% of the frame with robot 1, but the
               workcell shrinks to 2.9% -- the score rewards the gantries and
               says nothing about the rest of the hall, so it drifts to where
               there is nothing else to see. This pose is from the band that
               keeps both:

                 robot 1        27.4% of frame, 96% unoccluded by the vehicle
                 robot 2        40.2% of frame, 74% unoccluded
                 Otokar cell    43.8%, fully in frame
                 IFARLAB        19.6%, fully in frame -- against 2.9%
                 parked buses   pearl and steel on screen
                 distance       13.8 m, against 18.3 for the top row
                 eye            9.0 m, just under the 9.15 m camera ceiling

               Nothing stands in the view cone within 4 m, checked against the
               warehouse racking the same way as the earlier framings. */
            camera={{ position: [9.91, 5.0, 39.83], fov: 30, near: 0.05, far: 150 }}
          >
            <Suspense fallback={<Loader />}>
              {/* Both cells are now in one close composition; the bare-grid
                  fog range (18-40 m) would haze the Otokar meshes away, so
                  push fog out while the cell is on. */}
              <Scene
                showGrid={!showFactory}
                interior={showFactory}
                fogNear={42}
                fogFar={95}
              >
                {/* The whole workcell hangs off this one group, so
                    IFARLAB_OFFSET moves all of it together, unchanged in every
                    internal dimension. It is the only thing to edit to
                    reposition the cell. */}
                <group position={IFARLAB_OFFSET}>
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
                        gripperOpen={gripperOpen}
                      />
                    </group>
                  </group>
                  <EnvironmentElements />
                </group>
                <OtokarCell
                  show
                  robotAxes={otokarAxes}
                  showBus
                  showRails
                  lodMode="auto"
                  animate={animate}
                />
                <Factory show={showFactory} />
                {showFactory && (
                  <>
                    {/* Parked presentation buses; the Otokar inspection bus
                        remains the separate, dimensioned CAD model above. */}
                    {PARKED_BUSES.map((bus) => <Bus key={bus.livery} {...bus} />)}
                    <FactoryMarkings />
                    <Workers />
                    <Drones />
                  </>
                )}
              </Scene>
              <RailAnimator
                animate={animate}
                ur10eGroupRef={ur10eGroupRef}
                agvGroupRef={agvGroupRef}
              />
            </Suspense>
            <OrbitControls
              ref={controlsRef}
              enabled={!walkingMode}
              enableDamping
              dampingFactor={0.05}
              enablePan={false}
              minDistance={0.5}
              maxDistance={24}
              maxPolarAngle={Math.PI / 2 + 0.1}
              /* Pivot between the two cells so orbiting keeps the inspection
                 area central; the opening view stays inside maxDistance at
                 13.8 m, which also leaves real room to pull back -- the
                 previous framing opened at 23.2 m against a limit of 24, so
                 the first scroll outwards did almost nothing.

                 x and z are the two cells' shared horizontal centre. The
                 height came out of the same search, which pinned it at the
                 bottom of the range it was given: aiming below the cells' own
                 centre lifts the tall machines into the frame rather than
                 cutting them, and from a 9 m eye that is what keeps the
                 gantries whole. */
              target={[0.23, 1.2, -1.17]}
              /* DEV ONLY: prints the camera pose whenever a drag or zoom
                 settles, so a framing found by hand can be read off exactly
                 and pasted into the `camera` prop above rather than guessed
                 back from a screenshot. Stripped from production builds by
                 the NODE_ENV check -- CRA inlines it, so the whole handler
                 folds away. Remove once the default framing is settled. */
              onEnd={
                process.env.NODE_ENV === "development"
                  ? (e) => {
                      const c = e?.target?.object;
                      const t = e?.target?.target;
                      if (!c || !t) return;
                      const f = (v) => Number(v.toFixed(2));
                      // eslint-disable-next-line no-console
                      console.log(
                        "[camera] position=[%s] target=[%s] distance=%s",
                        [c.position.x, c.position.y, c.position.z].map(f).join(", "),
                        [t.x, t.y, t.z].map(f).join(", "),
                        c.position.distanceTo(t).toFixed(2),
                      );
                    }
                  : undefined
              }
            />
            <FactoryCameraController
              controlsRef={controlsRef}
              walkingMode={walkingMode}
              keysRef={walkKeysRef}
              walkStepRef={walkStepRef}
              walkLookRef={walkLookRef}
              walkZoomRef={walkZoomRef}
            />
          </Canvas>

          {/* Manual equivalents of the mouse gestures (rotate / zoom) */}
          <div className="view-controls" aria-label="3D view controls">
            <button
              type="button"
              className={`walk-toggle${walkingMode ? " active" : ""}`}
              onClick={() => setWalkingMode((enabled) => !enabled)}
              aria-pressed={walkingMode}
              aria-label={walkingMode ? "Exit walking mode" : "Enter walking mode"}
              title={walkingMode ? "Exit walking mode" : "Enter walking mode"}
            >
              {walkingMode ? "Walk mode" : "Walk"}
            </button>
            <span className="walk-hint">
              {walkingMode ? "WASD + drag to look" : "Explore factory"}
            </span>
            <div className="view-dpad">
              <button
                type="button"
                className="view-btn view-btn-up"
                onClick={() =>
                  walkingMode ? moveWalkBy(1, 0) : orbitBy(0, -ROTATE_STEP)
                }
                aria-label={walkingMode ? "Move forward" : "Rotate up"}
                title={walkingMode ? "Move forward" : "Rotate up"}
              >
                ▲
              </button>
              <button
                type="button"
                className="view-btn view-btn-left"
                onClick={() =>
                  walkingMode ? moveWalkBy(0, -1) : orbitBy(-ROTATE_STEP, 0)
                }
                aria-label={walkingMode ? "Move left" : "Rotate left"}
                title={walkingMode ? "Move left" : "Rotate left"}
              >
                ◀
              </button>
              <button
                type="button"
                className="view-btn view-btn-right"
                onClick={() =>
                  walkingMode ? moveWalkBy(0, 1) : orbitBy(ROTATE_STEP, 0)
                }
                aria-label={walkingMode ? "Move right" : "Rotate right"}
                title={walkingMode ? "Move right" : "Rotate right"}
              >
                ▶
              </button>
              <button
                type="button"
                className="view-btn view-btn-down"
                onClick={() =>
                  walkingMode ? moveWalkBy(-1, 0) : orbitBy(0, ROTATE_STEP)
                }
                aria-label={walkingMode ? "Move backward" : "Rotate down"}
                title={walkingMode ? "Move backward" : "Rotate down"}
              >
                ▼
              </button>
            </div>
            <div className="view-zoom">
              <button
                type="button"
                className="view-btn"
                onClick={() => zoomBy(1.25)}
                disabled={walkingMode}
                aria-label="Zoom out"
                title="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="view-btn"
                onClick={() => zoomBy(0.8)}
                disabled={walkingMode}
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

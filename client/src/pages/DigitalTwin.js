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
import ControlPanel from "../components/ControlPanel";
import Scene from "../components/Scene";
import OtokarCell from "../components/OtokarCell";
import { OTOKAR_ROBOT_HOME } from "../components/otokarAxes";

const API_BASE = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace(/\/api\/auth\/?$/, "/api")
  : "http://localhost:3001/api";

// Both IFARLAB (wrapped below) and the Otokar cell (its own CELL_ORIGIN in
// OtokarCell.js) are shifted by this same amount in +x. Without it the two
// cells sit centred on the combined x-range -14.11..1.75 (centre -6.18m),
// hugging the building's west wall with the east side empty; shifting both by
// +6.18m recentres that combined range on the building's own centre (x=0)
// instead. A rigid shift, so it changes nothing about how the two cells sit
// relative to each other.
const IFARLAB_SHIFT_X = 6.18;

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
            gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
            style={{ background: "#dfe8ef" }}
            dpr={[1, 1.5]}
            /* THE OPENING FRAME, SEARCHED RATHER THAN JUDGED BY EYE.

               scripts/otokar/camera_framing.mjs picks this. It sweeps camera
               azimuth, distance, eye height and target height, keeps only the
               poses that satisfy every constraint below, and scores what is
               left. The boxes are real: verify_cell_fit.mjs replays the
               transform chain for the Otokar cell and measureIfarlab() mounts
               the actual React components for the workcell.

               THE SCORE IS BALANCED, and that is the point of this framing.
               An earlier version maximised the Otokar cell's screen area with
               IFARLAB merely required to be somewhere on screen, and it put
               the workcell at 3.4% of the frame -- present, but not a shot of
               it. The score is now the geometric mean of the two cells' areas,
               which unlike a sum cannot be won by making one term huge:
               halving either factor costs the same. Result: Otokar 37.7%,
               IFARLAB 20.3% -- six times the workcell it had before, for a
               quarter off the Otokar cell.

               The constraints, and why each one is there:

               BOTH CELLS FULLY IN FRAME, 4% clear of every edge, with IFARLAB
               spanning at least 10% of the frame height.

               THE EYE BELOW THE BUS. No single fixed camera can look both
               under the chassis and down onto the roof; those are opposite
               sides of a solid body, and an earlier framing above the roofline
               hid the underbody pass entirely -- half the programme. The bus
               body's lowest MESH point is y 1.51 (136 mm below the placement
               datum at cell Z +278, which CELL_ORIGIN puts at world y 1.646;
               the mesh is what occludes). The eye at 1.30 clears it by 210 mm.

               BOTH GANTRIES VISIBLE, which is the constraint this search
               originally missed. Robot 1's rail is at world x -7.48..-6.68 and
               robot 2's at -0.88..-0.08 -- OPPOSITE SIDES of a vehicle
               occupying x -5.18..-2.66. So the pose a balanced score wants,
               square-on to the rail, hides one machine behind the bus. Sight
               lines are traced from the eye to a grid across each robot's
               swept box and at least half must miss the vehicle: this pose
               gets 81% of robot 1 and 96% of robot 2. IFARLAB is 100% clear.

               AN ANGLE TO THE RAIL BETWEEN 22 AND 75 DEGREES. Below 22 the
               12 m bus foreshortens to nothing down its own axis; above 75 the
               shot flattens into an elevation and robot 1 falls to 67%. This
               pose is 74 deg -- near the top of the band, where the two cells
               are largest, without paying the elevation's price.

               AND NOTHING IN THE WAY NEAR THE EYE. The warehouse carries
               racking down both long walls and near is 0.05 m, so a shelf a
               metre ahead fills the frame. The camera sits 1.5 m off the east
               wall and there IS racking 0.26 m from it -- but behind the
               camera, where it is never drawn. So the test is not radial
               distance, which rejected this whole wall and every good pose
               with it, but whether furniture falls inside the view cone within
               4 m. Verify with:
                 node scripts/otokar/camera_clearance.mjs 14.88 1.3 -5.38 5

               ASPECT IS FRAMED PESSIMISTICALLY at 1.5: the desktop canvas is
               nearer 1.8, but a 1366-wide laptop with the panel open drops to
               ~1.45, and framing for the wider shape would crop the narrow
               one. far stays at 220 because the warehouse's far corner is a
               long way behind the subject. */
            camera={{ position: [7.77, 7.7, 17.77], fov: 37, near: 0.05, far: 150 }}
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
                {/* IFARLAB_SHIFT_X: both IFARLAB and the Otokar cell (its own
                    CELL_ORIGIN in OtokarCell.js) are shifted by the same
                    +6.18 m so the two cells, which used to hug the building's
                    west wall, sit centred in the room instead -- a rigid
                    shift, so the 2.5 m aisle between them and every other
                    relative measurement is unchanged. Keep both in sync if
                    this changes. */}
                <group position={[IFARLAB_SHIFT_X, 0, 0]}>
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

                {/* Original aisle prop, restored with the other large props. */}
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
              /* The horizontal centre of the two cells TOGETHER, not of the
                 Otokar cell alone, and searched alongside the camera pose by
                 scripts/otokar/camera_framing.mjs. enablePan is false, so this
                 is also the pivot every drag turns about: centring it on one
                 cell would swing the other out of shot on the first orbit.

                 Its height is bounded by maxPolarAngle. The eye sits BELOW the
                 target, so the polar angle is past pi/2 and rises as the target
                 climbs; the search rejects anything within 0.04 rad of the
                 pi/2 + 0.1 limit, because damping overshoots on the first drag
                 and a pose any closer snaps against the clamp. At 2.4 the
                 angle is 1.6298, which is 0.041 clear. */
              target={[0.23, 2.2, -1.17]}
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

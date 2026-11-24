import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { XR } from "@react-three/xr";
import * as THREE from "three";
import "./DigitalTwin.css";
import "../components/setupGltf";
import UR10eRobot from "../components/UR10eRobot";
import KawasakiRobot from "../components/KawasakiRobot";
import AGVBase from "../components/AGVBase";
import UR10eMount from "../components/UR10eMount";
import IfarlabTasks from "../components/IfarlabTasks";
import ServerCabinets, { IfarlabCabinet } from "../components/ServerCabinets";
import RobotCameraFeeds from "../components/RobotCameraFeeds";
import EnvironmentElements from "../components/EnvironmentElements";
import IfarlabCellCopy from "../components/IfarlabCellCopy";
import CellDressing from "../components/CellDressing";
import { HallFloor, PostEffects } from "../components/Realism";
import { RealismContext } from "../components/realismContext";
import { Workwear } from "../components/CeilingServices";
import Factory from "../components/Factory";
import Bus from "../components/Bus";
import Workers from "../components/Workers";
import Drones from "../components/Drones";
import FactoryMarkings, { PARKED_BUSES, Walkway } from "../components/FactoryMarkings";
import WallLogos from "../components/WallLogos";
import SafetyEquipment from "../components/SafetyEquipment";
import HallMonitor from "../components/HallMonitor";
import Forklift from "../components/Forklift";
import FloorCleaner from "../components/FloorCleaner";
import GarageDoors from "../components/GarageDoors";
import Yard from "../components/Yard";
import BodyInspection from "../components/BodyInspection";
import BusShuttle from "../components/BusShuttle";
import { BAY_A } from "../components/busRoute";
import ControlPanel from "../components/ControlPanel";
import Scene from "../components/Scene";
import OtokarCell from "../components/OtokarCell";
import { OTOKAR_ROBOT_HOME } from "../components/otokarAxes";
import { LIGHTING } from "../components/scenePalette";
import { IFARLAB_DOOR_OFFSET, IFARLAB_INSPECTION_OFFSET, IFARLAB_OFFSET } from "../components/cellLayout";
import VRWalk from "../components/VRWalk";
import VRStatsHud from "../components/VRStatsHud";
import {
  IS_QUEST_BROWSER,
  VR_OPTIONS,
  enterVR,
  exitVR,
  useVRSupported,
  useXRSessionActive,
  xrStore,
} from "../components/xrSession";
import { latestJointStates, subscribeJointStates } from "../components/telemetryStream";
import { setPresenceName, usePresence } from "../components/presence";
import Visitors, { PresenceBroadcaster } from "../components/Visitors";
import { VREntryDialog, VRRoster } from "../components/VisitorName";
import TrainingStations from "../components/training/TrainingStations";
import VRSoundscape from "../components/VRSoundscape";
import { unlockAudio } from "../components/vrAudio";
import { RobotHitBoxes, RobotInfoCard, RobotInfoPanel3D } from "../components/RobotInfo";
import DigitalGuide from "../components/guide/DigitalGuide";
import GuideCamera from "../components/guide/GuideCamera";
import VRGuide from "../components/guide/VRGuide";
import useGuideTour from "../components/guide/useGuideTour";
import OtokarPickPlace from "../components/OtokarPickPlace";
import GuideFocusIndicator from "../components/guide/GuideFocusIndicator";

/*
 * What a click on each robot resolves to: the part that moves, so the click
 * target follows it. The Otokar gantries are found by name because they mount
 * inside OtokarCell's Suspense; their carriage carries everything but the rail.
 */
const otokarCarriage = (robotId) => (scene) =>
  scene.getObjectByName(`${robotId}-cad-frame`)?.getObjectByName("axis-1-carriage");

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
/*
 * THE OPENING VIEW, for a presentation: from the front of the east cells,
 * 3.3 m up and a little further back, looking north-west and gently down over
 * all four IFARLAB cells, so every robot, the fences, the conveyors and the
 * operators read clearly, with the Otokar gantry, the buses and the far
 * wall's signs and screens behind. Recovered from a framing chosen by hand in
 * the browser: the four cell tags' anchors, the three signs and the two
 * screens fix it to about a pixel. That framing used the opening lens as it
 * is, so only the eye and target change.
 *
 * The target is on the line of sight in the aisle between the two rows, the
 * middle of the four cells, so orbiting turns about them; the headset's spawn
 * (8 m short of it, VRWalk.js) lands in the open front aisle.
 */
const OPENING_EYE = [14.64, 3.33, 17.37];
const ORBIT_TARGET = [8.54, 2.5, 6.26];
// Orbit lens: the opening field of view, and how wide zooming out may open it.
const BASE_FOV = 42;
const MAX_FOV = 62;
// That view is framed on a canvas this wide (a 16:10 screen with the panel
// open). A narrower canvas -- a smaller laptop, a 4:3 projector -- opens the
// lens until the same width fits, so no cell is cut off at the sides.
const FRAMED_ASPECT = 1.84;
const FRAMED_HALF_WIDTH = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * FRAMED_ASPECT;
function openingFov(aspect) {
  return Math.max(BASE_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(FRAMED_HALF_WIDTH / aspect)));
}
/*
 * The Otokar program runs on the axes' real speeds (500 mm/s on the rail,
 * 250 mm/s on the arm), which put the first scan ~20 s after the engine comes
 * on: withdraw 1800 mm, travel, extend 1800 mm again. For a presentation the
 * whole program plays faster -- every move and dwell alike, so the motion
 * profiles keep their shape and the collision-checked paths are unchanged.
 */
const OTOKAR_DEMO_SPEED = 4;
// Walking pace, and Shift to run.
const WALK_SPEED = 7.5;
const RUN_FACTOR = 2;

/*
 * The hall's roof is an arch -- 10.07 m on the centre line down to 6.98 m at
 * the side walls -- so a flat 9.15 m ceiling let the camera rise straight
 * through the roof near the walls, and zooming out there put it outside the
 * building. The ceiling now follows the arch, 0.9 m under it.
 */
const ROOF_PROFILE = [[0, 10.07], [4.05, 9.88], [7.6, 9.4], [10.48, 8.83], [13.55, 8.0], [16.27, 6.98]];
function ceilingAt(x) {
  const ax = Math.abs(x);
  for (let i = 1; i < ROOF_PROFILE.length; i += 1) {
    const [x1, y1] = ROOF_PROFILE[i];
    if (ax <= x1) {
      const [x0, y0] = ROOF_PROFILE[i - 1];
      return y0 + ((ax - x0) / (x1 - x0)) * (y1 - y0) - 0.9;
    }
  }
  return ROOF_PROFILE[ROOF_PROFILE.length - 1][1] - 0.9;
}

/*
 * Keeps the orbit camera inside the building WITHOUT fighting the orbit.
 *
 * Clamping the position axis by axis (what clampFactoryCamera does) pins a
 * camera that has swung past a wall against that wall -- and since the
 * opening view is ~26 m from its target in a hall 49 m long, almost every
 * drag swung it past one, so the view barely turned and the camera slid
 * along the cladding. Instead, when the camera would leave the hall it is
 * pulled in along its own line of sight to the target, to just inside the
 * wall: the view keeps turning as dragged and simply comes closer, the way a
 * camera boom stops at a wall.
 */
const orbitScratch = { offset: new THREE.Vector3(), probe: new THREE.Vector3() };
function insideHall(p) {
  const b = FACTORY_CAMERA_BOUNDS;
  return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ
    && p.y >= b.minY && p.y <= Math.min(b.maxY, ceilingAt(p.x));
}
function keepOrbitInside(camera, target) {
  if (insideHall(camera.position) || !insideHall(target)) {
    clampFactoryCamera(camera);
    return;
  }
  const { offset, probe } = orbitScratch;
  offset.subVectors(camera.position, target);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2;
    if (insideHall(probe.copy(target).addScaledVector(offset, mid))) lo = mid;
    else hi = mid;
  }
  camera.position.copy(target).addScaledVector(offset, lo * 0.98);
}

function clampFactoryCamera(camera) {
  camera.position.x = THREE.MathUtils.clamp(
    camera.position.x,
    FACTORY_CAMERA_BOUNDS.minX,
    FACTORY_CAMERA_BOUNDS.maxX,
  );
  camera.position.y = THREE.MathUtils.clamp(
    camera.position.y,
    FACTORY_CAMERA_BOUNDS.minY,
    Math.min(FACTORY_CAMERA_BOUNDS.maxY, ceilingAt(camera.position.x)),
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
  xrActive,
  guided,
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
    walkStepRef.current = walkingMode && !xrActive ? moveCamera : null;
    return () => {
      walkStepRef.current = null;
    };
  }, [walkingMode, xrActive, walkStepRef, moveCamera]);

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
    camera.fov = THREE.MathUtils.clamp(camera.fov + deltaY * 0.035, 30, 65);
    camera.updateProjectionMatrix();
  }, [camera]);

  // Follow the canvas's shape with the opening lens (openingFov), but only
  // while the lens is still where it opened -- never undo a zoom.
  const size = useThree((state) => state.size);
  const openingLens = useRef(null);
  useEffect(() => {
    if (walkingMode || xrActive || guided || !size.height) return;
    const fov = openingFov(size.width / size.height);
    if (openingLens.current == null || Math.abs(camera.fov - openingLens.current) < 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    openingLens.current = fov;
  }, [size, camera, walkingMode, xrActive, guided]);

  useEffect(() => {
    walkLookRef.current = walkingMode && !xrActive ? lookCamera : null;
    walkZoomRef.current = walkingMode && !xrActive ? zoomCamera : null;
    return () => {
      walkLookRef.current = null;
      walkZoomRef.current = null;
    };
  }, [walkingMode, xrActive, walkLookRef, walkZoomRef, lookCamera, zoomCamera]);

  useEffect(() => {
    if (!walkingMode || xrActive) return;

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
  }, [walkingMode, xrActive, controlsRef, camera]);

  useFrame((_, delta) => {
    // In a headset the camera is the headset's; VRWalk keeps it in the hall.
    if (xrActive || guided) return;
    if (!walkingMode) {
      const controls = controlsRef.current;
      if (controls) keepOrbitInside(camera, controls.target);
      else clampFactoryCamera(camera);
      return;
    }

    const keys = keysRef.current;
    const forwardAmount = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const strafeAmount = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (forwardAmount === 0 && strafeAmount === 0) return;

    const length = Math.hypot(forwardAmount, strafeAmount) || 1;
    const speed = WALK_SPEED * (keys.ShiftLeft || keys.ShiftRight ? RUN_FACTOR : 1);
    moveCamera(
      (forwardAmount / length) * speed * delta,
      (strafeAmount / length) * speed * delta,
    );
  });

  return null;
}

export default function DigitalTwin({ liveStatus }) {
  const [selectedRobot, setSelectedRobot] = useState("gantry1");
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
  // The mobile drawer (below 900px) starts closed so the scene is what a phone
  // opens on; on desktop the sidebar is a column, not a drawer, and is open.
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 900px)").matches,
  );
  // ...and follows the width after load too: a window narrowed to phone size
  // (or a browser switched to its mobile view) used to keep the drawer open
  // over the scene, since the width was only read once.
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 900px)");
    const onChange = (event) => setPanelOpen(!event.matches);
    mobile.addEventListener("change", onChange);
    return () => mobile.removeEventListener("change", onChange);
  }, []);
  // Desktop-only: collapses the sidebar to zero width so the viewport takes the
  // full row. Separate from panelOpen, which drives the mobile slide-in drawer.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Otokar MATISSE cell -- manual/demo only, no live telemetry yet. Axes are
  // millimetres of travel for 1-3 and degrees for 4-5; see gantryAxes.js.
  // Both portals share one runway, so they start at different stations along
  // it -- see OTOKAR_ROBOT_HOME.
  const [gantryAxes, setGantryAxes] = useState(OTOKAR_ROBOT_HOME);
  const [walkingMode, setWalkingMode] = useState(false);
  const vrSupported = useVRSupported();
  const inVR = useXRSessionActive();
  // The headset shading profile: on the Quest browser from the first frame (so
  // entering VR recompiles nothing), elsewhere only while a session runs.
  const headsetShading = IS_QUEST_BROWSER || inVR;
  // The realistic look (Realism.js) is the desktop's only look; a headset
  // keeps the classic rig, as its frame budget has no room for the extra
  // passes. Scenario names stay in Mira's topic browser and narration, so
  // the production floor remains free of floating signs.
  const realistic = showFactory && !headsetShading;
  // The Otokar tier: whatever the URL asks for, else the headset's own 'vr'
  // tier (0.32 M triangles against 0.79 M on lo and 6 M on hi; see
  // xrSession.js) and distance-based switching elsewhere.
  const otokarLod = VR_OPTIONS.lod ?? (headsetShading ? "vr" : "auto");
  // Decoration the headset leaves out unless ?vrscenery=full.
  const fullScenery = !headsetShading || VR_OPTIONS.scenery === "full";
  // Everyone else looking at the hall, and this page's own place in it.
  usePresence(inVR ? "vr" : "desktop");
  // Enter VR first asks the wearer's name (VisitorName.js); only people in VR
  // go by a name, so it is dropped again on leaving.
  const [askVRName, setAskVRName] = useState(false);
  useEffect(() => {
    if (!inVR) setPresenceName("");
  }, [inVR]);
  // The robot whose details panel is open, if any (RobotInfo.js).
  const [infoRobot, setInfoRobot] = useState(null);
  const closeInfo = useCallback(() => setInfoRobot(null), []);
  const infoContext = useMemo(() => ({ animate, liveStatus }), [animate, liveStatus]);
  const prepareGuideScene = useCallback(() => {
    setWalkingMode(false);
    setShowFactory(true);
    setAnimate(true);
    setPanelOpen(false);
    setInfoRobot(null);
  }, []);
  const guide = useGuideTour({ inVR, prepareScene: prepareGuideScene });
  const xrOriginRef = useRef(null);

  const liveUrTool = useRef(null);
  const liveKawTool = useRef(null);
  const ur10eGroupRef = useRef(null);
  const agvGroupRef = useRef(null);
  // Each fastening cell's driver handle, and whether its operator holds it.
  const tableAssist = { handleRef: useRef(null), activeRef: useRef(false) };
  // The door cell's operator is choreographed by its program instead
  // (DoorFasteningTasks.js): it writes her pose here every frame.
  const doorAssist = { activeRef: useRef(false), operatorRef: useRef(null) };
  // Refs the IFARLAB tasks drive the two arms through (IfarlabTasks.js).
  const urJointsRef = useRef(null);
  const urToolRef = useRef(null);
  const urDriveRef = useRef(null);
  const urGripRef = useRef(null);
  const kawJointsRef = useRef(null);
  const kawToolRef = useRef(null);
  const kawDriveRef = useRef(null);
  const urTask = useMemo(() => ({
    jointsRef: urJointsRef, toolRef: urToolRef, driveRef: urDriveRef, gripRef: urGripRef, groupRef: ur10eGroupRef,
  }), []);
  const kawTask = useMemo(() => ({
    jointsRef: kawJointsRef, toolRef: kawToolRef, driveRef: kawDriveRef, groupRef: agvGroupRef,
  }), []);
  const robotTargets = useMemo(() => [
    { id: "ur10e", resolve: (scene) => scene.getObjectByName("live-ur10e") },
    { id: "kawasaki", resolve: (scene) => scene.getObjectByName("live-kawasaki") },
    { id: "robot1", resolve: otokarCarriage("robot1") },
    { id: "robot2", resolve: otokarCarriage("robot2") },
  ], []);
  const controlsRef = useRef(null);
  // The page's own camera. During a session R3F swaps in the headset's, so
  // VRWalk reads where the desktop view was from this.
  const desktopCameraRef = useRef(null);
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
    if (guide.active) guide.stop();
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
    keepOrbitInside(camera, controls.target);
    camera.lookAt(controls.target);
    controls.update();
  };

  /*
   * Orbit zoom, shared by the wheel and the +/- buttons. Out: the camera backs
   * away from the target -- and where it cannot, because it is already against
   * the building's walls or at the distance limit, the lens widens instead, so
   * zooming out always shows more. In: the lens narrows back to its normal
   * field first, then the camera moves in. OrbitControls' own zoom is off: its
   * dolly stops dead at the wall, which is why zooming out did nothing.
   */
  const zoomBy = (factor) => {
    if (guide.active) guide.stop();
    const controls = controlsRef.current;
    if (!controls) return;
    const camera = controls.object;
    const baseFov = openingFov(camera.aspect);
    if (factor < 1 && camera.fov > baseFov + 0.01) {
      camera.fov = Math.max(baseFov, camera.fov * factor);
      camera.updateProjectionMatrix();
      return;
    }
    const offset = new THREE.Vector3()
      .copy(camera.position)
      .sub(controls.target);
    const before = camera.position.clone();
    const distance = THREE.MathUtils.clamp(
      offset.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    );
    offset.setLength(distance);
    camera.position.copy(controls.target).add(offset);
    keepOrbitInside(camera, controls.target);
    const moved = camera.position.distanceTo(before);
    if (factor > 1 && moved < 0.05) {
      camera.fov = Math.min(Math.max(MAX_FOV, baseFov), camera.fov * factor);
      camera.updateProjectionMatrix();
    }
    controls.update();
  };

  const moveWalkBy = (forwardAmount, strafeAmount) => {
    // One press of an on-screen arrow is a two-metre step.
    walkStepRef.current?.(forwardAmount * 2, strafeAmount * 2);
  };

  /*
   * Dragging the viewport: looks around in walk mode, orbits otherwise.
   *
   * The orbit is driven here rather than by OrbitControls' own pointer
   * handling, which never saw the drag in this layout (its listeners sit on an
   * element the viewport's own handlers and overlays shadow), so the view
   * would not turn. Pointer events, so a touch drag orbits too.
   */
  const orbitRef = useRef(null);
  orbitRef.current = orbitBy;
  const pointerDownRef = useRef(null);
  const wheelRef = useRef(null);
  const handleViewportMouseDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".view-controls, [data-guide-ui], button, a")) return;
    if (guide.active) guide.stop();
    event.preventDefault();
    walkMouseRef.current = {
      dragging: true,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handleViewportWheel = (event) => {
    if (event.target.closest(".view-controls, [data-guide-ui]")) return;
    event.preventDefault();
    if (walkingMode) {
      walkZoomRef.current?.(event.deltaY);
      return;
    }
    zoomBy(event.deltaY > 0 ? 1.1 : 1 / 1.1);
  };

  pointerDownRef.current = handleViewportMouseDown;
  wheelRef.current = handleViewportWheel;

  /*
   * Native capture-phase listeners for drag and wheel on the 3D view. The
   * wheel one is non-passive so it can stop the page scrolling.
   */
  useEffect(() => {
    // On the window, filtered to the 3D view: the WebGL canvas is not a DOM
    // descendant of the viewport div, so neither a React handler nor a
    // listener on that div ever saw a drag that started on the scene.
    const inViewport = (event) => {
      const t = event.target;
      if (!(t instanceof Element)) return false;
      // The robot details card scrolls and selects text like any page element.
      if (t.closest(".view-controls, .sidebar-toggle, .panel-toggle, .robot-info, [data-guide-ui], button, a, input")) return false;
      return t.tagName === "CANVAS" || Boolean(t.closest(".twin-viewport"));
    };
    const down = (event) => { if (inViewport(event)) pointerDownRef.current?.(event); };
    const wheel = (event) => { if (inViewport(event)) wheelRef.current?.(event); };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("wheel", wheel, { capture: true });
    };
  }, []);

  useEffect(() => {
    const onMouseMove = (event) => {
      const mouse = walkMouseRef.current;
      if (!mouse.dragging) return;

      const deltaX = event.clientX - mouse.x;
      const deltaY = event.clientY - mouse.y;
      mouse.x = event.clientX;
      mouse.y = event.clientY;
      if (walkingMode) walkLookRef.current?.(deltaX, deltaY);
      else orbitRef.current?.(-deltaX * 0.0045, -deltaY * 0.0045);
    };
    const onMouseUp = () => {
      walkMouseRef.current.dragging = false;
    };

    window.addEventListener("pointermove", onMouseMove);
    window.addEventListener("pointerup", onMouseUp);
    window.addEventListener("pointercancel", onMouseUp);
    return () => {
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("pointerup", onMouseUp);
      window.removeEventListener("pointercancel", onMouseUp);
      walkMouseRef.current.dragging = false;
    };
  }, [walkingMode]);

  useEffect(() => {
    if (!walkingMode) {
      walkKeysRef.current = {};
      return undefined;
    }

    const walkKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
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

  /*
   * Only the monitoring station receives these poses. The simulation cells
   * use their own task controllers regardless of the stream state.
   */
  const applyJointStates = useCallback((payload) => {
    if (Array.isArray(payload.ur10e) && payload.ur10e.length === 6 && payload.ur10e.every(Number.isFinite)) setJointAngles(payload.ur10e);
    if (Array.isArray(payload.kawasaki) && payload.kawasaki.length === 6 && payload.kawasaki.every(Number.isFinite)) setKawasakiAngles(payload.kawasaki);
    if (Number.isFinite(payload.ur10eRail)) setRailPosition(payload.ur10eRail);
    if (Number.isFinite(payload.agvRail)) setAgvRailPosition(payload.agvRail);
  }, []);

  useEffect(() => subscribeJointStates((payload) => {
    applyJointStates(payload);
  }), [applyJointStates]);

  useEffect(() => {
    const latest = latestJointStates();
    if (latest) applyJointStates(latest);
  }, [applyJointStates]);

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
            gantryAxes={gantryAxes}
            setGantryAxes={setGantryAxes}
          />
        </div>

        {/* Mobile drawer overlay */}
        {panelOpen && (
          <div className="drawer-overlay" onClick={() => setPanelOpen(false)} />
        )}

        {/* Right viewport */}
        <div
          className={`twin-viewport${walkingMode ? " walking-mode" : ""}${guide.active ? " guided-view" : ""}`}
        >
          <button
            className="panel-toggle"
            onClick={() => setPanelOpen((o) => !o)}
            aria-label="Toggle control panel"
          >
            {/* Not "Menu": the navbar's toggle is the page menu on phones. */}
            Control panel
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


          <Canvas
            shadows
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: "high-performance",
              toneMapping: THREE.AgXToneMapping,
              toneMappingExposure: LIGHTING.exposure,
            }}
            style={{ background: "#dfe8ef" }}
            dpr={[1, 1.5]}
            /* The opening view; see OPENING_EYE. */
            camera={{ position: OPENING_EYE, fov: BASE_FOV, near: 0.05, far: 150 }}
            onCreated={(state) => {
              desktopCameraRef.current = state.camera;
            }}
          >
            <XR store={xrStore}>
              <Suspense fallback={null}>
                {/* Both cells are now in one close composition; the bare-grid
                    fog range (18-40 m) would haze the Otokar meshes away, so
                    push fog out while the cell is on. */}
                <RealismContext.Provider value={realistic}>
                <Scene
                  showGrid={!showFactory}
                  interior={showFactory}
                  fogNear={42}
                  fogFar={95}
                  softShadows={!headsetShading || VR_OPTIONS.shadows === "soft"}
                  castShadows={!headsetShading || VR_OPTIONS.shadows !== "off"}
                  realism={realistic}
                >
                  {/* The whole workcell hangs off this one group, so
                      IFARLAB_OFFSET moves all of it together, unchanged in every
                      internal dimension. It is the only thing to edit to
                      reposition the cell. */}
                  <group name="cell-pickPlace" position={IFARLAB_OFFSET}>
                    {/* UR10e sits on its own 7th-axis carriage (UR10eMount), which
                        rides the fixed rail rendered in EnvironmentElements
                        (base_link.stl). railPosition is that 7th axis --
                        ur10e_base_to_robot_mount from Mongo (metres along the
                        rail) when live, or the slider in ControlPanel otherwise. */}
                    <group
                      ref={ur10eGroupRef}
                      position={[-0.147, 0.58635, -1.115]}
                    >
                      <UR10eMount />
                      <UR10eRobot
                        jointAngles={[0, -90, 0, -90, 0, 0]}
                        gripperOpen={gripperOpen}
                        animate={animate}
                        telemetryId="demo-ur10e"
                        jointsRef={urTask.jointsRef}
                        toolRef={urTask.toolRef}
                        driveRef={urTask.driveRef}
                        gripRef={urTask.gripRef}
                      />
                    </group>
                    <group
                      ref={agvGroupRef}
                      position={[-2.301949, 0.17, -.530401]}
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
                          jointAngles={[0, 20, -30, 0, 45, 0]}
                          animate={animate}
                          gripperOpen={gripperOpen}
                          telemetryId="demo-kawasaki"
                          jointsRef={kawTask.jointsRef}
                          toolRef={kawTask.toolRef}
                          driveRef={kawTask.driveRef}
                        />
                      </group>
                    </group>
                    {/* In a headset the training infeed runs through the
                        fence panel in front of the conveyor, so it opens. */}
                    <EnvironmentElements infeedOpening={inVR} />
                    {/* Pick and place, chassis inspection: the cell's jobs,
                        run whenever the engine is on. */}
                    <IfarlabTasks active={animate} ur={urTask} kawasaki={kawTask} />
                    <IfarlabCabinet />
                    <CellDressing running={animate} />
                  </group>
                  <IfarlabCellCopy active={animate} inVR={inVR} assistantHandleRef={tableAssist.handleRef} assistantActiveRef={tableAssist.activeRef} />
                  <IfarlabCellCopy active={animate} offset={IFARLAB_INSPECTION_OFFSET} scenario="inspection" />
                  <IfarlabCellCopy active={animate} offset={IFARLAB_DOOR_OFFSET} scenario="door" assistantActiveRef={doorAssist.activeRef} operatorRef={doorAssist.operatorRef} />
                  {/* Each robot's camera view, rendered small for the panel. */}
                  <RobotCameraFeeds ur={{ toolRef: liveUrTool }} kawasaki={{ toolRef: liveKawTool }} />
                  <OtokarCell
                    show
                    robotAxes={gantryAxes}
                    showBus
                    showRails
                    lodMode={guide.session && !inVR ? "lo" : otokarLod}
                    animate={animate}
                    animationSpeed={OTOKAR_DEMO_SPEED}
                  />
                  {/* The cell's work made visible: scan beams, finds, progress. */}
                  <BodyInspection />
                  <OtokarPickPlace jointAngles={jointAngles} kawasakiAngles={kawasakiAngles} railPosition={railPosition} agvRailPosition={agvRailPosition} urToolRef={liveUrTool} kawToolRef={liveKawTool} />
                  {/* Other people on the page, as workers where they stand. */}
                  <Visitors />
                  {/* Click (or point and trigger) a robot for its details. */}
                  <RobotHitBoxes targets={robotTargets} selected={infoRobot} onSelect={setInfoRobot} />
                  {inVR && infoRobot && (
                    <RobotInfoPanel3D robotId={infoRobot} context={infoContext} onClose={closeInfo} />
                  )}
                  <Factory show={showFactory} />
                  {showFactory && (
                    <Suspense fallback={null}>
                      <HallFloor />
                    </Suspense>
                  )}
                  {showFactory && (
                    <>
                      {/* Parked presentation buses; the Otokar inspection bus
                          remains the separate, dimensioned CAD model above.
                          Left out in a headset, with the other moving
                          decoration below (fullScenery). */}
                      {fullScenery && PARKED_BUSES.map(({ shuttle, ...bus }) => (shuttle
                        ? <BusShuttle key={bus.livery} livery={bus.livery} startsInA={bus.position[0] === BAY_A[0]} />
                        : <Bus key={bus.livery} {...bus} />))}
                      <FactoryMarkings />
                      <Walkway />
                      <Suspense fallback={null}>
                        <Workwear />
                      </Suspense>
                      <WallLogos />
                      <HallMonitor />
                      <SafetyEquipment />
                      <ServerCabinets />
                      {fullScenery && <Forklift />}
                      {fullScenery && <FloorCleaner />}
                      <GarageDoors />
                      {fullScenery && <Yard />}
                      <Workers inVR={inVR} tableAssist={tableAssist} doorAssist={doorAssist} />
                      {fullScenery && <Drones />}
                    </>
                  )}
                </Scene>
                </RealismContext.Provider>
                {/* Subscribe after the robot task components have mounted.
                    A camera outside this Suspense subscribed before them and
                    followed the previous frame's pose after initial loading. */}
                <GuideCamera
                  request={guide.request}
                  paused={Boolean(guide.session?.paused)}
                  controlsRef={controlsRef}
                  onArrive={guide.arrive}
                  disabled={inVR}
                />
                <GuideFocusIndicator request={guide.request} disabled={inVR} />
              </Suspense>
              <OrbitControls
                ref={controlsRef}
                enabled={!walkingMode && !inVR}
                enableDamping
                dampingFactor={0.05}
                enablePan={false}
                enableZoom={false}
                enableRotate={false}
                minDistance={0.5}
                maxDistance={34}
                maxPolarAngle={Math.PI / 2 + 0.1}
                target={ORBIT_TARGET}
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
                xrActive={inVR}
                guided={guide.active}
                keysRef={walkKeysRef}
                walkStepRef={walkStepRef}
                walkLookRef={walkLookRef}
                walkZoomRef={walkZoomRef}
              />
              <VRWalk
                originRef={xrOriginRef}
                guideActive={inVR && guide.active}
                desktopCameraRef={desktopCameraRef}
                walkingMode={walkingMode}
                orbitTarget={ORBIT_TARGET}
                bounds={FACTORY_CAMERA_BOUNDS}
              />
              {inVR && <VRGuide guide={guide} originRef={xrOriginRef} />}
              <PresenceBroadcaster
                bounds={FACTORY_CAMERA_BOUNDS}
                walkingMode={walkingMode}
                orbitTarget={ORBIT_TARGET}
              />
              {/* Headset only: hands-on training stations and the hall's sound. */}
              {inVR && !guide.active && <TrainingStations />}
              {inVR && <VRSoundscape targets={robotTargets} ducked={guide.active && !guide.session?.paused} />}
              {VR_OPTIONS.stats && <VRStatsHud />}
              {realistic && <PostEffects />}
            </XR>
          </Canvas>

          <DigitalGuide guide={guide} inVR={inVR} liveStatus={liveStatus} animate={animate} />

          {!inVR && infoRobot && (
            <RobotInfoCard robotId={infoRobot} context={infoContext} onClose={closeInfo} />
          )}
          {/* Who is in VR right now, live, for the people on the web. */}
          <VRRoster />
          {askVRName && (
            <VREntryDialog
              onEnter={() => {
                setAskVRName(false);
                // The dialog's click is the gesture browsers want before
                // playing sound, and WebXR before starting a session.
                unlockAudio();
                enterVR();
              }}
              onCancel={() => setAskVRName(false)}
            />
          )}

          {/* Manual equivalents of the mouse gestures (rotate / zoom) */}
          <div className="view-controls" aria-label="3D view controls">
            <button
              type="button"
              className={`walk-toggle${walkingMode ? " active" : ""}`}
              onClick={() => { guide.stop(); setWalkingMode((enabled) => !enabled); }}
              aria-pressed={walkingMode}
              aria-label={walkingMode ? "Exit walking mode" : "Enter walking mode"}
              title={walkingMode ? "Exit walking mode" : "Enter walking mode"}
            >
              {walkingMode ? "Walk mode" : "Walk"}
            </button>
            <span className="walk-hint">
              {walkingMode ? "WASD + drag to look" : "Explore factory"}
            </span>
            {/* Only where immersive VR is actually available: a Quest, or
                localhost with the emulator. Desktop visitors never see it. */}
            {vrSupported && (
              <button
                type="button"
                className={`walk-toggle vr-toggle${inVR ? " active" : ""}`}
                onClick={() => {
                  if (inVR) exitVR();
                  else setAskVRName(true);
                }}
                aria-pressed={inVR}
                aria-label={inVR ? "Exit VR" : "Enter VR"}
                title={inVR ? "Exit VR" : "Walk the hall in a VR headset"}
              >
                {inVR ? "Exit VR" : "Enter VR"}
              </button>
            )}
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

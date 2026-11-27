import React, { useRef, useMemo, Suspense } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';
import { PAINT, ACCENT, METAL, SURFACE_FINISH } from './scenePalette';
import { publishTelemetry } from './robotTelemetry';
import { useRealism } from './realismContext';

/*
 * UR10e Robot Visualizer using actual STL meshes from the
 * ESOGU-PickandPlaceScenario / Universal_Robots_ROS2_Description repository.
 *
 * Joint origins and mesh visual offsets are taken directly from ur_macro.xacro.
 * STL files are in millimeters, so scale = 0.001.
 */

const MESH_SCALE = [0.001, 0.001, 0.001];
const MESH_BASE = process.env.PUBLIC_URL + '/meshes/ur10e';

// Material presets// Ana gövde: Fırçalanmış alüminyum/gümüş (Saf beyaz yerine açık gri)
// UR shells are painted/moulded, so they are dielectric. These were at
// metalness 0.42-0.78, which lit an enamelled arm as though it were bare
// alloy: it took the room's colour instead of its own and lost its form the
// moment it left a highlight.
const SILVER = { ...PAINT.shell };

// Eklemler/Motorlar: Koyu renkli döküm metal
const DARK_METAL = { ...PAINT.dark };

// Vurgu kapakları: Anotlanmış mavi alüminyum veya sert plastik
const BLUE_ACCENT = { ...ACCENT.brandBlue };

// Tutucu uç: İşlenmiş karbon çeliği veya mat koyu metal
// The gripper body is anodised alloy -- genuinely bare, so genuinely metallic.
const GRIPPER_MAT = { ...METAL.machined };

// gripper_body_1/lower_1/upper_1.stl share the same raw coordinate frame as
// the rest of the arm's collision meshes (their raw centers sit right past
// flange.stl's along the tool's forward direction), so re-using flange's own
// recentering offset here lands them correctly relative to it -- same trick
// as every other mesh in this chain.
const FLANGE_OFFSET = [-1.106132, -0.502789, -0.727752];
const GRIPPER_FINGER_TRAVEL = 0.02; // metres of additional opening travel

function STLMesh({ url, position = [0, 0, 0], rotation = [0, 0, 0], scale = MESH_SCALE, material = SILVER }) {
  const geometry = useLoader(STLLoader, url);
  const realistic = useRealism();
  const preparedGeometry = useMemo(() => {
    // STLLoader usually provides normals. Only compute if they're missing.
    if (!geometry.userData.__stlPrepared) {
      if (!geometry.attributes?.normal) {
        geometry.computeVertexNormals();
      }
      geometry.userData.__stlPrepared = true;
    }
    return geometry;
  }, [geometry]);

  return (
    <mesh geometry={preparedGeometry} position={position} rotation={rotation} scale={scale} castShadow receiveShadow>
      {realistic && material.metalness < 0.2
        // Realistic: robot enamel is semi-gloss -- a clear coat that catches
        // the hall's lamps along each link. Bare metal keeps its own finish.
        ? <meshPhysicalMaterial {...material} {...SURFACE_FINISH.robotCoat} side={THREE.DoubleSide} />
        : <meshStandardMaterial color={material.color} metalness={material.metalness} roughness={material.roughness} side={THREE.DoubleSide} />}
    </mesh>
  );
}

function CoordinateFrame({ size = 0.1 }) {
  return (
    <group>
      <mesh position={[size / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[0.003, 0.003, size, 8]} />
        <meshBasicMaterial color="red" />
      </mesh>
      <mesh position={[0, size / 2, 0]}>
        <cylinderGeometry args={[0.003, 0.003, size, 8]} />
        <meshBasicMaterial color="green" />
      </mesh>
      <mesh position={[0, 0, size / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.003, 0.003, size, 8]} />
        <meshBasicMaterial color="blue" />
      </mesh>
    </group>
  );
}

function ScrewdriverTool({ spinRef, screwLoadedRef, productHeldRef, toolRef }) {
  const bit = useRef(null);
  const carriedScrew = useRef(null);
  const productClamp = useRef(null);
  useFrame((_, delta) => {
    if (bit.current && spinRef?.current) bit.current.rotation.x += delta * 24;
    if (carriedScrew.current) carriedScrew.current.visible = Boolean(screwLoadedRef?.current);
    if (productClamp.current) productClamp.current.visible = Boolean(productHeldRef?.current);
  });
  return (
    <group position={[0, 0.1, -0.01]}>
      <mesh name="tool-mount-adapter" position={[.015, -.03, 0]} castShadow><boxGeometry args={[.05, .065, .075]} /><meshStandardMaterial color="#65727d" metalness={.75} roughness={.4} /></mesh>
      <mesh rotation={[0, 0, -Math.PI / 2]} position={[0.065, 0, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.042, 0.085, 24]} />
        <meshStandardMaterial color="#303b46" metalness={0.48} roughness={0.38} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 2]} position={[0.125, 0, 0]} castShadow>
        <cylinderGeometry args={[0.032, 0.034, 0.06, 24]} />
        <meshStandardMaterial color="#1676a5" metalness={0.42} roughness={0.32} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 2]} position={[0.167, 0, 0]} castShadow>
        <cylinderGeometry args={[0.013, 0.024, 0.035, 16]} />
        <meshStandardMaterial color="#a9b6c0" metalness={0.8} roughness={0.23} />
      </mesh>
      <group ref={bit} position={[0.205, 0, 0]}>
        <mesh rotation={[0, 0, -Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.075, 12]} />
          <meshStandardMaterial color="#bac5ce" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.006, 0]}>
          <boxGeometry args={[0.065, 0.002, 0.002]} />
          <meshStandardMaterial color="#38444d" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0.039, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
          <coneGeometry args={[0.007, 0.015, 8]} />
          <meshStandardMaterial color="#d7e1e7" metalness={0.9} roughness={0.18} />
        </mesh>
      </group>
      <mesh ref={carriedScrew} position={[0.25, 0, 0]} rotation={[0, 0, -Math.PI / 2]} visible={false}>
        <cylinderGeometry args={[0.01, 0.006, 0.022, 12]} />
        <meshStandardMaterial color="#b6c0c8" metalness={0.8} roughness={0.25} />
      </mesh>
      <group ref={productClamp} position={[0.25, 0, 0]} visible={false}>
        <mesh position={[0, 0, 0.13]} castShadow>
          <boxGeometry args={[0.06, 0.16, 0.025]} />
          <meshStandardMaterial color="#495762" metalness={0.72} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0, -0.13]} castShadow>
          <boxGeometry args={[0.06, 0.16, 0.025]} />
          <meshStandardMaterial color="#495762" metalness={0.72} roughness={0.28} />
        </mesh>
      </group>
      <group ref={toolRef} position={[0.25, 0, 0]} />
    </group>
  );
}

function InspectionCameraTool({ toolRef }) {
  return (
    <group position={[0, 0.1, -0.01]}>
      <mesh name="tool-mount-adapter" position={[.015, -.03, 0]} castShadow><boxGeometry args={[.05, .065, .075]} /><meshStandardMaterial color="#65727d" metalness={.75} roughness={.4} /></mesh>
      <mesh position={[0.1, 0, 0]} castShadow>
        <boxGeometry args={[0.14, 0.075, 0.09]} />
        <meshStandardMaterial color="#354753" metalness={0.28} roughness={0.44} />
      </mesh>
      <mesh position={[0.177, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.029, 0.029, 0.035, 20]} />
        <meshStandardMaterial color="#aebbc3" metalness={0.62} roughness={0.3} />
      </mesh>
      <mesh position={[0.197, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.022, 24]} />
        <meshStandardMaterial color="#102b3d" metalness={0.35} roughness={0.16} emissive="#116b8c" emissiveIntensity={0.25} />
      </mesh>
      <group ref={toolRef} position={[0.22, 0, 0]} />
    </group>
  );
}

/*
 * Driven from outside (IfarlabTasks.js), the arm takes its pose and grip from
 * refs instead of props, so a task can move it every frame without React:
 *
 *   jointsRef  receives the six joint groups, for the task's IK to work on
 *   toolRef    receives the active tool tip (gripper or screwdriver); both
 *              tools point along local +x
 *   driveRef   when its .current is an array of six angles in degrees, the arm
 *              follows it and the demo sway is skipped
 *   gripRef    when set, its .current (0 closed .. 1 open) drives the fingers
 */
export default function UR10eRobot({
  jointAngles = [0, 0, 0, 0, 0, 0],
  showFrames = false,
  gripperOpen = 0.5,
  animate = false,
  animationSpeed = 1,
  jointsRef,
  toolRef,
  driveRef,
  gripRef,
  reportTelemetry = true,
  // The id the panel reads this arm under (the cell copies number theirs).
  telemetryId = 'ur10e',
  toolMode = 'gripper',
  screwdriverSpinRef,
  screwLoadedRef,
  productHeldRef,
  // A cell's ROBOT_LIVERY ({ shell, accent }); the original cell's by default.
  livery,
}) {
  const shell = livery?.shell ?? SILVER;
  const accent = livery?.accent ?? BLUE_ACCENT;
  const jointRefs = useRef([]);
  const upperFinger = useRef(null);
  const lowerFinger = useRef(null);
  if (jointsRef) jointsRef.current = jointRefs.current;
  const timeRef = useRef(0);
  // Reused every frame; publishTelemetry keeps the reference, so a fresh
  // array here would allocate sixty times a second for one readout.
  const liveRef = useRef([0, 0, 0, 0, 0, 0]);
  const toRad = (deg) => (deg * Math.PI) / 180;

  useFrame((state, delta) => {
    const grip = gripRef ? gripRef.current : gripperOpen;
    if (upperFinger.current) upperFinger.current.position.z = grip * GRIPPER_FINGER_TRAVEL;
    if (lowerFinger.current) lowerFinger.current.position.z = -grip * GRIPPER_FINGER_TRAVEL;

    const driven = driveRef && Array.isArray(driveRef.current) ? driveRef.current : null;
    if (driven) {
      if (jointRefs.current[0]) jointRefs.current[0].rotation.z = toRad(driven[0]);
      if (jointRefs.current[1]) jointRefs.current[1].rotation.y = toRad(driven[1]);
      if (jointRefs.current[2]) jointRefs.current[2].rotation.y = toRad(driven[2]);
      if (jointRefs.current[3]) jointRefs.current[3].rotation.y = toRad(driven[3]);
      if (jointRefs.current[4]) jointRefs.current[4].rotation.z = -toRad(driven[4]);
      if (jointRefs.current[5]) jointRefs.current[5].rotation.y = toRad(driven[5]);
      for (let i = 0; i < 6; i += 1) liveRef.current[i] = driven[i];
    } else if (animate) {
      // Demo mode ignores the live/manual jointAngles entirely and instead
      // drives a single, coherent sway/scan cycle from one shared phase --
      // a fixed, repeatable pose sequence instead of independent per-joint
      // noise added on top of whatever (possibly extreme) angles happen to
      // be live. The arm stays close to its rest pose (elbow near 0, wrist 1
      // near -90) rather than reaching forward/down: the UR10e's own mount
      // sits right next to the conveyor/linear-axis rack furniture, and any
      // real forward reach there put the tool straight through it.
      timeRef.current += delta * animationSpeed;
      const t = timeRef.current;
      const scan = Math.sin(t * 0.3); // -1..1, slow left/right sweep

      const demo = [
        scan * 25, // base: look around
        -90 + Math.sin(t * 0.4) * 6, // shoulder: small sway around rest
        Math.sin(t * 0.5 + 1) * 8, // elbow: small flex, stays near rest (0)
        -90 + Math.sin(t * 0.45 + 2) * 10, // wrist 1: small tilt around rest
        Math.sin(t * 0.5 + 3) * 15, // wrist 2: gentle rotation
        Math.sin(t * 0.6) * 20, // wrist 3: gentle spin, doesn't change reach
      ];

      // Joint axes from URDF: J1=Z, J2=Y, J3=Y, J4=Y, J5=-Z, J6=Y
      if (jointRefs.current[0]) jointRefs.current[0].rotation.z = toRad(demo[0]);
      if (jointRefs.current[1]) jointRefs.current[1].rotation.y = toRad(demo[1]);
      if (jointRefs.current[2]) jointRefs.current[2].rotation.y = toRad(demo[2]);
      if (jointRefs.current[3]) jointRefs.current[3].rotation.y = toRad(demo[3]);
      if (jointRefs.current[4]) jointRefs.current[4].rotation.z = -toRad(demo[4]);
      if (jointRefs.current[5]) jointRefs.current[5].rotation.y = toRad(demo[5]);
      for (let i = 0; i < 6; i += 1) liveRef.current[i] = demo[i];
    } else {
      if (jointRefs.current[0]) jointRefs.current[0].rotation.z = toRad(jointAngles[0]);
      if (jointRefs.current[1]) jointRefs.current[1].rotation.y = toRad(jointAngles[1]);
      if (jointRefs.current[2]) jointRefs.current[2].rotation.y = toRad(jointAngles[2]);
      if (jointRefs.current[3]) jointRefs.current[3].rotation.y = toRad(jointAngles[3]);
      if (jointRefs.current[4]) jointRefs.current[4].rotation.z = -toRad(jointAngles[4]);
      if (jointRefs.current[5]) jointRefs.current[5].rotation.y = toRad(jointAngles[5]);
      for (let i = 0; i < 6; i += 1) liveRef.current[i] = jointAngles[i];
    }
    if (reportTelemetry) publishTelemetry(telemetryId, liveRef.current);
  });

  /*
   * Kinematic chain from ur_macro.xacro.
   * This component only renders the UR10e arm (base through tool0).
   * Environment meshes (table, chassis, conveyor, etc.) are in EnvironmentElements.js.
   *
   * The MESH_BASE prop selects between /meshes/ur10e and /meshes/ur10e_second.
   */

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* Rotate entire robot from ROS Z-up to Three.js Y-up */}
      <Suspense fallback={null}>
        {/* ===== BASE_LINK ===== */}
        <group>
          {showFrames && <CoordinateFrame size={0.15} />}

          {/* base_link_inertia (fixed joint offset) */}
          <group position={[0.052439, 0.0768, 0.05815]}>
            <STLMesh
              url={`${MESH_BASE}/base.stl`}
              position={[0.105561, -0.1918, -0.6445]}
              material={shell}
            />

            {/* ===== JOINT 1: shoulder_pan_joint (axis Z) ===== */}
            <group position={[-4e-06, 0.0, 0.09955]}>
              <group ref={(el) => (jointRefs.current[0] = el)}>
                <STLMesh
                  url={`${MESH_BASE}/shoulder.stl`}
                  position={[0.105565, -0.1918, -0.74405]}
                  material={accent}
                />
                {showFrames && <CoordinateFrame size={0.12} />}

                {/* ===== JOINT 2: shoulder_lift_joint (axis Y) ===== */}
                <group position={[0.0, 0.086, 0.09]}>
                  <group ref={(el) => (jointRefs.current[1] = el)}>
                    <STLMesh
                      url={`${MESH_BASE}/upperarm.stl`}
                      position={[0.105565, -0.2778, -0.83405]}
                      material={shell}
                    />
                    {showFrames && <CoordinateFrame size={0.1} />}

                    {/* ===== JOINT 3: elbow_joint (axis Y) ===== */}
                    <group position={[0.612099, 0.021891, -0.000601]}>
                      <group ref={(el) => (jointRefs.current[2] = el)}>
                        <STLMesh
                          url={`${MESH_BASE}/forearm.stl`}
                          position={[-0.506534, -0.299691, -0.833449]}
                          material={accent}
                        />
                        {showFrames && <CoordinateFrame size={0.08} />}

                        {/* ===== JOINT 4: wrist_1_joint (axis Y) ===== */}
                        <group position={[0.571598, 0.002, 0.0]}>
                          <group ref={(el) => (jointRefs.current[3] = el)}>
                            <STLMesh
                              url={`${MESH_BASE}/wrist1.stl`}
                              position={[-1.078132, -0.301691, -0.833449]}
                              material={shell}
                            />
                            {showFrames && <CoordinateFrame size={0.07} />}

                            {/* ===== JOINT 5: wrist_2_joint (axis -Z) ===== */}
                            <group position={[0.0, 0.054, -0.061699]}>
                              <group ref={(el) => (jointRefs.current[4] = el)}>
                                <STLMesh
                                  url={`${MESH_BASE}/wrist2.stl`}
                                  position={[-1.078132, -0.355691, -0.77175]}
                                  material={accent}
                                />
                                {showFrames && <CoordinateFrame size={0.06} />}

                                {/* ===== JOINT 6: wrist_3_joint (axis Y) ===== */}
                                <group position={[0.0, 0.061698, -0.054]}>
                                  <group ref={(el) => (jointRefs.current[5] = el)}>
                                    <STLMesh
                                      url={`${MESH_BASE}/wrist3.stl`}
                                      position={[-1.078132, -0.417389, -0.71775]}
                                      material={shell}
                                    />
                                    {showFrames && <CoordinateFrame size={0.05} />}

                                    {/* ===== TOOL0 (fixed from wrist_3) ===== */}
                                    <group position={[0.0, 0.0605, 2e-06]}>
                                      <STLMesh
                                        url={`${MESH_BASE}/tool0.stl`}
                                        position={[-1.078132, -0.477889, -0.717752]}
                                        material={DARK_METAL}
                                      />

                                      {/* Flange (fixed from tool0) */}
                                      <group name={`guide-${telemetryId}-flange`} position={[0.028, 0.0249, 0.01]}>
                                        <STLMesh
                                          url={`${MESH_BASE}/flange.stl`}
                                          position={[-1.106132, -0.502789, -0.727752]}
                                          material={DARK_METAL}
                                        />

                                        {/* SICK Camera (fixed from flange) */}
                                        {toolMode !== 'inspection' && <group name={`guide-${telemetryId}-camera`} position={[-0.081802, 0.043811, 0.003]}>
                                          <STLMesh
                                            url={`${MESH_BASE}/sick_camera_mo.stl`}
                                            position={[-1.02433, -0.5466, -0.730752]}
                                            material={accent}
                                          />
                                        </group>}

                                        {toolMode === 'inspection' ? (
                                          <group name={`guide-${telemetryId}-camera`}><InspectionCameraTool toolRef={toolRef} /></group>
                                        ) : toolMode === 'screwdriver' ? (
                                          <group name={`guide-${telemetryId}-screwdriver`}><ScrewdriverTool spinRef={screwdriverSpinRef} screwLoadedRef={screwLoadedRef} productHeldRef={productHeldRef} toolRef={toolRef} /></group>
                                        ) : (<group name={`guide-${telemetryId}-gripper`}>
                                        {/* Gripper (fixed body + opening fingers, mounted on flange) */}
                                        <STLMesh
                                          url={`${MESH_BASE}/gripper_body_1.stl`}
                                          position={FLANGE_OFFSET}
                                          material={GRIPPER_MAT}
                                        />
                                        {/* Fingers ride on groups the frame loop slides open and shut. */}
                                        <group ref={lowerFinger}>
                                          <STLMesh
                                            url={`${MESH_BASE}/gripper_lower_1.stl`}
                                            position={FLANGE_OFFSET}
                                            material={GRIPPER_MAT}
                                          />
                                        </group>
                                        <group ref={upperFinger}>
                                          <STLMesh
                                            url={`${MESH_BASE}/gripper_upper_1.stl`}
                                            position={FLANGE_OFFSET}
                                            material={GRIPPER_MAT}
                                          />
                                        </group>
                                        {/* Fingertip centre, measured off the finger meshes
                                            (x 0.095..0.162, y 0.068..0.131 in this frame). */}
                                        <group ref={toolRef} position={[0.16, 0.1, -0.01]} />
                                        </group>)}
                                      </group>

                                      {/* Cable channel flange (fixed from tool0) */}
                                      <group position={[0.0, 0.0599, -0.01]}>
                                        <STLMesh
                                          url={`${MESH_BASE}/cable_channel_flange.stl`}
                                          position={[-1.078132, -0.537789, -0.707752]}
                                          material={DARK_METAL}
                                        />
                                        {/* Cable channel (fixed from cable_channel_flange) */}
                                        <group position={[0.0, -0.051, -0.038]}>
                                          <STLMesh
                                            url={`${MESH_BASE}/cable_channel.stl`}
                                            position={[-1.078132, -0.486789, -0.669752]}
                                            material={DARK_METAL}
                                          />
                                        </group>
                                      </group>

                                      {showFrames && <CoordinateFrame size={0.05} />}
                                    </group>
                                  </group>
                                </group>
                              </group>
                            </group>
                          </group>
                        </group>
                      </group>
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>

          {/* ===== ENVIRONMENT MESHES now in EnvironmentElements.js ===== */}
        </group>
      </Suspense>
    </group>
  );
}

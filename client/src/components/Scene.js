import React, { Suspense, lazy, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { ROOM, LIGHTING } from './scenePalette';
import { HallEnvironment } from './Realism';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';

const TILE_METERS = 10; // matches the bold section line spacing
const CELL_METERS = 1;
const PIXELS_PER_METER = 64;
const FactoryFixtureBanks = lazy(() => import('./FactoryFixtureBanks'));

function useGridTexture() {
  return useMemo(() => {
    const size = TILE_METERS * PIXELS_PER_METER;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#eeeeef';
    ctx.fillRect(0, 0, size, size);

    const cellPx = CELL_METERS * PIXELS_PER_METER;
    ctx.strokeStyle = '#8c8c92';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i < TILE_METERS; i++) {
      const p = i * cellPx;
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
    }
    ctx.stroke();

    ctx.strokeStyle = '#2e2e33';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  }, []);
}

/*
 * Image-based lighting for the warehouse glTF.
 *
 * That model is authored the way Blender/Sketchfab present it: PBR maps plus
 * an environment to reflect. Lit only by our punctual lights it renders far
 * darker and flatter than its source renders -- MeshStandardMaterial takes
 * its entire specular/reflected term from scene.environment, so with none set
 * that term is simply zero, which is why the wall panels lose their sheen and
 * the glazing reads as flat black instead of picking up daylight.
 *
 * RoomEnvironment is three's own procedurally-built studio interior, so this
 * costs no HDRI download and keeps the viewer working offline (drei's
 * <Environment preset> would pull one from a CDN, which this deployment
 * can't rely on). It is generated once and torn down with the component.
 */
function InteriorEnvironment({ intensity = 1 }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04).texture;

    scene.environment = envMap;
    scene.environmentIntensity = intensity;

    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      envMap.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);

  return null;
}

/*
 * Lighting/ground rig shared by the workcell viewport.
 * Sun direction approximates the "sun" light from the original Gazebo
 * world file (ifarlab.sdf) so the look stays close to the sim -- that
 * single strong directional "sun" is right for the bare grid-floor look,
 * but it's an outdoor rig, and it overpowered the warehouse glTF's own
 * baked albedo textures once the factory building was added: everything
 * read as flatly sun-lit instead of the model's own PBR materials, and the
 * original 18-40 fog range (tuned to fade out the 80m open grid) started
 * hazing the building well inside its own walls (whose corners sit ~30m
 * out). `interior` swaps in a softer, more even fill for that indoor case
 * and pushes fog out past the building instead of through it.
 * The floor grid is baked into a single tiled texture (rather than a
 * separate drei <Grid> plane) so there's only one surface at ground level --
 * two coincident planes there caused constant z-fighting flicker.
 */
export default function Scene({
  children,
  showGrid = true,
  interior = false,
  // The Otokar cell is viewed from ~30 m back, where both of the fog ranges
  // tuned for the IFARLAB cell would haze the machine out. Defaults are null
  // so that page's look is untouched.
  fogNear = null,
  fogFar = null,
  floorSize: floorSizeProp = null,
  // A headset renders every pixel twice at 72-90 Hz on a mobile GPU; the PCSS
  // below costs dozens of shadow-map reads per pixel. DigitalTwin turns these
  // off for the headset profile (see xrSession.js).
  softShadows = true,
  castShadows = true,
  // Desktop adds the local work-bay fixtures to the shared lighting rig.
  realism = false,
}) {
  const gridTexture = useGridTexture();
  const floorSize = floorSizeProp || 80;
  const fixtureBanks = interior && realism;
  gridTexture.repeat.set(floorSize / TILE_METERS, floorSize / TILE_METERS);

  return (
    <>
      {/* Interior air, not sky. #dfe8ef is a pale daylight blue -- right for an
          exterior, wrong inside a shed, where it put a cold wash behind every
          wall opening and lifted the far end of the hall into blue haze. */}
      <color attach="background" args={[ROOM.background]} />
      {fogNear !== null && fogFar !== null ? (
        <fog attach="fog" args={[ROOM.fog, fogNear, fogFar]} />
      ) : interior ? (
        <fog attach="fog" args={[ROOM.fog, 42, 85]} />
      ) : (
        <fog attach="fog" args={[ROOM.fog, 18, 40]} />
      )}

      {interior && softShadows && <SoftShadows size={8} samples={12} focus={0.25} />}
      {interior && (
        <Suspense fallback={<InteriorEnvironment intensity={LIGHTING.environment} />}>
          <HallEnvironment />
        </Suspense>
      )}

      <ambientLight color={ROOM.ambient} intensity={interior ? LIGHTING.ambient : 0.55} />
      {/* The shared overhead key casts the main shadow pass. */}
      <directionalLight
        color={ROOM.lamp}
        position={interior ? [0, 20, 4] : [8, 14, 6]}
        intensity={fixtureBanks ? LIGHTING.desktopKey : (interior ? LIGHTING.key : 1.2)}
        castShadow={castShadows}
        /* Extend along the 49 m hall to keep the end bays in the shadow map. */
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-normalBias={0.03}
        shadow-bias={-0.0004}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={interior ? 27 : 20}
        shadow-camera-bottom={interior ? -27 : -20}
      />
      {/* Sky bounce above, floor bounce below. The lower colour is the floor's
          own tone, so light coming back up off the concrete carries it. */}
      <hemisphereLight args={[ROOM.skyBounce, ROOM.groundBounce, interior ? LIGHTING.hemisphere : 0.4]} />
      {interior && <directionalLight color={ROOM.daylight} position={[16, 6, -6]} intensity={LIGHTING.daylight} />}
      {fixtureBanks && (
        <Suspense fallback={null}>
          <FactoryFixtureBanks />
        </Suspense>
      )}

      {showGrid && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[floorSize, floorSize]} />
          <meshStandardMaterial map={gridTexture} roughness={1} metalness={0} />
        </mesh>
      )}

      {children}
    </>
  );
}

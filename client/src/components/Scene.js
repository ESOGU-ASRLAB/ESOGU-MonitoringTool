import React, { useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';

const TILE_METERS = 10; // matches the bold section line spacing
const CELL_METERS = 1;
const PIXELS_PER_METER = 64;

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
export default function Scene({ children, showGrid = true, interior = false }) {
  const gridTexture = useGridTexture();
  const floorSize = 80;
  gridTexture.repeat.set(floorSize / TILE_METERS, floorSize / TILE_METERS);

  return (
    <>
      <color attach="background" args={['#e8e8ed']} />
      {interior ? (
        <fog attach="fog" args={['#e8e8ed', 42, 85]} />
      ) : (
        <fog attach="fog" args={['#e8e8ed', 18, 40]} />
      )}

      {/* Indoors the environment map supplies the fill, so the flat ambient
          term drops right back -- left at its old level on top of IBL it just
          washes the glTF's own textures out again. */}
      {interior && <InteriorEnvironment intensity={0.7} />}

      <ambientLight intensity={interior ? 0.08 : 0.55} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={interior ? 0.3 : 1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-normalBias={0.05}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <hemisphereLight args={['#ffffff', '#8a8a92', interior ? 0.1 : 0.4]} />

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

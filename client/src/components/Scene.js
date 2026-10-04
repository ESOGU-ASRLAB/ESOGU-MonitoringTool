import React, { Suspense, useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { SoftShadows } from '@react-three/drei';
import * as THREE from 'three';
import { ROOM, LIGHTING, REALISM } from './scenePalette';
import { HallEnvironment } from './Realism';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';

const TILE_METERS = 10; // matches the bold section line spacing
const CELL_METERS = 1;
const PIXELS_PER_METER = 64;
// The emissive ceiling tubes in the warehouse mesh cannot light nearby PBR
// surfaces by themselves. These broad, shadowless fills give the four workcells
// and the bus bays the soft light a real row of factory fixtures produces.
const FACTORY_FIXTURES = [
  [6.2, 7.3, 9.5], [6.2, 7.3, 2.5],
  [12.8, 7.3, 9.5], [12.8, 7.3, 2.5],
  [-5.5, 7.3, -13], [5.5, 7.3, -13],
];

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
  // The realistic look (Realism.js): lit by a photographed hall instead.
  realism = false,
}) {
  const gridTexture = useGridTexture();
  const floorSize = floorSizeProp || 80;
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

      {/*
        THE FILL WAS DOING ALMOST ALL THE WORK, and that is what made the hall
        look like a CAD viewport rather than a photograph of a factory.

        Four sources were stacked: an environment map at 0.95, ambient at 0.22,
        hemisphere at 0.42 and only 0.85 of actual directional key. Roughly two
        thirds of the light arriving at any surface came from every direction at
        once, so nothing was shaded -- a cylinder and a flat plate returned the
        same value, the vehicle's structure flattened into a white cut-out, and
        the light surfaces climbed towards clipping with no highlight left to
        place them by.

        The ratio is inverted here, and then settled back a step. The first
        attempt cut the fill to 0.32/0.10/0.22 against a key of 1.55, which did
        restore form but overshot: everything not facing the key fell away, the
        roof structure went to near-black and the hall lost the even working
        light a lit shed actually has. These are the numbers in between -- the
        key is still the dominant single source, so surfaces are shaded by
        direction, but there is enough bounce left to see into the volume.
      */}
      {/*
        CONTACT-HARDENING SHADOWS (PCSS).

        A single shadow map gives every shadow the same hard edge whatever its
        distance from what casts it, and that uniform edge is one of the clearest
        tells of a real-time viewport rather than a render. Real shadows are
        sharp where an object meets the floor and spread the further away the
        surface gets -- a gantry leg is crisp at its foot and soft two metres up
        the column.

        drei's SoftShadows patches the shadow sampling to do that, with no extra
        dependency and no second shadow pass. `size` is the light's apparent
        width in world units: a 25 m roof-lit hall, not a point source. Samples
        are kept modest because this runs every frame.
      */}
      {interior && softShadows && <SoftShadows size={25} samples={12} focus={0.4} />}

      {interior && !realism && <InteriorEnvironment intensity={LIGHTING.environment} />}
      {/* Until the photographed hall has loaded, the studio stands in. */}
      {interior && realism && (
        <Suspense fallback={<InteriorEnvironment intensity={LIGHTING.environment} />}>
          <HallEnvironment />
        </Suspense>
      )}

      <ambientLight color={ROOM.ambient} intensity={interior ? (realism ? REALISM.ambient : LIGHTING.ambient) : 0.55} />
      {/* Under the realistic look the key comes from overhead, as a roof full
          of lamps does, so shadows fall under things instead of all leaning
          one way like a low sun's. */}
      <directionalLight
        color={ROOM.lamp}
        position={realism ? [3, 20, 4] : [8, 14, 6]}
        intensity={interior ? (realism ? REALISM.key : LIGHTING.key) : 1.2}
        castShadow={castShadows}
        /*
         * THE SHADOW CAMERA USED TO MISS MOST OF THE BUILDING. It was an
         * orthographic box +/-10 m around the origin with far at 30, while the
         * hall runs to x +/-16 and z +/-24. Everything outside that box -- all
         * three parked buses at z 15 to -17, the workers around them, the
         * whole east end -- cast and received nothing, which is why those
         * objects read as pasted onto the floor rather than standing on it.
         *
         * +/-20 covers the occupied floor, and 2048 over that span gives about
         * 2 cm per texel, against 4 cm over the old smaller box: a contact
         * shadow with an edge rather than a grey smudge.
         */
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-normalBias={0.03}
        shadow-bias={-0.0004}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      {/* Sky bounce above, floor bounce below. The lower colour is the floor's
          own tone, so light coming back up off the concrete carries it. */}
      <hemisphereLight args={[ROOM.skyBounce, ROOM.groundBounce, interior ? (realism ? REALISM.hemisphere : LIGHTING.hemisphere) : 0.4]} />
      {interior && realism && <directionalLight color={ROOM.lamp} position={[2, 11, 30]} intensity={REALISM.fill} />}
      {interior && realism && FACTORY_FIXTURES.map((position, index) => (
        <pointLight key={index} position={position} color="#f5f7f4" intensity={24} distance={11} decay={2} />
      ))}

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

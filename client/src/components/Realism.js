import React, { useEffect, useMemo } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { FloorReflectorMaterial } from './FloorReflectorMaterial';
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, KernelSize, ToneMappingMode } from 'postprocessing';
import { REALISM } from './scenePalette';

/*
 * THE REALISTIC LOOK: what turns the hall from a CAD viewport into something
 * that reads as photographed. Switched from the view controls ("Realistic"),
 * desktop only -- a headset keeps the classic look, which is tuned for its
 * frame rate. Every asset is CC0 (public/assets/realism/README.md).
 *
 *   HallEnvironment  reflections and fill from a photographed industrial
 *                    interior, instead of a generic studio
 *   HallFloor        a glossy blue epoxy coat with true reflections of the
 *                    hall, instead of one flat colour
 *   RealismExposure  the exposure that goes with AgX
 *   PostEffects      what a camera adds: contact shadows (N8AO), glow off the
 *                    lamps, AgX tone mapping, a light vignette and grain
 */
const BASE = process.env.PUBLIC_URL + '/assets/realism';

/*
 * Image-based light for the realistic look.
 *
 * A photographed industrial interior (CC0) supplies stable diffuse fill and
 * reflections. Keeping the PMREM fixed avoids the GPU readback and mid-frame
 * cubemap replacement that produced coloured blocks on some WebGL drivers.
 */
export function HallEnvironment({ intensity = REALISM.environment }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const hdr = useLoader(RGBELoader, `${BASE}/machine_shop_02_1k.hdr`);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = envMap;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      envMap.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, hdr, intensity]);

  return null;
}

/*
 * THE HALL'S FLOOR: a blue epoxy coat over the concrete slab, the finish most
 * modern assembly halls have -- even in colour, satin, and holding soft
 * reflections of the lamps and machines above it, clearest where a thing
 * stands on it and gone a little way off, as a worn coated floor does.
 *
 * The reflection is a true mirrored render of the hall (drei's reflector
 * material, refreshed every other frame -- FloorReflectorMaterial.js: the
 * scene drawn once more from below the floor, blurred by distance), so the
 * robots, fences and the rows of lamps all appear in it in the right place.
 * Its shader samples the roughness map on
 * the plain `vUv`, which three only declares when USE_UV is defined, so that
 * define is set here; the wear map covers the whole floor once (no repeat),
 * so the reflection's blur and the light's gloss read it the same way.
 *
 * Inside the walls (the warehouse model spans x +/-16.27, z +/-24.58), 4 mm
 * over the model's own flat floor. The coat's faint mottling repeats every
 * 6 m; a softer variation over the whole floor (second UV set) keeps that
 * repeat from showing across 50 m.
 */
const FLOOR = { halfX: 16.27, halfZ: 24.58, tile: 6 };

// Deterministic smooth value noise in 0..1.
function valueNoise(seed) {
  const hash = (x, y) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// Several octaves of noise painted into a grey canvas, `shade(value)` -> 0..1.
// `period` makes the noise wrap at the canvas edge, so the tile repeats cleanly.
function noiseTexture(size, cells, octaves, shade, seed, period = true) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const noise = valueNoise(seed);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let value = 0;
      let amplitude = 0.5;
      let frequency = cells;
      for (let octave = 0; octave < octaves; octave += 1) {
        const fx = (x / size) * frequency;
        const fy = (y / size) * frequency;
        // Blend the wrapped copies so the tile has no seam.
        let n = noise(fx, fy);
        if (period) {
          const wx = x / size;
          const wy = y / size;
          const a = noise(fx, fy);
          const b = noise(fx - frequency, fy);
          const c = noise(fx, fy - frequency);
          const d = noise(fx - frequency, fy - frequency);
          n = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
        }
        value += amplitude * n;
        amplitude *= 0.5;
        frequency *= 2;
      }
      const g = Math.round(255 * Math.min(1, Math.max(0, shade(value))));
      const i = (y * size + x) * 4;
      image.data[i] = g;
      image.data[i + 1] = g;
      image.data[i + 2] = g;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// The coat itself: an even colour with faint roller mottling and the odd
// darker scuff, multiplied over the epoxy's colour.
function coatTexture() {
  const size = 256;
  const canvas = noiseTexture(size, 6, 4, (v) => 0.9 + 0.1 * v, 3);
  const ctx = canvas.getContext('2d');
  const noise = valueNoise(11);
  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i += 1) {
    const x = noise(i * 3.1, 1.7) * size;
    const y = noise(2.3, i * 2.9) * size;
    const angle = noise(i * 1.3, i * 0.7) * Math.PI * 2;
    const length = 5 + noise(i, 9.1) * 30;
    ctx.strokeStyle = `rgba(40, 50, 60, ${0.03 + 0.05 * noise(i * 0.5, 4.4)})`;
    ctx.lineWidth = 0.6 + noise(i * 2.2, 7.7) * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(angle) * length * 0.5 + 3, y + Math.sin(angle) * length * 0.5 - 3,
      x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set((FLOOR.halfX * 2) / FLOOR.tile, (FLOOR.halfZ * 2) / FLOOR.tile);
  texture.anisotropy = 8;
  return texture;
}

// Where the coat is worn duller (the green channel scales the roughness): a
// broad, uneven sheen over the whole floor, once.
function wearTexture() {
  const texture = new THREE.CanvasTexture(noiseTexture(256, 5, 4, (v) => 0.45 + 0.75 * v * v, 7, false));
  texture.anisotropy = 4;
  return texture;
}

// The large, soft light-and-dark variation, on the second UV set.
function variationTexture() {
  const texture = new THREE.CanvasTexture(noiseTexture(128, 3, 4, (v) => 0.78 + 0.22 * v, 1, false));
  texture.channel = 1;
  return texture;
}

export function HallFloor() {
  const coat = useMemo(coatTexture, []);
  const wear = useMemo(wearTexture, []);
  const variation = useMemo(variationTexture, []);
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(FLOOR.halfX * 2, FLOOR.halfZ * 2);
    plane.setAttribute('uv1', plane.getAttribute('uv').clone());
    return plane;
  }, []);

  useEffect(() => () => {
    geometry.dispose();
    coat.dispose();
    wear.dispose();
    variation.dispose();
  }, [geometry, coat, wear, variation]);

  const { floor } = REALISM;
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
      <FloorReflectorMaterial
        color={floor.color}
        map={coat}
        roughnessMap={wear}
        roughness={floor.roughness}
        metalness={0}
        aoMap={variation}
        aoMapIntensity={0.55}
        envMapIntensity={floor.environment}
        resolution={512}
        every={2}
        blur={[600, 300]}
        mixBlur={2.4}
        mixStrength={floor.reflection}
        mirror={floor.mirror}
        mixContrast={1}
        depthScale={1.6}
        minDepthThreshold={0.15}
        maxDepthThreshold={0.9}
        depthToBlurRatioBias={0.2}
        defines-USE_UV=""
      />
    </mesh>
  );
}

export function RealismExposure() {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const previous = gl.toneMappingExposure;
    gl.toneMappingExposure = REALISM.exposure;
    return () => {
      gl.toneMappingExposure = previous;
    };
  }, [gl]);
  return null;
}

/*
 * The composer turns the renderer's own tone mapping off while it runs, so
 * the chain ends in its own: AgX, which rolls highlights off like film and
 * keeps the saturated paint from going synthetic. The glow is held to the
 * lamps themselves (their emissive runs far above 1); a low threshold lit
 * every sunlit panel and fogged the whole frame.
 *
 * Two things that turn the whole frame black on the Intel Arc / D3D11 path
 * Chrome takes here, both measured: MSAA on the composer's half-float buffer,
 * and the glow's mipmap blur whenever the canvas has an odd pixel height
 * (1740x909 went black, 1735x1002 did not). So no MSAA -- SMAA does the
 * edges, last, on the finished image -- and the glow uses the Kawase blur,
 * which held at every size tried, odd and even. Mipmap blur is the library's
 * default, so `mipmapBlur={false}` has to stay spelled out.
 */
/*
 * Hair and other soft cut-outs (Worker.js settleMaterials) draw with
 * alpha-to-coverage, which needs a multisampled target to blend their edges.
 * The composer's buffer has none, so there they break up into a white dot
 * pattern. While the composer runs they fall back to a plain alpha cut-out,
 * which SMAA then smooths; anything that loads later is caught on the next
 * sweep, and all of it goes back when the realistic look is switched off.
 */
function useCutoutsWithoutCoverage() {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const changed = new Set();
    const sweep = () => scene.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of [].concat(object.material)) {
        if (!material?.alphaToCoverage || changed.has(material)) continue;
        material.alphaToCoverage = false;
        material.needsUpdate = true;
        changed.add(material);
      }
    });
    sweep();
    const timer = setInterval(sweep, 2000);
    return () => {
      clearInterval(timer);
      changed.forEach((material) => {
        material.alphaToCoverage = true;
        material.needsUpdate = true;
      });
    };
  }, [scene]);
}

export function PostEffects() {
  useCutoutsWithoutCoverage();
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={1.4} distanceFalloff={0.7} intensity={1.7} quality="medium" halfRes />
      <Bloom luminanceThreshold={6.0} luminanceSmoothing={0.3} intensity={0.2} mipmapBlur={false} kernelSize={KernelSize.MEDIUM} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      {/* AgX is deliberately flat; a camera's processing puts back a little
          contrast and colour. */}
      <BrightnessContrast contrast={0.07} />
      <HueSaturation saturation={0.08} />
      <Vignette offset={0.3} darkness={0.18} />
      <Noise opacity={0.03} premultiply blendFunction={BlendFunction.SOFT_LIGHT} />
      <SMAA />
    </EffectComposer>
  );
}

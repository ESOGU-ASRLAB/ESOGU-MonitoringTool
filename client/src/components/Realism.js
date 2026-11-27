import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { BrightnessContrast, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, BloomEffect, Effect, ToneMappingMode } from 'postprocessing';
import { ARCHITECTURE, LIGHTING, RENDER_FINISH } from './scenePalette';
import { applyHallFloorFinish, createConcreteNormalMap, createHallFloorFinish, HALL_FLOOR } from './hallFloorFinish';
import { applyBakedOcclusion, floorLightmapUV, HALL_LIGHTMAP_URL } from './hallLightmap';
import { applyHallProbe, useHallReflectionProbe } from './hallReflectionProbe';
import { useRealism } from './realismContext';

const BASE = process.env.PUBLIC_URL + '/assets/realism';

// The same photographed industrial interior supplies indirect light to desktop and XR.
export function HallEnvironment({ intensity = LIGHTING.environment }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const hdr = useLoader(RGBELoader, `${BASE}/machine_shop_02_1k.hdr`);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = pmrem.fromEquirectangular(hdr);
    const previousRotation = scene.environmentRotation.clone();
    scene.environment = environment.texture;
    scene.environmentIntensity = intensity;
    scene.environmentRotation.y = LIGHTING.environmentYaw;
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      scene.environmentRotation.copy(previousRotation);
      environment.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, hdr, intensity]);

  return null;
}

const FLOOR_MAPS = [`${BASE}/hall-concrete-albedo.webp`, `${BASE}/hall-concrete-surface.webp`, HALL_LIGHTMAP_URL];
export function HallFloor() {
  const [albedo, surface, lightmap] = useLoader(THREE.TextureLoader, FLOOR_MAPS);
  const anisotropy = useThree(({ gl }) => gl.capabilities.getMaxAnisotropy());
  const finish = useMemo(createHallFloorFinish, []);
  const normal = useMemo(() => createConcreteNormalMap(surface), [surface]);
  const material = useRef(null);
  const desktop = useRealism();
  const openness = useHallReflectionProbe(material, desktop);
  const finishShader = useMemo(() => (shader) => {
    applyHallFloorFinish(shader);
    applyBakedOcclusion(shader);
    if (desktop) applyHallProbe(shader, openness, RENDER_FINISH.floor.probeIntensity);
  }, [desktop, openness]);
  const geometry = useMemo(() => {
    const mesh = new THREE.PlaneGeometry(HALL_FLOOR.width, HALL_FLOOR.length);
    floorLightmapUV(mesh);
    return mesh;
  }, []);
  useEffect(() => () => { finish.dispose(); geometry.dispose(); }, [finish, geometry]);
  useEffect(() => () => normal.dispose(), [normal]);

  useLayoutEffect(() => {
    albedo.colorSpace = THREE.SRGBColorSpace;
    lightmap.channel = 1;
    for (const texture of [albedo, surface, normal]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(HALL_FLOOR.baysX, HALL_FLOOR.baysZ);
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    }
  }, [albedo, surface, normal, lightmap, anisotropy]);

  return (
    <mesh name="hall-floor" geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
      <meshStandardMaterial ref={material} name="hall-concrete" {...ARCHITECTURE.floor} map={albedo}
        roughnessMap={surface} normalMap={normal}
        normalScale={[RENDER_FINISH.floor.microNormal, RENDER_FINISH.floor.microNormal]} aoMap={finish}
        lightMap={lightmap} lightMapIntensity={RENDER_FINISH.bakedIndirect} onBeforeCompile={finishShader}
        customProgramCacheKey={() => desktop ? 'concrete-desktop' : 'concrete-headset'} />
    </mesh>
  );
}

// Alpha-to-coverage requires MSAA. The SMAA-only profile uses plain alpha cutouts.
function useCutoutsWithoutCoverage(multisampling) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    if (multisampling > 0) return;
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
  }, [scene, multisampling]);
}

export function PostEffects() {
  const composerRef = useRef(null);
  const gl = useThree((state) => state.gl);
  const pixels = useThree(({ size, viewport }) => size.width * size.height * viewport.dpr ** 2);
  const supportedSamples = useMemo(() => {
    const context = gl.getContext();
    if (!gl.extensions.has('EXT_color_buffer_float')) return [];
    const samplesFor = (format) => context.getInternalformatParameter(context.RENDERBUFFER, format, context.SAMPLES);
    const color = samplesFor(context.RGBA16F);
    const depth = samplesFor(context.DEPTH_COMPONENT24);
    return [4, 2].filter((samples) => color?.includes(samples) && depth?.includes(samples));
  }, [gl]);
  // The two HDR buffers share a fixed multisample budget as the viewport grows.
  const multisampling = supportedSamples.find((samples) => samples * pixels <= 6_000_000) ?? 0;
  useLayoutEffect(() => {
    const composer = composerRef.current;
    composer.multisampling = multisampling;
    return () => { composer.multisampling = 0; };
  }, [multisampling]);

  useCutoutsWithoutCoverage(multisampling);
  const bloom = useMemo(() => {
    const effect = new BloomEffect({
      ...RENDER_FINISH.bloom, mipmapBlur: true, blendFunction: BlendFunction.ADD,
    });
    const threshold = effect.luminanceMaterial;
    // Invalid HDR samples can contaminate a full block during mip downsampling.
    threshold.fragmentShader = threshold.fragmentShader.replace(
      'float l=luminance(texel.rgb);',
      'float l=luminance(texel.rgb); if (!(l >= 0.0 && l <= 65504.0)) { gl_FragColor = vec4(0.0); return; }',
    );
    return effect;
  }, []);
  // The composer bypasses renderer tone mapping. Apply exposure once in its
  // linear HDR buffer before the AgX display transform.
  const exposure = useMemo(() => new Effect('HallExposure', `
    void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
      vec3 color = inputColor.rgb;
      if (!(dot(color, color) >= 0.0 && dot(color, color) < 1e9)) color = vec3(0.0);
      outputColor = vec4(color * ${LIGHTING.exposure.toFixed(3)}, inputColor.a);
    }`, { blendFunction: BlendFunction.NORMAL }), []);
  useEffect(() => () => exposure.dispose(), [exposure]);
  useEffect(() => () => bloom.dispose(), [bloom]);
  return (
    <EffectComposer ref={composerRef} multisampling={0} frameBufferType={THREE.HalfFloatType}>
      <N8AO {...RENDER_FINISH.contactAO} quality="medium" halfRes />
      <primitive object={bloom} />
      <primitive object={exposure} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <BrightnessContrast contrast={RENDER_FINISH.contrast} />
      <Vignette offset={0.22} darkness={RENDER_FINISH.vignette} />
      {!multisampling && <SMAA />}
    </EffectComposer>
  );
}

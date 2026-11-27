import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { doorOpenness } from './busRoute';
import { RENDER_FINISH } from './scenePalette';

const ORIGIN = [0, 1.25, 0];
const CAPTURE_LAYER = 7;

function captureHall(gl, scene, hall, yard) {
  const cube = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const capture = new THREE.CubeCamera(0.15, 125, cube);
  const pmrem = new THREE.PMREMGenerator(gl);
  const masks = new Map();
  const include = (object) => {
    if ((!object.isMesh && !object.isLight) || masks.has(object)) return;
    masks.set(object, object.layers.mask);
    object.layers.enable(CAPTURE_LAYER);
  };
  hall.traverse(include);
  yard.traverse(include);
  scene.traverse((object) => { if (object.isLight && !object.isSpotLight) include(object); });
  capture.layers.set(CAPTURE_LAYER);
  capture.position.fromArray(ORIGIN);
  const shadows = gl.shadowMap.enabled;
  gl.shadowMap.enabled = false;

  try {
    capture.update(gl, scene);
    const result = pmrem.fromCubemap(cube.texture);
    result.texture.name = 'hall-floor-reflection-probe';
    return result;
  } finally {
    masks.forEach((mask, object) => { object.layers.mask = mask; });
    gl.shadowMap.enabled = shadows;
    cube.dispose();
    pmrem.dispose();
  }
}

export function useHallReflectionProbe(material, enabled) {
  const probe = useRef(null);
  const openness = useRef(new THREE.Vector2());
  useEffect(() => () => {
    probe.current?.dispose();
    probe.current = null;
  }, []);
  useEffect(() => {
    const floor = material.current;
    return () => {
      if (!floor?.envMap) return;
      floor.envMap = null;
      floor.needsUpdate = true;
    };
  }, [enabled, material]);

  useFrame(({ gl, scene, clock }) => {
    const floor = material.current;
    if (!enabled || !floor || gl.xr.isPresenting || !gl.extensions.has('EXT_color_buffer_float')) return;
    if (!probe.current) {
      const hall = scene.getObjectByName('factory-shell');
      const yard = scene.getObjectByName('factory-yard');
      if (!scene.environment || !hall || !yard || !scene.getObjectByName('factory-fixture-bank')) return;
      probe.current = captureHall(gl, scene, hall, yard);
    }
    if (floor.envMap !== probe.current.texture) {
      floor.envMap = probe.current.texture;
      floor.envMapIntensity = RENDER_FINISH.floor.probeIntensity;
      floor.needsUpdate = true;
    }
    openness.current.set(doorOpenness(-5.95, clock.elapsedTime), doorOpenness(5.95, clock.elapsedTime));
  });

  return openness.current;
}

export function applyHallProbe(shader, openness, intensity) {
  // A box projection aligns the locally captured roof and door with their
  // reflection from different parts of the slab.
  shader.uniforms.hallDoorOpenness = { value: openness };
  const world = 'varying vec3 vFloorWorld;';
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${world}`)
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFloorWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  const reflection = THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
    'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );',
    `vec4 envMapColor;
      if (abs(envMapIntensity - ${intensity.toFixed(3)}) < 0.001) {
        vec3 wall = mix(vec3(-16.3, 0.0, -24.25), vec3(16.3, 8.45, 24.6), step(0.0, reflectVec));
        vec3 safeDirection = mix(vec3(-1.0), vec3(1.0), step(0.0, reflectVec)) * max(abs(reflectVec), vec3(0.0001));
        vec3 distance = (wall - vFloorWorld) / safeDirection;
        float rayEnd = max(0.0, min(distance.x, min(distance.y, distance.z)));
        vec3 hit = vFloorWorld + rayEnd * reflectVec;
        vec3 lookup = normalize(hit - vec3(${ORIGIN.map((v) => v.toFixed(2)).join(', ')}));
        envMapColor = textureCubeUV(envMap, lookup, roughness);
        float door = (1.0 - smoothstep(0.15, 0.8, abs(hit.z + 24.25))) *
          smoothstep(2.6, 3.3, abs(hit.x)) * (1.0 - smoothstep(8.6, 9.4, abs(hit.x))) *
          (1.0 - smoothstep(3.25, 4.45, hit.y));
        float open = mix(hallDoorOpenness.x, hallDoorOpenness.y, step(0.0, hit.x));
        envMapColor.rgb *= 1.0 - 0.76 * door * (1.0 - open);
        // Preserve broad highlights from the openings after PMREM blurs
        // the smaller LED geometry. Apply only in the specular lobe.
        float grazing = pow(1.0 - clamp(abs(reflectVec.y), 0.0, 1.0), 2.0);
        envMapColor.rgb += vec3(0.64, 0.79, 1.0) * door * open * grazing * 1.8;
      } else {
        envMapColor = textureCubeUV(envMap, envMapRotation * reflectVec, roughness);
      }`,
  );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${world}\nuniform vec2 hallDoorOpenness;`)
    .replace('#include <envmap_physical_pars_fragment>', reflection);
}

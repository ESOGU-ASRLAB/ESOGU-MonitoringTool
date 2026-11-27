import React, { useMemo } from 'react';
import { useRealism } from './realismContext';

const FLOOR_ROTATION = [-Math.PI / 2, 0, 0];

export default function ContactShadow({ position, rotation = FLOOR_ROTATION, size, opacity = 0.49 }) {
  const desktop = useRealism();
  const uniforms = useMemo(() => ({ opacity: { value: opacity } }), [opacity]);
  if (!desktop) return null;
  return (
    <mesh position={position} rotation={rotation} renderOrder={-1} raycast={() => null}>
      <planeGeometry args={size} />
      <shaderMaterial uniforms={uniforms} transparent depthWrite={false}
        vertexShader={`
          varying vec2 footprint;
          void main() {
            footprint = 2.0 * uv - 1.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`}
        fragmentShader={`
          varying vec2 footprint;
          uniform float opacity;
          void main() {
            float edge = length(footprint);
            float alpha = opacity * (1.0 - smoothstep(0.12, 1.0, edge));
            gl_FragColor = vec4(0.021, 0.020, 0.019, alpha);
          }`}
      />
    </mesh>
  );
}

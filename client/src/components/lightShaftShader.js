// An analytic sheet of haze on a tapered shell with faded ends.
export const lightShaftVertex = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vToEye;
  varying vec3 vShaftLocal;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vToEye = -viewPosition.xyz;
    vShaftLocal = position;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const lightShaftFragment = /* glsl */ `
  uniform vec3 lightColor;
  uniform float density;
  varying vec3 vNormalView;
  varying vec3 vToEye;
  varying vec3 vShaftLocal;
  void main() {
    float grazing = clamp(abs(dot(normalize(vNormalView), normalize(vToEye))), 0.0, 1.0);
    float profile = 1.0 - smoothstep(0.25, 0.98, abs(vShaftLocal.y));
    gl_FragColor = vec4(lightColor, density * profile * smoothstep(0.05, 0.75, grazing));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

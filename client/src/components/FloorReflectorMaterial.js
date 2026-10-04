import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { extend, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BlurPass } from '@react-three/drei/materials/BlurPass';
import { MeshReflectorMaterial as ReflectorMaterialImpl } from '@react-three/drei/materials/MeshReflectorMaterial';

extend({ ReflectorMaterialImpl });

/*
 * A planar-reflection material for the hall's floor: drei's
 * MeshReflectorMaterial (MIT, @react-three/drei core/MeshReflectorMaterial.js)
 * with its material and blur pass as they are, and one change to how often it
 * works. The mirrored view of the hall is drawn into a texture only every
 * `every` frames, not every frame: that pass draws the whole hall a second
 * time, and measured it halved the frame rate. The texture and the matrix that
 * projects it onto the floor are updated together, so on a skipped frame the
 * floor shows the previous reflection exactly where it was; a moving robot's
 * reflection is at most a frame behind.
 */
export const FloorReflectorMaterial = forwardRef(({
  every = 2,
  resolution = 768,
  blur = [0, 0],
  mixBlur = 0,
  mixStrength = 1,
  minDepthThreshold = 0.9,
  maxDepthThreshold = 1,
  depthScale = 0,
  depthToBlurRatioBias = 0.25,
  mirror = 0,
  mixContrast = 1,
  ...props
}, ref) => {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const materialRef = useRef(null);
  useImperativeHandle(ref, () => materialRef.current, []);
  const frame = useRef(0);
  const [blurX, blurY] = Array.isArray(blur) ? blur : [blur, blur];
  const hasBlur = blurX + blurY > 0;
  const s = useMemo(() => ({
    plane: new THREE.Plane(), normal: new THREE.Vector3(), reflector: new THREE.Vector3(), eye: new THREE.Vector3(),
    rotation: new THREE.Matrix4(), lookAt: new THREE.Vector3(), clip: new THREE.Vector4(), view: new THREE.Vector3(),
    target: new THREE.Vector3(), q: new THREE.Vector4(), textureMatrix: new THREE.Matrix4(), camera: new THREE.PerspectiveCamera(),
  }), []);

  const [fbo1, fbo2, blurPass, reflectorProps] = useMemo(() => {
    const parameters = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType };
    const first = new THREE.WebGLRenderTarget(resolution, resolution, parameters);
    first.depthBuffer = true;
    first.depthTexture = new THREE.DepthTexture(resolution, resolution);
    first.depthTexture.format = THREE.DepthFormat;
    first.depthTexture.type = THREE.UnsignedShortType;
    const second = new THREE.WebGLRenderTarget(resolution, resolution, parameters);
    const pass = new BlurPass({
      gl, resolution, width: blurX, height: blurY, minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias,
    });
    return [first, second, pass, {
      mirror,
      textureMatrix: s.textureMatrix,
      mixBlur,
      tDiffuse: first.texture,
      tDepth: first.depthTexture,
      tDiffuseBlur: second.texture,
      hasBlur,
      mixStrength,
      minDepthThreshold,
      maxDepthThreshold,
      depthScale,
      depthToBlurRatioBias,
      mixContrast,
      'defines-USE_BLUR': hasBlur ? '' : undefined,
      'defines-USE_DEPTH': depthScale > 0 ? '' : undefined,
    }];
  }, [gl, s, blurX, blurY, resolution, mirror, hasBlur, mixBlur, mixStrength, minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias, mixContrast]);

  useEffect(() => () => {
    fbo1.depthTexture?.dispose();
    fbo1.dispose();
    fbo2.dispose();
  }, [fbo1, fbo2]);

  // The mirrored camera and the oblique clip plane, as drei computes them.
  const placeMirror = (parent) => {
    s.reflector.setFromMatrixPosition(parent.matrixWorld);
    s.eye.setFromMatrixPosition(camera.matrixWorld);
    s.rotation.extractRotation(parent.matrixWorld);
    s.normal.set(0, 0, 1).applyMatrix4(s.rotation);
    s.view.subVectors(s.reflector, s.eye);
    if (s.view.dot(s.normal) > 0) return false; // looking at it from below
    s.view.reflect(s.normal).negate().add(s.reflector);
    s.rotation.extractRotation(camera.matrixWorld);
    s.lookAt.set(0, 0, -1).applyMatrix4(s.rotation).add(s.eye);
    s.target.subVectors(s.reflector, s.lookAt).reflect(s.normal).negate().add(s.reflector);
    const mirrored = s.camera;
    mirrored.position.copy(s.view);
    mirrored.up.set(0, 1, 0).applyMatrix4(s.rotation).reflect(s.normal);
    mirrored.lookAt(s.target);
    mirrored.far = camera.far;
    mirrored.updateMatrixWorld();
    mirrored.projectionMatrix.copy(camera.projectionMatrix);
    s.textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
    s.textureMatrix.multiply(mirrored.projectionMatrix).multiply(mirrored.matrixWorldInverse).multiply(parent.matrixWorld);
    // Oblique near plane on the floor: http://www.terathon.com/code/oblique.html
    s.plane.setFromNormalAndCoplanarPoint(s.normal, s.reflector).applyMatrix4(mirrored.matrixWorldInverse);
    s.clip.set(s.plane.normal.x, s.plane.normal.y, s.plane.normal.z, s.plane.constant);
    const p = mirrored.projectionMatrix.elements;
    s.q.set((Math.sign(s.clip.x) + p[8]) / p[0], (Math.sign(s.clip.y) + p[9]) / p[5], -1.0, (1.0 + p[10]) / p[14]);
    s.clip.multiplyScalar(2.0 / s.clip.dot(s.q));
    p[2] = s.clip.x;
    p[6] = s.clip.y;
    p[10] = s.clip.z + 1.0;
    p[14] = s.clip.w;
    return true;
  };

  useFrame(() => {
    const material = materialRef.current;
    const parent = material?.parent || material?.__r3f?.parent;
    if (!parent) return;
    frame.current += 1;
    if (frame.current % every !== 1 % every) return;
    if (!placeMirror(parent)) return;
    parent.visible = false;
    const xrEnabled = gl.xr.enabled;
    const shadowAutoUpdate = gl.shadowMap.autoUpdate;
    gl.xr.enabled = false;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(fbo1);
    gl.state.buffers.depth.setMask(true);
    if (!gl.autoClear) gl.clear();
    gl.render(scene, s.camera);
    if (hasBlur) blurPass.render(gl, fbo1, fbo2);
    gl.xr.enabled = xrEnabled;
    gl.shadowMap.autoUpdate = shadowAutoUpdate;
    parent.visible = true;
    gl.setRenderTarget(null);
  });

  return (
    <reflectorMaterialImpl
      attach="material"
      // Defines cannot change on a compiled material, so it is rebuilt.
      key={`reflector${reflectorProps['defines-USE_BLUR']}${reflectorProps['defines-USE_DEPTH']}`}
      ref={materialRef}
      {...reflectorProps}
      {...props}
    />
  );
});

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GUIDE_DETAILS, guideSubject, measureGuideSubject } from './guideShots';

// The caption card names the equipment. Keep its geometry unobstructed and
// identify the moving subject with a quiet outline rather than another label.
export default function GuideFocusIndicator({ request, disabled }) {
  const { scene } = useThree();
  const outline = useRef(null);
  const scratch = useMemo(() => ({ box: new THREE.Box3(), center: new THREE.Vector3(), size: new THREE.Vector3(), edges: new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)) }), []);
  useEffect(() => () => scratch.edges.dispose(), [scratch]);
  useFrame(() => {
    if (!outline.current) return;
    const subject = !disabled && GUIDE_DETAILS[request?.shot] && guideSubject(scene, request.shot);
    const box = subject && measureGuideSubject(subject, scratch.box);
    outline.current.visible = Boolean(box);
    if (!box) return;
    box.getCenter(scratch.center); box.getSize(scratch.size).addScalar(.025);
    outline.current.position.copy(scratch.center);
    outline.current.scale.copy(scratch.size);
  });
  return <lineSegments ref={outline} geometry={scratch.edges} visible={false} renderOrder={100} raycast={() => null}>
    <lineBasicMaterial color="#4de2d0" depthTest={false} transparent opacity={.45} />
  </lineSegments>;
}

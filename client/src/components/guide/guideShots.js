import * as THREE from 'three';
import { IFARLAB_OFFSET, IFARLAB_COPY_OFFSET, IFARLAB_INSPECTION_OFFSET, IFARLAB_DOOR_OFFSET, OTOKAR_PICK_OFFSET } from '../cellLayout.js';
import { SHOWCASE_ITEMS, SHOWCASE_ORIGIN } from './equipmentShowcase.js';

const cell = (offset, side = 1) => ({
  center: [offset[0] - 0.7, 1.25, offset[2] - 1.25],
  size: [5.2, 2.7, 4.9],
  eyes: [[offset[0] + side * 5.4, 4.1, offset[2] + 5.5], [offset[0] - side * 5.6, 4.0, offset[2] + 5.7]],
  orbit: .12,
});
const rearCell = (offset, side = 1) => ({ ...cell(offset, side), eyes: [[offset[0] - side * 5.2, 3.9, offset[2] - 6.2], [offset[0] + side * 5.2, 4, offset[2] - 6.2]] });
const local = (position) => position.map((v, i) => v + IFARLAB_OFFSET[i]);

// Camera subjects use the existing layout and measured world bounds (see
// BodyInspection and the camera framing checks). The low underbody shot
// remains below the bus's 1.51 m underside; the roof shot looks from above.
export const GUIDE_SHOTS = {
  overview: { center: [3.2, 2.25, 3.1], size: [20, 5.2, 22], eyes: [[14.5, 5.3, 21.5], [-13, 5.5, 20.5]], maxFov: 125 },
  wallSigns: { center: [0, 5.95, -23.6], size: [4.7, 5, .3], eyes: [[-1, 5.8, -15.2], [4.8, 5.4, -15.2]] },
  pickPlace: cell(IFARLAB_OFFSET),
  tourEnd: { center: [6.8, 1.8, 6.5], size: [12.2, 3.4, 12], eyes: [[14.2, 4.8, 18.6], [14.1, 5, 22.4], [-9.5, 5.35, 21.6]], maxFov: 115 },
  monitoring: cell(OTOKAR_PICK_OFFSET),
  monitoringRear: rearCell(OTOKAR_PICK_OFFSET),
  screwdriving: cell(IFARLAB_COPY_OFFSET),
  inspection: cell(IFARLAB_INSPECTION_OFFSET, -1),
  door: cell(IFARLAB_DOOR_OFFSET, -1),
  pickPlaceRear: rearCell(IFARLAB_OFFSET),
  screwdrivingRear: rearCell(IFARLAB_COPY_OFFSET),
  inspectionRear: rearCell(IFARLAB_INSPECTION_OFFSET, -1),
  doorRear: rearCell(IFARLAB_DOOR_OFFSET, -1),
  equipment: { center: [SHOWCASE_ORIGIN[0], 1, SHOWCASE_ORIGIN[2]], size: [6.3, 1.9, 1.1], eyes: [[-4.1, 5.3, 22.2], [-10, 4.8, 20.8]], orbit: .08 },
  ur10e: { center: local([0.05, 1.25, -1.1]), size: [2.8, 2.5, 3.2], eyes: [local([3.7, 3.0, 2.7]), local([-3.8, 3.0, 2.8])] },
  rail: { center: local([-0.1, 0.8, -1.2]), size: [2.4, 1.5, 3.3], eyes: [local([3.4, 2.5, 2.4]), local([2.8, 3.0, -4.5])] },
  conveyor: { center: local([0.74, 0.85, -0.8]), size: [1.4, 1.25, 2.8], eyes: [local([3.6, 2.2, 1.8]), local([2.8, 2.8, -3.7])] },
  kawasaki: { center: local([-2.15, 1.05, -1.5]), size: [2.7, 2.2, 3.5], eyes: [local([-4.8, 2.8, 2.2]), local([1.2, 3, 1.9])] },
  busInspection: { center: [-3.9, 2.35, -1.2], size: [7.5, 5.0, 16.3], eyes: [[-10.7, 4.5, 9.5], [-9.2, 4.6, 14.2]] },
  busInspectionRear: { center: [-3.9, 2.35, -1.2], size: [7.5, 5, 16.3], eyes: [[4.8, 5.1, -15.7], [6.4, 5.3, -18.0]], orbit: .08 },
  underbody: { center: [-3.9, 1.1, -1.4], size: [5.0, 1.25, 12.1], eyes: [[-12.8, 1.25, 8.5], [-12.8, 1.2, -13.5]] },
  roof: { center: [-3.9, 4.0, -1.5], size: [5.0, 2.1, 12.1], eyes: [[4.0, 6.2, 10.4], [-12.2, 5.8, -13.5]] },
  buses: { center: [5.8, 1.8, -14.0], size: [13.5, 3.8, 14], eyes: [[-8.0, 5.4, -4.0], [13.8, 5.3, 1.0]] },
  training: { center: [6.4, 1.1, 12.8], size: [8.5, 2.4, 3.8], eyes: [[9.5, 3.8, 20.7], [1.5, 4.0, 20.0]] },
};

const EXHIBIT_DIRECTIONS = [[.35, .4, 1], [-.35, .4, 1], [0, .7, 1]];
export const GUIDE_DETAILS = {
  ...Object.fromEntries(SHOWCASE_ITEMS.map((item) => [item.shot, { subject: item.anchor, context: 'equipment', label: item.title, root: 'guide-equipment-gallery', reference: item.kind === 'illustration', exhibit: true, directions: EXHIBIT_DIRECTIONS }])),
  robotGripper: { subject: 'guide-demo-ur10e-gripper', context: 'pickPlace', label: 'Robot üzerindeki hareketli tutucu', root: 'cell-pickPlace' },
  monitoringGripper: { subject: 'guide-ur10e-gripper', context: 'monitoring', label: 'İzleme istasyonu UR10e tutucusu', root: 'cell-monitoring' },
  monitoringKawasaki: { subject: 'live-kawasaki', context: 'monitoring', label: 'İzleme istasyonu Kawasaki robotu', root: 'cell-monitoring' },
  monitoringWorkpiece: { subject: 'guide-monitoring-box-0', subjects: Array.from({ length: 5 }, (_, i) => `guide-monitoring-box-${i}`), context: 'monitoring', label: 'Taşınan kutu', root: 'cell-monitoring' },
  pickWorkpiece: { subject: 'guide-pick-box-0', subjects: Array.from({ length: 5 }, (_, i) => `guide-pick-box-${i}`), context: 'pickPlace', label: 'Taşınan kutu', root: 'cell-pickPlace' },
  robotVisionary: { subject: 'guide-demo-ur10e-camera', context: 'pickPlace', label: 'Robot üzerindeki SICK kamera', root: 'cell-pickPlace' },
  screwdriver: { subject: 'guide-ur10e-02-screwdriver', context: 'screwdriving', label: 'Vidalama ucu ve vida taşıma', root: 'cell-screwdriving' },
  assemblyTool: { subject: 'guide-ur10e-04-screwdriver', context: 'door', label: 'Kapı üzerindeki montaj ucu', root: 'cell-door' },
  inspectionTool: { subject: 'guide-ur10e-03-camera', context: 'inspection', label: 'Kapı kontrol kamerası', root: 'cell-inspection' },
  inspectionOtherTool: { subject: 'guide-kawasaki-03-inspection-tool', context: 'inspectionRear', label: 'Karşı yüzü inceleyen Kawasaki kamerası', root: 'cell-inspection' },
  assemblyOtherTool: { subject: 'guide-kawasaki-04-inspection-tool', context: 'doorRear', label: 'Montajı kontrol eden Kawasaki kamerası', root: 'cell-door' },
  doorPanel: { subject: 'guide-door-panel', context: 'door', label: 'Montaj yapılan kapı paneli', root: 'cell-door' },
  inspectionPanel: { subject: 'guide-inspection-panel', context: 'inspection', label: 'İki taraftan incelenen kapı düzeneği', root: 'cell-inspection' },
  underbodyHead: { subject: 'camera-mount', scope: 'robot1-cad-frame', context: 'underbody', label: 'R1 · alt gövde kamera başlığı', root: 'robot1-cad-frame', directions: [[-1, -.1, .8], [-1, -.1, -.8], [1, -.1, .8]] },
  roofHead: { subject: 'camera-mount', scope: 'robot2-cad-frame', context: 'roof', label: 'R2 · tavan kamera başlığı', root: 'robot2-cad-frame' },
};
for (const item of SHOWCASE_ITEMS) GUIDE_DETAILS[`${item.shot}Rear`] = { ...GUIDE_DETAILS[item.shot], label: `${item.title} · arka ve bağlantı detayları`, directions: [[-.4, .4, -1], [.4, .4, -1]] };
// A context frame is used only while the named equipment is loading. The
// detail camera is calculated from its live geometry, never from this box.
for (const [id, detail] of Object.entries(GUIDE_DETAILS)) {
  GUIDE_SHOTS[id] = { ...GUIDE_SHOTS[detail.context], detail };
}

export function visibleInScene(node, scene) {
  while (node) {
    if (!node.visible) return false;
    if (node === scene) return true;
    node = node.parent;
  }
  return false;
}

export function guideSubject(scene, id) {
  const detail = GUIDE_DETAILS[id];
  if (!detail) return null;
  if (detail.subjects) {
    const visible = detail.subjects.map((name) => scene.getObjectByName(name)).filter((node) => node && visibleInScene(node, scene));
    return visible.find((node) => node.userData.held) || visible[0] || null;
  }
  const node = (detail.scope ? scene.getObjectByName(detail.scope) : scene)?.getObjectByName(detail.subject);
  return node && visibleInScene(node, scene) ? node : null;
}

export function measureGuideSubject(node, box = new THREE.Box3()) {
  node.updateWorldMatrix(true, true);
  box.makeEmpty();
  node.traverseVisible((part) => {
    if (!part.isMesh || !part.geometry) return;
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    if (part.geometry.boundingBox) box.union(part.geometry.boundingBox.clone().applyMatrix4(part.matrixWorld));
  });
  return box.isEmpty() ? null : box;
}

export function guideOccluders(scene, id, subject) {
  const detail = GUIDE_DETAILS[id];
  const root = detail?.root && scene.getObjectByName(detail.root);
  if (!root) return [];
  const excluded = new Set();
  subject.traverse((node) => excluded.add(node));
  const centre = subject.getWorldPosition(new THREE.Vector3());
  const boxes = [];
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (!node.isMesh || excluded.has(node) || !visibleInScene(node, scene)) return;
    const geometry = node.geometry;
    if (!geometry?.boundingBox) geometry?.computeBoundingBox();
    if (!geometry?.boundingBox) return;
    const box = geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
    if (box.distanceToPoint(centre) < 2.5) boxes.push(box);
  });
  return boxes;
}

const DETAIL_DIRECTIONS = [[1, .5, 1.2], [1, .5, -1.2], [-1, .5, 1.2], [-1, .5, -1.2], [.2, 1, 1], [.2, 1, -1]];

/** Fit the actual moving part to the usable image area with a natural lens.
 * A camera translation, rather than a very wide lens on the whole robot,
 * makes small fingers, suction cups and camera housings readable.
 */
export function chooseDetailShot(box, aspect, captionFraction = .3, occluders = [], preferredDirection = null, directionOptions = DETAIL_DIRECTIONS) {
  const centre = box.getCenter(new THREE.Vector3());
  const extent = box.getSize(new THREE.Vector3());
  const radius = Math.max(.06, extent.length() / 2);
  const points = subjectCorners({ center: centre.toArray(), size: extent.toArray() });
  const view = new THREE.PerspectiveCamera(38, Math.max(.3, aspect), .02, 150);
  const bottom = Math.min(.6, 2 * captionFraction - 1 + .08);
  const aimY = (.8 + bottom) / 2;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(38 / 2));
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  const directions = preferredDirection ? [preferredDirection] : directionOptions;
  const candidates = directions.map((raw, index) => {
    const direction = new THREE.Vector3(...raw).normalize();
    const screenUp = new THREE.Vector3(0, 1, 0).addScaledVector(direction, -direction.y).normalize();
    const target = centre.clone();
    const fits = (distance) => {
      target.copy(centre).addScaledVector(screenUp, -distance * tanHalf * aimY);
      view.position.copy(centre).addScaledVector(direction, distance);
      view.lookAt(target); view.updateMatrixWorld();
      return points.every((point) => {
        const projected = point.clone().project(view);
        return Math.abs(projected.x) <= .8 && projected.y <= .8 && projected.y >= bottom && projected.z > -1 && projected.z < 1;
      });
    };
    let low = .35;
    let high = Math.max(1.2, radius * 18);
    for (let i = 0; i < 18; i += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) high = middle;
      else low = middle;
    }
    const distance = high * 1.07;
    target.copy(centre).addScaledVector(screenUp, -distance * tanHalf * aimY);
    const eye = centre.clone().addScaledVector(direction, distance);
    let occlusion = 0;
    const samples = [centre, centre.clone().add(new THREE.Vector3(0, extent.y * .3, 0))];
    for (const blocker of occluders) {
      if (blocker.containsPoint(eye)) { occlusion += 4; continue; }
      for (const sample of samples) {
        ray.set(eye, sample.clone().sub(eye).normalize());
        if (ray.intersectBox(blocker, hit) && hit.distanceTo(eye) < sample.distanceTo(eye) - .03) occlusion += 1;
      }
    }
    const safe = Math.abs(eye.x) < 15.3 && Math.abs(eye.z) < 23.5 && eye.y > .35 && eye.y < guideCeiling(eye.x);
    return { eye: eye.toArray(), target: target.toArray(), fov: 38, direction: direction.toArray(), distance, score: (safe ? 0 : 10000) + occlusion * 30 + index * .35 + distance * .1 };
  });
  return candidates.sort((a, b) => a.score - b.score)[0];
}

export function guideCeiling(x) {
  const profile = [[0, 10.07], [4.05, 9.88], [7.6, 9.4], [10.48, 8.83], [13.55, 8], [16.27, 6.98]];
  for (let i = 1; i < profile.length; i += 1) {
    if (Math.abs(x) <= profile[i][0]) {
      const [x0, y0] = profile[i - 1];
      const [x1, y1] = profile[i];
      return y0 + (Math.abs(x) - x0) * (y1 - y0) / (x1 - x0) - 0.9;
    }
  }
  return 6.08;
}

export function subjectCorners(shot) {
  return [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new THREE.Vector3(
    shot.center[0] + x * shot.size[0] / 2,
    shot.center[1] + y * shot.size[1] / 2,
    shot.center[2] + z * shot.size[2] / 2,
  ))));
}

// Evaluate all eight corners in camera coordinates. Using the horizontal
// lens as well as the vertical lens keeps the subject in frame on a phone.
// Reserve the lower part of the canvas for the narration card.
export function frameGuideAtEye(shot, eye, aspect, captionFraction = .28) {
  const centre = new THREE.Vector3(...shot.center);
  const target = centre.clone();
  const camera = new THREE.PerspectiveCamera(48, Math.max(.3, aspect), .05, 150);
  camera.position.fromArray(eye);
  const direction = camera.position.clone().sub(centre).normalize();
  const screenUp = new THREE.Vector3(0, 1, 0).addScaledVector(direction, -direction.y).normalize();
  const distance = camera.position.distanceTo(centre);
  const bottom = Math.min(.6, 2 * captionFraction - 1 + .06);
  const aim = (.84 + bottom) / 2;
  const points = subjectCorners(shot);
  const fits = (fov) => {
    target.copy(centre).addScaledVector(screenUp, -distance * Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aim);
    camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(target); camera.updateMatrixWorld();
    return points.every((point) => {
      const p = point.clone().project(camera);
      return Math.abs(p.x) <= .88 && p.y <= .84 && p.y >= bottom && p.z > -1 && p.z < 1;
    });
  };
  const maximum = shot.maxFov || 115;
  let low = 28, high = maximum;
  for (let i = 0; i < 18; i += 1) { const middle = (low + high) / 2; if (fits(middle)) high = middle; else low = middle; }
  const fov = Math.min(maximum, high * 1.02);
  const fitted = fits(fov);
  return { eye: [...eye], target: target.toArray(), fov, fits: fitted };
}

export function chooseGuideShot(id, aspect = 1.7, currentEye = [14.64, 3.33, 17.37], captionFraction = 0.28) {
  const shot = GUIDE_SHOTS[id] || GUIDE_SHOTS.overview;
  const eyes = shot.eyes.flatMap((eye, index) => [1, 1.25, 1.5].map((distance) => ({
    eye: [shot.center[0] + (eye[0] - shot.center[0]) * distance, eye[1], shot.center[2] + (eye[2] - shot.center[2]) * distance], index,
  }))).filter(({ eye }) => Math.abs(eye[0]) < 15.3 && Math.abs(eye[2]) < 23.5 && eye[1] < guideCeiling(eye[0]));
  const candidates = eyes.map(({ eye, index }) => {
    const pose = frameGuideAtEye(shot, eye, aspect, captionFraction);
    // Prefer a tight lens, then the curated first angle, then shorter travel.
    const travel = new THREE.Vector3(...eye).distanceTo(new THREE.Vector3(...currentEye));
    return { ...pose, score: (pose.fits ? 0 : 1000) + Math.abs(pose.fov - 48) + index * 1.8 + travel * .025 };
  });
  return candidates.sort((a, b) => a.score - b.score)[0];
}

const safeEye = (eye) => [THREE.MathUtils.clamp(eye[0], -15.3, 15.3), THREE.MathUtils.clamp(eye[1], .7, guideCeiling(eye[0])), THREE.MathUtils.clamp(eye[2], -23.5, 23.5)];

/** Pull back before leaving a close-up, travel above machinery between
 * areas, establish the new exhibit/cell, then approach the actual subject.
 * Same-cell reverse angles use an outside arc instead of crossing the cell.
 */
export function createGuideTransition(from, fromTarget, fromFov, destination, context = null) {
  const start = new THREE.Vector3(...from);
  const oldTarget = new THREE.Vector3(...fromTarget);
  const end = new THREE.Vector3(...destination.eye);
  const target = new THREE.Vector3(...destination.target);
  const areaDistance = oldTarget.distanceTo(target);
  const travel = start.distanceTo(end);
  const frames = [{ at: 0, eye: from, target: fromTarget, fov: fromFov }];
  if (areaDistance > 4 && travel > 4) {
    const away = start.clone().sub(oldTarget).normalize();
    const lift = start.clone().addScaledVector(away, .8); lift.y = Math.max(5.4, start.y);
    const approach = new THREE.Vector3(...(context?.eye || destination.eye)); approach.y = Math.max(5.4, approach.y);
    frames.push({ at: .22, eye: safeEye(lift.toArray()), target: oldTarget.lerp(target, .25).toArray(), fov: Math.max(52, fromFov) });
    frames.push({ at: .57, eye: safeEye(approach.toArray()), target: context?.target || destination.target, fov: Math.max(52, context?.fov || destination.fov) });
    if (context) frames.push({ at: .77, eye: context.eye, target: context.target, fov: context.fov });
  } else if (areaDistance < 2.5 && (travel > 3.5 || (areaDistance < .45 && start.clone().sub(oldTarget).normalize().dot(end.clone().sub(target).normalize()) < .2))) {
    const a = start.clone().sub(target); const b = end.clone().sub(target);
    const angle = Math.atan2(a.x, a.z);
    const turn = Math.atan2(Math.sin(Math.atan2(b.x, b.z) - angle), Math.cos(Math.atan2(b.x, b.z) - angle));
    const radius = Math.max(Math.hypot(a.x, a.z), Math.hypot(b.x, b.z));
    frames.push({ at: .5, eye: safeEye([target.x + Math.sin(angle + turn / 2) * radius, Math.max(start.y, end.y) + (radius < 2 ? .15 : .5), target.z + Math.cos(angle + turn / 2) * radius]), target: destination.target, fov: Math.max(radius < 2 ? 42 : 52, fromFov, destination.fov) });
  } else if (travel > .4) {
    const middle = start.clone().lerp(end, .5);
    const look = oldTarget.clone().lerp(target, .5);
    const away = middle.clone().sub(look).normalize();
    middle.addScaledVector(away, .35); middle.y += .2;
    frames.push({ at: .5, eye: safeEye(middle.toArray()), target: look.toArray(), fov: Math.max(44, fromFov, destination.fov) });
  }
  frames.push({ at: 1, ...destination });
  return { frames, duration: areaDistance > 4 ? 2.35 : travel > 3.5 ? 1.65 : 1.05 };
}

export function sampleGuideTransition(plan, progress, destination) {
  const frames = plan.frames;
  let index = 1;
  while (index < frames.length - 1 && progress > frames[index].at) index += 1;
  const a = frames[index - 1];
  const b = index === frames.length - 1 ? { ...frames[index], ...destination } : frames[index];
  const t = THREE.MathUtils.clamp((progress - a.at) / (b.at - a.at), 0, 1);
  const u = t * t * (3 - 2 * t);
  return {
    eye: safeEye(a.eye.map((value, i) => THREE.MathUtils.lerp(value, b.eye[i], u))),
    target: a.target.map((value, i) => THREE.MathUtils.lerp(value, b.target[i], u)),
    fov: THREE.MathUtils.lerp(a.fov, b.fov, u),
  };
}

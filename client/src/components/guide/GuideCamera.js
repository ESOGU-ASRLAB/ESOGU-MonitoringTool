import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GUIDE_DETAILS, GUIDE_SHOTS, chooseDetailShot, chooseGuideShot, createGuideTransition, frameGuideAtEye, guideCeiling, guideOccluders, guideSubject, measureGuideSubject, sampleGuideTransition, visibleInScene } from './guideShots';
import { SHOWCASE_ITEMS } from './equipmentShowcase';

const CELL_NAMES = { pickPlace: 'cell-pickPlace', pickPlaceRear: 'cell-pickPlace', ur10e: 'cell-pickPlace', rail: 'cell-pickPlace', conveyor: 'cell-pickPlace', kawasaki: 'cell-pickPlace', training: 'cell-pickPlace', screwdriving: 'cell-screwdriving', screwdrivingRear: 'cell-screwdriving', inspection: 'cell-inspection', inspectionRear: 'cell-inspection', door: 'cell-door', doorRear: 'cell-door' };
CELL_NAMES.monitoring = 'cell-monitoring';
CELL_NAMES.monitoringRear = 'cell-monitoring';
CELL_NAMES.wallSigns = 'factory-sign-asrlab';
const UP = new THREE.Vector3(0, 1, 0);

export default function GuideCamera({ request, paused, controlsRef, onArrive, disabled }) {
  const { camera, size, scene } = useThree();
  const flight = useRef(null);
  const arrival = useRef(onArrive);
  arrival.current = onArrive;

  useEffect(() => {
    if (!request || disabled) { flight.current = null; return; }
    const controls = controlsRef.current;
    if (!controls) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const detail = GUIDE_DETAILS[request.shot];
    const workspace = Boolean(request.workspace);
    flight.current = {
      serial: request.serial, shot: request.shot, workspace, detail, elapsed: 0, arrived: false, reduced, tourTime: 0,
      from: camera.position.clone(), fromTarget: controls.target.clone(), fromFov: camera.fov,
      aspect: size.width / Math.max(1, size.height),
      captionFraction: Math.min(.32, (workspace ? 65 : 180) / Math.max(1, size.height)),
      box: new THREE.Box3(), to: new THREE.Vector3(), target: new THREE.Vector3(),
    };
    // Flush the old orbit damping before taking control of the camera.
    controls.enableDamping = false;
    controls.update();
    // Phone wrapping and optional settings change the caption bar's
    // height. Reserve the real covered area instead of a fixed pixel guess.
    let panel = null;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateCaption()) : null;
    const updateCaption = () => {
      const move = flight.current;
      const canvas = controls.domElement;
      const nextPanel = document.querySelector(workspace ? '.view-controls' : '.guide-tour');
      if (nextPanel !== panel) {
        if (panel) observer?.unobserve(panel);
        panel = nextPanel;
        if (panel) observer?.observe(panel);
      }
      if (!move || !panel || !canvas?.getBoundingClientRect) return;
      if (!panel.getBoundingClientRect().height) return;
      const covered = Math.max(0, canvas.getBoundingClientRect().bottom - panel.getBoundingClientRect().top);
      move.captionFraction = Math.min(.74, covered / Math.max(1, size.height) + .025);
    };
    updateCaption();
    const guideUI = !workspace && document.querySelector('.digital-guide');
    const mutations = guideUI && typeof MutationObserver !== 'undefined' ? new MutationObserver(updateCaption) : null;
    mutations?.observe(guideUI, { childList: true, subtree: true });
    return () => { observer?.disconnect(); mutations?.disconnect(); controls.enableDamping = true; };
  }, [request, disabled, camera, controlsRef, size.width, size.height]);

  useFrame((_, delta) => {
    const move = flight.current;
    if (!move || disabled || (paused && !move.arrived)) return;
    const controls = controlsRef.current;
    if (!controls) return;
    const dt = Math.min(delta, .1);
    if (move.arrived && !paused) move.tourTime += dt;
    let ready;
    if (move.detail) {
      const subject = guideSubject(scene, move.shot);
      if (!subject) return;
      // Measure the selected equipment only. Keep following its world-space
      // motion after arrival, including movement along the robot's rail.
      if (!measureGuideSubject(subject, move.box)) return;
      const blockers = !move.pose ? guideOccluders(scene, move.shot, subject) : [];
      let direction = move.direction;
      if (direction && move.arrived && !move.reduced) direction = new THREE.Vector3(...direction).applyAxisAngle(UP, Math.sin(move.tourTime * .15) * .18).toArray();
      move.pose = chooseDetailShot(move.box, move.aspect, move.captionFraction, blockers, direction, move.detail.directions);
      if (!move.direction) move.direction = move.pose.direction;
      move.to.fromArray(move.pose.eye); move.target.fromArray(move.pose.target);
      ready = true;
    } else {
      const spec = GUIDE_SHOTS[move.shot] || GUIDE_SHOTS.overview;
      if (!move.basePose || move.baseCaptionFraction !== move.captionFraction) {
        move.basePose = chooseGuideShot(move.shot, move.aspect, camera.position.toArray(), move.captionFraction);
        move.baseCaptionFraction = move.captionFraction;
      }
      move.pose = move.basePose;
      if (move.arrived && spec.orbit && !move.reduced) {
        const centre = new THREE.Vector3(...spec.center);
        const eye = new THREE.Vector3(...move.basePose.eye).sub(centre).applyAxisAngle(UP, Math.sin(move.tourTime * .14) * spec.orbit).add(centre).toArray();
        eye[0] = THREE.MathUtils.clamp(eye[0], -15.3, 15.3); eye[2] = THREE.MathUtils.clamp(eye[2], -23.5, 23.5);
        move.pose = frameGuideAtEye(spec, eye, move.aspect, move.captionFraction);
      }
      move.to.fromArray(move.pose.eye); move.target.fromArray(move.pose.target);
      if (!move.arrived) {
        const names = move.shot === 'equipment' ? SHOWCASE_ITEMS.map((item) => item.anchor) : ['busInspection', 'busInspectionRear', 'underbody', 'roof', 'overview'].includes(move.shot)
          ? ['robot1-cad-frame', 'robot2-cad-frame', 'inspection-bus-body', 'cell-pickPlace']
          : [CELL_NAMES[move.shot] || 'cell-pickPlace'];
        ready = names.every((name) => visibleInScene(scene.getObjectByName(name), scene));
      }
    }
    if (move.arrived) {
      // Move the virtual camera rig with the part in the same frame. A
      // damped chase lags behind fast rail moves, especially at low FPS,
      // and lets the fingers disappear behind the caption card.
      camera.position.copy(move.to);
      controls.target.copy(move.target);
      camera.fov = move.pose.fov;
    } else {
      if (!move.plan) {
        const contextId = move.detail?.exhibit ? 'equipment' : move.workspace ? move.detail?.context : null;
        const context = contextId ? chooseGuideShot(contextId, move.aspect, move.from.toArray(), move.captionFraction) : null;
        move.plan = createGuideTransition(move.from.toArray(), move.fromTarget.toArray(), move.fromFov, move.pose, context);
        move.duration = move.reduced ? .01 : move.plan.duration * (move.workspace ? .85 : 1);
      }
      move.elapsed += dt;
      const t = Math.min(1, move.elapsed / move.duration);
      const pose = sampleGuideTransition(move.plan, t, move.pose);
      camera.position.fromArray(pose.eye);
      controls.target.fromArray(pose.target);
      camera.fov = pose.fov;
      if (t === 1 && ready) { move.arrived = true; arrival.current(move.serial, move.shot); }
    }
    camera.position.y = Math.min(camera.position.y, guideCeiling(camera.position.x));
    camera.updateProjectionMatrix();
    controls.update();
  });
  return null;
}

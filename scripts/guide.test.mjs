import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from '../client/node_modules/three/build/three.module.js';
import { answerGuide } from '../client/src/components/guide/guideAnswers.js';
import { GUIDE_TOPICS, TOPIC_SHOT_PLANS, TOUR_STOPS, TOPIC_BY_ID, narrationFor } from '../client/src/components/guide/guideContent.js';
import { GUIDE_DETAILS, GUIDE_SHOTS, chooseDetailShot, chooseGuideShot, createGuideTransition, guideCeiling, sampleGuideTransition, subjectCorners } from '../client/src/components/guide/guideShots.js';
import { SHOWCASE_ITEMS, SHOWCASE_ORIGIN } from '../client/src/components/guide/equipmentShowcase.js';
import { getGuideTopic, getGuideTopics } from '../client/src/components/guide/guidePresentation.js';
import { GUIDE_UI } from '../client/src/components/guide/guideLanguage.js';
import { guideSubject } from '../client/src/components/guide/guideShots.js';

test('the visitor tour contains only four use cases plus bus inspection', () => {
  assert.deepEqual(TOUR_STOPS, ['digital-twin', 'pick-place', 'screwdriving', 'dual-inspection', 'door-assembly', 'busInspection']);
  for (const language of ['en', 'tr']) {
    assert.equal(getGuideTopics(language).length, 6);
    for (const id of TOUR_STOPS) {
      const item = getGuideTopic(id, language);
      assert.equal(item.lines.length, id === 'digital-twin' ? 2 : 3);
      assert.ok(item.narration.split(/\s+/).length < 50);
      const plan = TOPIC_SHOT_PLANS[id];
      assert.ok(id === 'digital-twin' || plan.some((entry) => GUIDE_DETAILS[entry.shot]));
      assert.ok(plan.every((entry) => entry.sentence < item.lines.length));
    }
    for (const question of GUIDE_UI[language].suggestions) {
      const answer = answerGuide(question, { language });
      assert.ok(answer.items.length);
      assert.ok(answer.items.every((item) => !item.sceneTopic || TOUR_STOPS.includes(item.sceneTopic)));
    }
  }
  assert.equal(TOPIC_SHOT_PLANS['pick-place'][0].shot, 'pickPlace');
  assert.equal(GUIDE_DETAILS.monitoringGripper.root, 'cell-monitoring');
});

test('chat answers the named robot and remembers it for a follow-up', () => {
  const reply = answerGuide('Hi, what is the UR-10e?');
  assert.deepEqual(reply.items.map(({ id }) => id), ['ur10e']);
  assert.match(reply.items[0].intro, /six-axis collaborative robot arm.*two-finger gripper/);
  assert.equal(reply.items[0].sceneTopic, 'pick-place');
  const followUp = answerGuide('How much can it lift?', { previousTopic: reply.topicId });
  assert.match(followUp.items[0].intro, /12\.5 kg/);
  const turkish = answerGuide('UR10e nedir?', { language: 'tr' });
  assert.match(turkish.items[0].intro, /altı eksenli.*iki parmaklı/);
  const straightAnswer = answerGuide('What is the VGC10?');
  assert.deepEqual(straightAnswer.items.map(({ id }) => id), ['vacuum']);
  assert.match(straightAnswer.items[0].intro, /suction cups/);
  assert.equal(straightAnswer.items[0].sceneTopic, undefined);
  assert.doesNotMatch(JSON.stringify(answerGuide('screwdriving')), /\bcomponents\/|\.jsx?\b/);
});

test('pick-and-place close-up chooses the held box rather than an old box on the table', () => {
  const scene = new THREE.Scene();
  const oldBox = new THREE.Group(); oldBox.name = 'guide-pick-box-0'; scene.add(oldBox);
  const held = new THREE.Group(); held.name = 'guide-pick-box-2'; held.userData.held = true; scene.add(held);
  assert.equal(guideSubject(scene, 'pickWorkpiece'), held);
  held.visible = false;
  assert.equal(guideSubject(scene, 'pickWorkpiece'), oldBox);
  oldBox.visible = false;
  assert.equal(guideSubject(scene, 'pickWorkpiece'), null);
});

test('live connection and demo mode are described independently', () => {
  const demo = answerGuide('Canlı veri var mı?', { liveStatus: 'live', animate: true, language: 'tr' });
  assert.match(demo.intro, /açık/);
  assert.match(demo.extra, /yalnızca izleme istasyonundaki.*simülasyon/);
  const offline = answerGuide('Canlı veri var mı?', { liveStatus: 'offline', animate: false, language: 'tr' });
  assert.match(offline.intro, /çevrimdışı/);
  assert.match(offline.extra, /Demolar duraklatıldı/);
});

test('visitor material and both recorded tours omit the manufacturer', () => {
  const clips = JSON.parse(readFileSync(new URL('../client/src/components/guide/narrationClips.json', import.meta.url), 'utf8'));
  const audioDir = new URL('../client/public/assets/audio/guide/', import.meta.url);
  const usedFiles = [];
  for (const language of ['en', 'tr']) {
    const allTopics = GUIDE_TOPICS.map(({ id }) => getGuideTopic(id, language));
    assert.doesNotMatch(JSON.stringify([allTopics, GUIDE_UI[language]]), /otokar/i);
    const manufacturerQuestion = answerGuide('Otokar', { language });
    assert.equal(manufacturerQuestion.items.length, 0);
    assert.doesNotMatch(JSON.stringify(manufacturerQuestion), /otokar/i);
    const lines = getGuideTopics(language).flatMap((topic) => topic.lines);
    assert.deepEqual(Object.keys(clips[language]), lines);
    usedFiles.push(...Object.values(clips[language]));
  }
  assert.deepEqual(readdirSync(audioDir).filter((name) => name.endsWith('.mp3')).sort(), usedFiles.sort());
});

test('camera shots fit their subjects on desktop, tablet and portrait phone, below the roof', () => {
  for (const aspect of [2.1, 1.7, 1, 0.55]) {
    for (const [id, shot] of Object.entries(GUIDE_SHOTS)) {
      const pose = chooseGuideShot(id, aspect);
      assert.ok(Math.abs(pose.eye[0]) < 15.45 && Math.abs(pose.eye[2]) < 23.75, `${id}: outside hall`);
      assert.ok(pose.eye[1] < guideCeiling(pose.eye[0]), `${id}: above roof`);
      const camera = new THREE.PerspectiveCamera(pose.fov, aspect, 0.05, 150);
      camera.position.fromArray(pose.eye);
      camera.lookAt(new THREE.Vector3(...pose.target));
      camera.updateMatrixWorld();
      for (const corner of subjectCorners(shot)) {
        const p = corner.project(camera);
        assert.ok(Math.abs(p.x) <= 0.881 && p.y <= 0.841 && p.y >= -0.441, `${id} at aspect ${aspect}: subject clipped (${p.x}, ${p.y})`);
      }
    }
  }
  assert.ok(chooseGuideShot('underbody').eye[1] < 1.51);
  assert.ok(chooseGuideShot('roof').eye[1] > 4.36);
});

test('area transfers lift above machinery, establish the display, and arrive at the actual material', () => {
  const destination = { eye: [-4.1, 1.5, 15.6], target: [-4.1, 1.1, 14.8], fov: 38 };
  const context = chooseGuideShot('equipment', 1.7);
  const plan = createGuideTransition([8, 3.5, 15], [6, 1, 9], 42, destination, context);
  assert.ok(plan.frames.some((frame) => frame.eye[1] >= 5.4));
  assert.deepEqual(sampleGuideTransition(plan, 1, destination).eye, destination.eye);
  assert.deepEqual(sampleGuideTransition(plan, .77, destination).eye, context.eye);
  for (let t = 0; t <= 1; t += .01) {
    const { eye } = sampleGuideTransition(plan, t, destination);
    assert.ok(Math.abs(eye[0]) <= 15.3 && Math.abs(eye[2]) <= 23.5 && eye[1] <= guideCeiling(eye[0]));
  }
});

test('opposite close-up angles go around the material instead of flying through its centre', () => {
  const destination = { eye: [0, 1.4, -1], target: [0, 1.2, 0], fov: 38 };
  const plan = createGuideTransition([0, 1.4, 1], [0, 1.2, 0], 38, destination);
  for (let t = 0; t <= 1; t += .01) {
    const { eye } = sampleGuideTransition(plan, t, destination);
    assert.ok(Math.hypot(eye[0], eye[2]) > .68);
  }
});

test('close-ups tightly frame small equipment above subtitles on desktop and mobile', () => {
  const box = new THREE.Box3(new THREE.Vector3(6, 1.3, 9), new THREE.Vector3(6.2, 1.44, 9.12));
  for (const aspect of [1.7, 1, .55]) for (const caption of [.38, .58]) {
    const pose = chooseDetailShot(box, aspect, caption);
    const center = box.getCenter(new THREE.Vector3());
    assert.ok(new THREE.Vector3(...pose.eye).distanceTo(center) < 1.6);
    const camera = new THREE.PerspectiveCamera(pose.fov, aspect, .05, 150);
    camera.position.fromArray(pose.eye); camera.lookAt(new THREE.Vector3(...pose.target)); camera.updateMatrixWorld();
    for (const corner of subjectCorners({ center: center.toArray(), size: box.getSize(new THREE.Vector3()).toArray() })) {
      const p = corner.project(camera);
      assert.ok(Math.abs(p.x) < .81 && p.y < .81 && p.y > 2 * caption - 1 + .075, `detail clipped at ${aspect}, ${caption}: ${p.x}, ${p.y}`);
    }
  }
});

test('a nearby obstruction changes the preferred close-up angle', () => {
  const box = new THREE.Box3(new THREE.Vector3(-.08, 1.2, -.06), new THREE.Vector3(.08, 1.4, .06));
  const clear = chooseDetailShot(box, 1.7);
  const eye = new THREE.Vector3(...clear.eye);
  const blocker = new THREE.Box3().setFromCenterAndSize(eye, new THREE.Vector3(.3, .3, .3));
  const alternate = chooseDetailShot(box, 1.7, .3, [blocker]);
  assert.notDeepEqual(alternate.direction, clear.direction);
  assert.ok(!blocker.containsPoint(new THREE.Vector3(...alternate.eye)));
});

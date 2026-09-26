import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';

const DRONE_URL = process.env.PUBLIC_URL + '/assets/drone/drone.glb';
const DRONE_ROOT_NAME = 'Cube';
const PROPELLER_CLIPS = ['Cube.003Action', 'Cube.004Action', 'Cube.005Action.001'];
/*
 * SIZE, WHICH WAS THE MOST UNREALISTIC THING IN THE SCENE.
 *
 * The asset's mesh spans 38.19 x 27.98 x 29.87 in its own units, so at the
 * old scale of 0.1 each patrol drone was drawn 3.82 m across and 2.80 m tall
 * -- larger than a car, hovering five metres over a factory floor. Nothing
 * about the colours could have rescued that; the object was simply the wrong
 * size, and it read as a game prop because it was one.
 *
 * An industrial inspection drone is about 0.65 m across the propellers
 * (Matrice class); a small indoor one is 0.3-0.4 m. 0.018 gave exactly that --
 * 0.69 m -- and at six metres up in a thirty-metre hall it turned out to be
 * something you had to be told was there.
 *
 * 0.062 puts them at 2.37 x 1.73 x 1.85 m, which is frankly bigger than any
 * inspection drone ever built. The reason is the viewing distance rather than
 * the hardware: the opening camera now sits 42 m back on a 30-degree lens, and
 * at that range a correctly sized 0.65 m drone is about twenty pixels of
 * light grey against a busy roof. This is the one object in the scene scaled
 * for legibility instead of accuracy, and it is worth knowing that when
 * reading anything else off the model.
 *
 * Move the camera back in and this will look oversized. The number to change
 * is here and nowhere else.
 */
const DRONE_SCALE = 0.062;
/*
 * FINISHES.
 *
 * Two things were wrong here, and the first is the same mistake the robot
 * palette already documents: a drone is moulded polymer and composite, which
 * are DIELECTRICS. At metalness 0.38 and 0.45 the shell and the blades were
 * lit as though they were half bare metal, so they took the room's colour
 * instead of their own and went dead the moment they left a highlight.
 * Metalness 0.05 is what a painted or moulded surface actually is, however
 * glossy; the gloss belongs in roughness.
 *
 * The second is colour. The drones patrol at 4.7-5.0 m, which puts them
 * against the dark roof for most of their orbit, and the old body colour
 * #39474c scores 1.07:1 against it -- a contrast ratio of one is invisible.
 * They were not dark-looking drones, they were drone-shaped holes. A light
 * shell reads at 7.22:1 there and is also what industrial inspection drones
 * are actually finished in.
 *
 * The darker parts are then chosen to read against the SHELL rather than
 * against the roof, since that is what they sit next to:
 *
 *   colour    vs roof   vs shell
 *   #6b7479   2.17:1    3.33:1    gear -- legible against both
 *   #23282b   1.44:1   10.39:1    blades -- separated from the shell
 */
/*
 * THE DRONE KEEPS ITS OWN COLOURS RATHER THAN FOLLOWING PAINT.shell.
 *
 * It used to share the machine-enamel token with the UR10e and the Kawasaki,
 * which is defensible on paper -- all three are moulded, painted, dielectric --
 * and it broke the moment that token was tuned for the robots. At #535555 the
 * shell scores 1.38:1 against the dark roof these patrol in front of, and a
 * drone at that contrast is not a dark drone, it is an invisible one. The arms
 * have a floor behind them and the roof behind them is not their problem; the
 * drones fly in front of it for their whole orbit, so their contrast is a
 * different requirement and belongs to them.
 *
 * Measured against the roof: shell 7.42:1, gear 2.17:1. The gear is chosen to
 * read against the SHELL rather than the roof, since that is what it sits next
 * to.
 */
const SHELL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#d7dbdc', metalness: 0.05, roughness: 0.42,
});
const GEAR_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#6b7479', metalness: 0.05, roughness: 0.5,
});
const PROPELLER_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#23282b', metalness: 0.05, roughness: 0.35,
});

/*
 * The propellers name themselves: every animation clip is "<node>Action", so
 * the nodes the asset spins ARE the blades. Deriving the set from the clips
 * keeps the two in step -- and fixes a real misclassification.
 *
 * The old test was child.name.includes('003') || ... ('004') || ('005'), which
 * matches Cube.003 and Cube.004 as intended but ALSO matches Cylinder.003 and
 * Cylinder.004 -- motors, not blades -- so two pieces of hardware were being
 * painted as propellers.
 */
/*
 * ...and the names have to be sanitised the way GLTFLoader sanitises them.
 *
 * The clips are called "Cube.003Action", so stripping the suffix gives
 * "Cube.003" -- but the loader runs every node name through
 * PropertyBinding.sanitizeNodeName, which strips dots, so the object in the
 * scene is actually called "Cube003". Matching the raw name found nothing at
 * all, which meant every propeller silently got the shell material.
 */
const PROPELLER_NODES = new Set(
  PROPELLER_CLIPS.map((c) => c.replace(/Action.*$/, '').replace(/\./g, '')),
);

function applyRealisticMaterials(group) {
  group.traverse((child) => {
    if (!child.isMesh) return;
      // Small airborne props do not need a second shadow-map draw pass.
      child.castShadow = false;
      child.receiveShadow = false;

    if (PROPELLER_NODES.has(child.name)) {
      child.material = PROPELLER_MATERIAL;
    } else if (child.name.startsWith('Cylinder')) {
      // Motors, booms and landing legs. Splitting on the asset's own node type
      // rather than on a number substring gives a three-way split that follows
      // real parts: a light shell, mid-grey hardware, dark blades. One flat
      // colour over all of it was most of why the drone read as a toy.
      child.material = GEAR_MATERIAL;
    } else {
      child.material = SHELL_MATERIAL;
    }
  });
}

function DroneModel({ radius, height, center, speed, phase, tilt }) {
  const { scene, animations } = useGLTF(DRONE_URL);

  const droneRoot = useMemo(() => {
    /*
     * Fall back to the whole scene rather than returning null. The named
     * lookup is an optimisation -- it skips the asset's helper geometry -- and
     * if the asset is ever re-exported with a different root the old code
     * rendered NOTHING, with no error anywhere. An oversized drone is a
     * visible problem; a missing one looks like a camera or a palette bug and
     * costs an afternoon.
     */
    const found = scene.getObjectByName(DRONE_ROOT_NAME) || scene;
    
    const clone = found.clone(true);
    applyRealisticMaterials(clone);
    return clone;
  }, [scene]);

  const groupRef = useRef(null);
  const { actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    if (!actions) return;
    for (const name of PROPELLER_CLIPS) {
      actions[name]?.reset().play();
      if (actions[name]) actions[name].timeScale = 8;
    }
  }, [actions]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime() * speed + phase;
    const x = center[0] + Math.cos(t) * radius;
    const z = center[2] + Math.sin(t) * radius;
    const y = height + Math.sin(t * 2.3) * 0.15;
    group.position.set(x, y, z);
    group.rotation.y = -t - Math.PI / 2;
    group.rotation.z = Math.sin(t * 2.3) * 0.05;
    group.rotation.x = tilt;
  });

  if (!droneRoot) return null;

  return (
    <group ref={groupRef}>
      <primitive object={droneRoot} scale={[DRONE_SCALE, DRONE_SCALE, DRONE_SCALE]} />
    </group>
  );
}

useGLTF.preload(DRONE_URL);

export default function Drone(props) {
  return (
    <Suspense fallback={null}>
      <DroneModel {...props} />
    </Suspense>
  );
}

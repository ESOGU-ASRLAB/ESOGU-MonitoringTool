import React, { useLayoutEffect } from 'react';
import { UniformsLib } from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib';
import { LIGHTING, ROOM } from './scenePalette';

// Each bank covers a section of the existing ceiling rows near x ±3, ±6
// and ±9 m. Grouping the fixtures keeps the desktop light count low.
const POSITIONS = [
  [-6, 8.65, -11.2], [6, 8.65, -11.2],
  [-6, 8.65, 11.2], [6, 8.65, 11.2],
];

export default function FactoryFixtureBanks() {
  useLayoutEffect(() => {
    if (!UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();
  }, []);

  return POSITIONS.map((position) => (
    <rectAreaLight
      key={position.join(',')}
      name="factory-fixture-bank"
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      width={6.4}
      height={18}
      color={ROOM.lamp}
      intensity={LIGHTING.fixtureBanks}
    />
  ));
}

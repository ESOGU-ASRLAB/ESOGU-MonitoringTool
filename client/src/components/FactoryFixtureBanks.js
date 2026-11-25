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

// The two strips follow the measured bounds of the clerestory panes in the
// warehouse mesh. One area source per wall approximates their diffused skylight.
const CLERESTORY = { x: 15.98, y: 5.85, width: 45.8, height: 1.05 };

export default function FactoryFixtureBanks() {
  useLayoutEffect(() => {
    if (!UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();
  }, []);

  return (
    <>
      {POSITIONS.map((position) => (
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
      ))}
      {[-1, 1].map((side) => (
        <rectAreaLight
          key={side}
          name="factory-clerestory-light"
          position={[side * CLERESTORY.x, CLERESTORY.y, 0]}
          rotation={[0, side * Math.PI / 2, 0]}
          width={CLERESTORY.width}
          height={CLERESTORY.height}
          color={ROOM.daylight}
          intensity={LIGHTING.clerestory}
        />
      ))}
    </>
  );
}

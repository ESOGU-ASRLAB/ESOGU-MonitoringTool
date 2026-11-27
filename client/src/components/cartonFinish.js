import * as THREE from 'three';

// The red channel stores corrugation and paper fibre height. Green is tape
// coverage, blue is the shipping label. The rack finish samples all three.
export function createCartonAtlas() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = 4 * (y * size + x);
      const fibre = ((Math.imul(x + y * 97, 1597334677) >>> 13) & 255) / 255;
      data[i] = 132 + 32 * Math.cos(x * Math.PI / 4) + 13 * fibre;
      data[i + 1] = Math.abs(x - 128) < 15 ? 210 : 0;
      if (x > 29 && x < 99 && y > 161 && y < 196) {
        const barcode = y > 166 && y < 182 && x > 35 && x < 92 && (x * 47 % 19) < 9;
        const text = y > 184 && y < 194 && y % 4 === 1 && x < 77;
        data[i + 2] = barcode || text ? 60 : 225;
      }
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

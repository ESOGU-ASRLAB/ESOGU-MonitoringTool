import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { METAL } from './scenePalette';
import { useRealism } from './realismContext';

/*
 * Lab and project signage on the far (-z) end wall of the warehouse -- the
 * wall the opening camera looks at, behind the forest bus.
 *
 * Built as shop-front lightboxes: an anodised aluminium case with a lit face
 * inset in it. All three hang on cables from the roof, 0.8 m in front of the
 * wall: MATISSE in the middle bay, the two labs one row lower, each centred
 * over its roller shutter.
 *
 * Everything is placed against the wall's own structure, measured off
 * warehouse_blender.blend.glb (steel) and its wall texture (the shutters are
 * painted on, not modelled):
 *
 *   cladding         z = -24.57
 *   steel front face z = -24.40 -- posts and girts stand 17 cm proud, which
 *                    is why logos painted onto the cladding had girts drawn
 *                    across them
 *   posts            x = +/-2.97, +/-8.99
 *   girts            y = 2.41-2.61, 3.77-3.95 (shutter header), 4.68-4.89,
 *                    6.73-6.93
 *   shutters         x = +/-(3.21..8.69), y = 0..3.63
 *   roof             the arch below, as (|x|, y) -- the building is that
 *                    profile extruded along z, so it holds in front of the
 *                    wall too
 */
const ROOF_PROFILE = [[0, 10.07], [4.05, 9.88], [7.6, 9.4], [10.48, 8.83], [13.55, 8.0], [16.27, 6.98]];

function roofHeightAt(x) {
  const ax = Math.abs(x);
  for (let i = 1; i < ROOF_PROFILE.length; i += 1) {
    const [x1, y1] = ROOF_PROFILE[i];
    if (ax <= x1) {
      const [x0, y0] = ROOF_PROFILE[i - 1];
      return y0 + ((ax - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return ROOF_PROFILE[ROOF_PROFILE.length - 1][1];
}

const LOGO_BASE = process.env.PUBLIC_URL + '/assets/logo/';
const FONT = '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

const HANG_Z = -23.75; // clear of the girts, which stop at -24.40

// Squarer than a fascia now that the face is only roundel and name, so the
// roundel gets the height.
const LAB_SIGN = { width: 4.2, height: 1.3, depth: 0.2, cableInset: 0.4 };

/*
 * Sign faces in the building's own steel blue -- a deeper shade of the columns
 * and girts they hang against -- with white lettering and a white MATISSE
 * mark, the way corporate signage sits on a coloured board. It belongs to the
 * structure rather than standing off it: near-black navy read as three holes
 * cut in the wall, and off-white as three blanks on the cream cladding.
 */
const FACE_COLOR = '#0a4f86';
const SIGN_INK = '#ffffff';
const SIGN_ACCENT = '#5aa9e6';
const SIGN_DIVIDER = 'rgba(255, 255, 255, 0.55)';

// The -wall variants are 512 px: the roundel is painted ~440 px across on the
// 2048 px face, so the navbar's 58 px files would blur, and the original PNGs
// (1.9 MB for ASRLab) would be downloaded just to be scaled down.
const LABS = [
  // Centred under MATISSE, in the middle bay; the hall monitor moved to its old
  // place over the west shutter (HallMonitor.js).
  { x: 0, bottom: 5.25, logo: LOGO_BASE + 'asrlab-wall.webp', name: 'ASRLab', ink: SIGN_INK, accent: SIGN_ACCENT },
  // Under ASRLab and hung from it; the video walls took the shutter bays.
  { x: 0, bottom: 3.6, logo: LOGO_BASE + 'ifarlab-wall.webp', name: 'IFARLAB', ink: SIGN_INK, accent: SIGN_ACCENT },
];

// The headline sign, centred in the middle bay between the x = +/-2.97 posts.
const HEADLINE = {
  logo: LOGO_BASE + 'logo.svg',
  width: 4.6,
  height: 1.5,
  depth: 0.2,
  position: [0, 7.65, HANG_Z],
  cableInset: 0.4,
};

const CASE_LIP = 0.035; // aluminium showing round the lit face
const TEXTURE_WIDTH = 2048;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

/*
 * Paints a sign face at a fixed pixel width. `draw` lays out in metres and
 * converts with `px` itself, rather than drawing under a scaled context: canvas
 * text below 1px is measured and hinted unreliably, and the SVG wordmark is
 * rasterised at the size it is drawn at, so both go in at final resolution.
 */
function paintFace(widthM, heightM, draw) {
  const scale = TEXTURE_WIDTH / widthM;
  const px = (metres) => metres * scale;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = Math.round(px(heightM));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = FACE_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  draw(ctx, px, widthM, heightM);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/*
 * Roundel | divider | name, centred as one block above an accent band.
 *
 * The roundel sits on a white medallion. Straight on the navy face it all but
 * disappeared: ASRLab's outer ring is a dark teal and IFARLAB's an indigo, both
 * within a step of the face's value, so the logo's edge had nothing to stand
 * against. The medallion gives both their own ground and an edge in the
 * accent colour. Sizes are metres on the sign.
 */
function drawLabFace(lab, logo) {
  return (ctx, px, w, h) => {
    const band = 0.05;
    ctx.fillStyle = lab.accent;
    ctx.fillRect(0, px(h - band), px(w), px(band));

    const content = h - band;
    const medallion = 1.0;
    const ring = 0.012;
    const gap = 0.22;
    const divider = 0.012;
    const margin = 0.2;

    let size = 0.46;
    const setFont = () => { ctx.font = `700 ${px(size)}px ${FONT}`; };
    setFont();
    let nameWidth = ctx.measureText(lab.name).width / px(1);
    const room = w - margin * 2 - (medallion + gap * 2 + divider);
    if (nameWidth > room) {
      size *= room / nameWidth;
      nameWidth = room;
      setFont();
    }
    const left = (w - (medallion + gap * 2 + divider + nameWidth)) / 2;
    const centreX = left + medallion / 2;
    const centreY = content / 2;

    ctx.beginPath();
    ctx.arc(px(centreX), px(centreY), px(medallion / 2), 0, Math.PI * 2);
    ctx.fillStyle = lab.accent;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px(centreX), px(centreY), px(medallion / 2 - ring), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Fitted inside the medallion by its longer side, so neither source's
    // padding pushes the roundel over the white.
    const fit = (medallion - ring * 2 - 0.05) / Math.max(logo.width, logo.height);
    const logoW = logo.width * fit;
    const logoH = logo.height * fit;
    ctx.drawImage(logo, px(centreX - logoW / 2), px(centreY - logoH / 2), px(logoW), px(logoH));

    ctx.fillStyle = SIGN_DIVIDER;
    ctx.fillRect(px(left + medallion + gap), px(content * 0.22), px(divider), px(content * 0.56));

    ctx.fillStyle = lab.ink;
    ctx.textBaseline = 'alphabetic';
    const cap = size * 0.7;
    ctx.fillText(lab.name, px(left + medallion + gap * 2 + divider), px(centreY + cap / 2));
  };
}

function drawHeadlineFace(logo) {
  return (ctx, px, w, h) => {
    const band = 0.06;
    ctx.fillStyle = SIGN_ACCENT;
    ctx.fillRect(0, px(h - band), px(w), px(band));

    // The wordmark in white: its own two blues would sink into a blue board.
    const logoW = 3.2;
    const logoH = (logoW * logo.height) / logo.width;
    const mark = document.createElement('canvas');
    mark.width = Math.ceil(px(logoW));
    mark.height = Math.ceil(px(logoH));
    const markCtx = mark.getContext('2d');
    markCtx.drawImage(logo, 0, 0, mark.width, mark.height);
    markCtx.globalCompositeOperation = 'source-in';
    markCtx.fillStyle = '#ffffff';
    markCtx.fillRect(0, 0, mark.width, mark.height);
    ctx.drawImage(mark, px((w - logoW) / 2), px((h - band - logoH) / 2));
  };
}

function useSignFaces() {
  const [faces, setFaces] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let painted = null;
    const faceSize = (sign) => [sign.width - CASE_LIP * 2, sign.height - CASE_LIP * 2];

    Promise.all([HEADLINE.logo, ...LABS.map((lab) => lab.logo)].map(loadImage))
      .then(async ([headlineLogo, ...labLogos]) => {
        await document.fonts?.ready;
        if (cancelled) return;
        painted = {
          headline: paintFace(...faceSize(HEADLINE), drawHeadlineFace(headlineLogo)),
          labs: LABS.map((lab, i) => paintFace(...faceSize(LAB_SIGN), drawLabFace(lab, labLogos[i]))),
        };
        setFaces(painted);
      })
      .catch((error) => console.warn('Wall signage could not load its logos', error));

    return () => {
      cancelled = true;
      painted?.headline.dispose();
      painted?.labs.forEach((texture) => texture.dispose());
    };
  }, []);

  return faces;
}

function Lightbox({ position, width, height, depth, face }) {
  const realistic = useRealism();
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial {...(realistic
          ? { color: '#626d75', metalness: 0.66, roughness: 0.4 }
          : METAL.aluminium)} />
      </mesh>
      <mesh position={[0, 0, depth / 2 + 0.003]}>
        <planeGeometry args={[width - CASE_LIP * 2, height - CASE_LIP * 2]} />
        {/* Realistic: the face is backlit acrylic -- printed film you see by
            the hall's light, the backlight glowing through it, and a glossy
            skin the lamps streak across. */}
        {realistic
          ? <meshPhysicalMaterial map={face} emissive="#ffffff" emissiveMap={face} emissiveIntensity={0.6} metalness={0} roughness={0.3} clearcoat={1} clearcoatRoughness={0.05} />
          : <meshBasicMaterial map={face} toneMapped={false} />}
      </mesh>
    </group>
  );
}

// One suspension drop: a clamp on the case, the cable, and a plate on the roof
// -- or, with `top`, on the underside of the sign above.
function Hanger({ x, bottom, z, top: anchor }) {
  const top = anchor ?? roofHeightAt(x) - 0.01;
  const length = top - bottom;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, bottom + length / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, length, 8]} />
        <meshStandardMaterial {...METAL.galvanised} />
      </mesh>
      <mesh position={[0, bottom + 0.03, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.06, 12]} />
        <meshStandardMaterial {...METAL.galvanised} />
      </mesh>
      <mesh position={[0, top - 0.01, 0]}>
        <boxGeometry args={[0.14, 0.02, 0.14]} />
        <meshStandardMaterial {...METAL.galvanised} />
      </mesh>
    </group>
  );
}

// A lightbox with its two drops, inset from the case ends.
function HangingSign({ position, width, height, depth, cableInset, face, hangFrom }) {
  const [x, y, z] = position;
  const cableX = width / 2 - cableInset;
  return (
    <group>
      <Lightbox position={position} width={width} height={height} depth={depth} face={face} />
      {[-cableX, cableX].map((dx) => (
        <Hanger key={dx} x={x + dx} bottom={y + height / 2} z={z} top={hangFrom} />
      ))}
    </group>
  );
}

export default function WallLogos() {
  const faces = useSignFaces();
  if (!faces) return null;

  return (
    <group>
      <HangingSign {...HEADLINE} face={faces.headline} />
      {LABS.map((lab, i) => (
        <HangingSign
          key={lab.name}
          {...LAB_SIGN}
          position={[lab.x, lab.bottom + LAB_SIGN.height / 2, HANG_Z]}
          face={faces.labs[i]}
          // Each middle-bay sign hangs from the one above it -- MATISSE, then
          // ASRLab -- rather than running cables up through them to the roof.
          hangFrom={i === 0 ? HEADLINE.position[1] - HEADLINE.height / 2 : LABS[i - 1].bottom}
        />
      ))}
    </group>
  );
}

// Capture the Otokar cell from the bus-axis end, matching the customer's
// end-view composition: bus centred, one rail/column on each side, arms inward.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ROOT } from './scene_inspection.mjs';

const playwrightRoot = process.env.PLAYWRIGHT_INSTALL_ROOT || resolve(ROOT, 'client');
const require = createRequire(resolve(playwrightRoot, 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await page.goto(process.env.OTOKAR_URL || 'http://localhost:3003/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(25000);

const cameraResult = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const root = canvas?.__r3f?.root;
  const state = root?.store?.getState?.() || root?.getState?.();
  if (!state?.camera) return {
    ok: false,
    reason: 'R3F camera store unavailable',
    canvasKeys: canvas ? Object.keys(canvas) : [],
    r3fKeys: canvas?.__r3f ? Object.keys(canvas.__r3f) : [],
  };
  // Cell local +X becomes the world bus axis after CELL_ROTATION_Y; look down
  // world Z so the two parallel rails appear on the two sides of the bus.
  state.camera.position.set(-4.4, 3.2, 21.5);
  state.camera.fov = 48;
  state.camera.updateProjectionMatrix();
  state.camera.lookAt(-4.4, 2.15, -3.8);
  if (state.controls) {
    state.controls.enabled = false;
    state.controls.target.set(-4.4, 2.15, -3.8);
    state.controls.update();
  }
  return { ok: true, position: state.camera.position.toArray() };
});

if (!cameraResult.ok) {
  // Fallback for builds where R3F keeps its store private: use the public
  // OrbitControls pointer contract. The initial camera is already on the
  // bus-axis side; a short azimuth/elevation drag makes it end-on, then a
  // shift-drag pans the bus into the centre of the frame.
  await page.mouse.move(640, 430);
  await page.mouse.down();
  await page.mouse.move(715, 390, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.down('Shift');
  await page.mouse.move(505, 430);
  await page.mouse.down();
  await page.mouse.move(640, 430, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(1200);
}

const screenshot = resolve(ROOT, 'docs/inspection-cell-end-view.png');
await page.screenshot({ path: screenshot, fullPage: false, timeout: 120000 });
console.log(`Camera: ${JSON.stringify(cameraResult)}`);
console.log(`Screenshot: ${screenshot}`);
if (errors.length) console.log(`Page problems:\n  ${errors.join('\n  ')}`);
await browser.close();

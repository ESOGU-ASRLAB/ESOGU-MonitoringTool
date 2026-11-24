// Browser-only audit of the live Digital Twin scene.
// PLAYWRIGHT_INSTALL_ROOT can point to an isolated temporary installation.
//
//   PLAYWRIGHT_INSTALL_ROOT=... node scripts/otokar/capture_browser.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ROOT } from './scene_inspection.mjs';

const playwrightRoot = process.env.PLAYWRIGHT_INSTALL_ROOT || resolve(ROOT, 'client');
const require = createRequire(resolve(playwrightRoot, 'package.json'));
const { chromium } = require('playwright');
console.log('Launching Chrome for Otokar browser audit...');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  timeout: 15000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
console.log('Chrome launched; loading Digital Twin...');
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const meshes = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') errors.push(`console ${message.type()}: ${message.text()}`);
});
page.on('requestfailed', (request) => errors.push(`request failed: ${request.url()} ${request.failure()?.errorText}`));
page.on('response', (response) => {
  if (response.url().includes('/meshes/bus-inspection/')) meshes.push([response.status(), response.url()]);
  if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
});
await page.goto(process.env.OTOKAR_URL || 'http://localhost:3003/', { waitUntil: 'domcontentloaded', timeout: 15000 });
console.log('DOM loaded; waiting for assets...');
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  console.log(`After ${(i + 1) * 5}s: ${meshes.length} Otokar mesh responses, ${errors.length} errors`);
  if (meshes.some(([, url]) => url.includes('/bus/')) && meshes.some(([, url]) => url.includes('/axis5.glb'))) break;
}
const screenshot = resolve(ROOT, 'docs/inspection-cell-runtime-audit.png');
console.log(`Canvas: ${JSON.stringify(await page.locator('canvas').count())}`);
console.log(`Otokar mesh responses (${meshes.length}):`);
for (const [status, url] of meshes) console.log(`  ${status} ${url}`);
console.log(`Browser errors (${errors.length}):`);
for (const error of errors) console.log(`  ${error}`);
await page.screenshot({ path: screenshot, fullPage: false, timeout: 120000 });
console.log(`Screenshot: ${screenshot}`);
await browser.close();

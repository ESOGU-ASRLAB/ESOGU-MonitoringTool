// Render a JSON mesh from extract_part.py to a PNG: four orthographic views of
// one or more STEP sub-assemblies, in isolation, with a 1 m grid for scale.
//
//   PART_JSON=... PNG_OUT=... node scripts/otokar/render_part.mjs
//
// Serves partview.html + three.module.js + the JSON over loopback (ES modules
// cannot load over file://), then screenshots it with the system Chrome.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const jsonPath = resolve(process.env.PART_JSON);
const pngPath = resolve(process.env.PNG_OUT);

const playwrightRoot = process.env.PLAYWRIGHT_INSTALL_ROOT || resolve(ROOT, 'client');
const require = createRequire(resolve(playwrightRoot, 'package.json'));
const { chromium } = require('playwright');

const ROUTES = {
  '/': [resolve(HERE, 'partview.html'), 'text/html; charset=utf-8'],
  '/three.module.js': [resolve(ROOT, 'client/node_modules/three/build/three.module.js'),
    'text/javascript'],
  '/part.json': [jsonPath, 'application/json'],
};

const server = createServer((req, res) => {
  const route = ROUTES[req.url.split('?')[0]];
  if (!route) { res.writeHead(404).end('not found'); return; }
  try {
    const body = readFileSync(route[0]);
    res.writeHead(200, { 'content-type': route[1], 'content-length': body.length });
    res.end(body);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});

await new Promise((done) => server.listen(0, '127.0.0.1', done));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1260, height: 1010 } });
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
await page.screenshot({ path: pngPath, fullPage: true });

console.log(`Screenshot: ${pngPath}`);
if (problems.length) console.log('Page problems:\n  ' + problems.join('\n  '));

await browser.close();
server.close();

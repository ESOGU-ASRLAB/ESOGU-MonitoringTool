// Render the shipped Otokar GLBs from the bus-axis end. This deliberately
// uses the same baked CAD frame and runtime link hierarchy as the React cell,
// but a fixed camera makes the customer end-view check reproducible.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './scene_inspection.mjs';

const require = createRequire(resolve(ROOT, 'client/package.json'));
const { chromium } = require(process.env.PLAYWRIGHT_INSTALL_ROOT
  ? resolve(process.env.PLAYWRIGHT_INSTALL_ROOT, 'node_modules/playwright')
  : 'playwright');
const three = resolve(ROOT, 'client/node_modules/three/build/three.module.js');
const loader = resolve(ROOT, 'client/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const dracoLoader = resolve(ROOT, 'client/node_modules/three/examples/jsm/loaders/DRACOLoader.js');
const dracoRoot = resolve(ROOT, 'client/node_modules/three/examples/jsm/libs/draco/gltf');
const bufferUtils = resolve(ROOT, 'client/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js');
const meshRoot = resolve(ROOT, 'client/public/meshes/otokar');

const html = `<!doctype html><html><body style="margin:0;background:#d9dde0"><script type="importmap">{"imports":{"three":"/three.module.js"}}</script><script type="module">
import * as THREE from '/three.module.js';
import { GLTFLoader } from '/GLTFLoader.js';
import { DRACOLoader } from '/DRACOLoader.js';
const MM=0.001, scene=new THREE.Scene(); scene.background=new THREE.Color('#d9dde0');
scene.add(new THREE.HemisphereLight('#ffffff','#77808a',1.25));
const key=new THREE.DirectionalLight('#ffffff',2.0); key.position.set(8,12,10); scene.add(key);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#cfd3d5',roughness:.82})); floor.rotation.x=-Math.PI/2; scene.add(floor);
const cell=new THREE.Group(); cell.position.set(-3.92,1.368,-5.88); cell.rotation.y=Math.PI/2; scene.add(cell);
const colors={axis1:0x34383a,carriage:0x34383a,axis2:0x4b8933,axis3:0xab36b9,axis4:0x562a28,axis5:0x2a29f4,camera:0x69c1c3,bus:0xdad3bf};
const draco=new DRACOLoader(); draco.setDecoderPath('/draco/');
const loader=new GLTFLoader(); loader.setDRACOLoader(draco); const pending=[];
function add(parent,url,color){pending.push(new Promise((resolve,reject)=>loader.load(url,g=>{g.scene.traverse(o=>{if(o.isMesh){o.geometry.computeVertexNormals();o.material=new THREE.MeshStandardMaterial({color,metalness:.2,roughness:.55});}});parent.add(g.scene);resolve();},undefined,reject)));}
const r1P={a4:[-12578.384,2258.092,-585.3],a5:[-12641.184,2258.092,-755],cam:[-12641.184,2258.092,-886]};
const r2P={a4:[-12578.384,-2532.6144,-585.3],a5:[-12641.184,-2532.6144,-755],cam:[-12641.184,-2532.6144,-886]};
function robot(id,p){
 const root=new THREE.Group(); root.rotation.x=-Math.PI/2; cell.add(root);
 const a1=new THREE.Group(); root.add(a1);
 const a2=new THREE.Group(); a2.position.z=(id==='robot1'?.6:3.35); a1.add(a2);
 const a3=new THREE.Group(); a3.position.y=(id==='robot1'?-1:1)*1.8; a2.add(a3);
 const chain=new THREE.Group(); chain.position.set(0,id==='robot2'?-.583:.583,0); a3.add(chain);
 const p4=new THREE.Group(); p4.position.fromArray(p.a4.map(v=>v*MM)); chain.add(p4);
 const a4=new THREE.Group(); p4.add(a4); const p4o=new THREE.Group(); p4o.position.fromArray(p.a4.map(v=>-v*MM)); a4.add(p4o);
 const p5=new THREE.Group(); p5.position.fromArray(p.a5.map(v=>v*MM)); p4o.add(p5);
 const a5=new THREE.Group(); p5.add(a5); const p5o=new THREE.Group(); p5o.position.fromArray(p.a5.map(v=>-v*MM)); a5.add(p5o);
 const cam=new THREE.Group(); cam.position.fromArray(p.cam.map(v=>v*MM)); cam.rotation.z=id==='robot2'?Math.PI:0; p5o.add(cam);
 const base='/meshes/otokar/'+id+'/hi/';
 add(root,base+'axis1.glb',colors.axis1); add(a1,base+'axis1_carriage.glb',colors.carriage); add(a2,base+'axis2.glb',colors.axis2); add(a3,base+'axis3.glb',colors.axis3); add(chain,base+'axis4.glb',colors.axis4); add(p4o,base+'axis5.glb',colors.axis5); add(cam,'/meshes/otokar/shared/hi/camera.glb',colors.camera);
}
robot('robot1',r1P); robot('robot2',r2P);
const busRoot=new THREE.Group(); busRoot.rotation.x=-Math.PI/2; busRoot.position.set((-12724.986+1160.4634+9556)*MM,(2757.4-1643.6612-1251)*MM,(-1368+1646.2384-172)*MM); cell.add(busRoot); add(busRoot,'/meshes/otokar/bus/hi/body.glb',colors.bus);
const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(1); renderer.setSize(1280,900); document.body.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(48,1280/900,.05,100); camera.position.set(-3.78,3.4,21.5); camera.lookAt(-3.78,2.2,-3.8);
await Promise.all(pending); renderer.render(scene,camera); window.__ready=true;
</script></body></html>`;

const server=createServer((req,res)=>{
  try {
    if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'});return res.end(html);}
    if(req.url==='/three.module.js'){const b=readFileSync(three);res.writeHead(200,{'content-type':'text/javascript'});return res.end(b);}
    if(req.url==='/GLTFLoader.js'){const b=readFileSync(loader,'utf8').replaceAll("from 'three'","from '/three.module.js'");res.writeHead(200,{'content-type':'text/javascript'});return res.end(b);}
    if(req.url==='/DRACOLoader.js'){const b=readFileSync(dracoLoader,'utf8').replaceAll("from 'three'","from '/three.module.js'");res.writeHead(200,{'content-type':'text/javascript'});return res.end(b);}
    if(req.url==='/utils/BufferGeometryUtils.js'){const b=readFileSync(bufferUtils,'utf8').replaceAll("from 'three'","from '/three.module.js'");res.writeHead(200,{'content-type':'text/javascript'});return res.end(b);}
    if(req.url.startsWith('/draco/')){const b=readFileSync(resolve(dracoRoot,req.url.slice('/draco/'.length)));res.writeHead(200,{'content-type':req.url.endsWith('.wasm')?'application/wasm':'text/javascript'});return res.end(b);}
    if(req.url.startsWith('/meshes/otokar/')){const b=readFileSync(resolve(ROOT,'client/public',req.url.slice(1)));res.writeHead(200,{'content-type':'model/gltf-binary'});return res.end(b);}
    res.writeHead(404).end();
  } catch(e){res.writeHead(500).end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:900}}); const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'load',timeout:30000});
try { await page.waitForFunction('window.__ready===true',null,{timeout:30000}); }
catch(e) { console.log(`Page problems:\n  ${errors.join('\n  ')}`); throw e; }
const out=resolve(ROOT,'docs/otokar-end-view.png'); await page.screenshot({path:out}); console.log(`Screenshot: ${out}`); if(errors.length)console.log(`Page problems:\n  ${errors.join('\n  ')}`); await browser.close(); server.close();

// Render the real robot JSX transforms, shipped GLBs and current materials.
// A before/after image uses the same geometry, pose, camera and lighting.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import {createInspector,ROOT} from './scene_inspection.mjs';

const descriptors=[];
const inspector=createInspector({'./OtokarMesh': props=>{
  const index=descriptors.push({url:`/meshes/bus-inspection/${props.group}/${props.lod}/${props.part}.glb`,part:props.part,material:props.material})-1;
  return {type:'group',props:{name:`asset-${index}`}};
}});
const root=new THREE.Group();
inspector.mount(inspector.element(inspector.load('OtokarGantryRobot').default,{
  robotId:'robot1',meshGroup:'robot1',axes:[7000,1800,1100,0,0],lod:'hi',showRails:true,
}),root);
inspector.frames.forEach(fn=>fn({},0));root.updateMatrixWorld(true);
descriptors.forEach((d,i)=>{d.matrix=root.getObjectByName(`asset-${i}`).matrixWorld.toArray();});
const snapshot=resolve(ROOT,'.tmp/otokar-finish-before.json');
mkdirSync(resolve(ROOT,'.tmp'),{recursive:true});
if(process.argv.includes('--snapshot')){
  writeFileSync(snapshot,JSON.stringify(descriptors));
  console.log('Saved baseline materials and actual JSX transforms.');
  process.exit(0);
}
const data={before:JSON.parse(readFileSync(snapshot)),after:descriptors};
const html=`<!doctype html><html><meta charset="utf-8"><style>
body{margin:0;background:#e6e9eb;font:14px Arial;color:#25313a}header{display:flex;height:72px;align-items:center}header div{width:50%;padding-left:36px;box-sizing:border-box}small{display:block;color:#697780;margin-top:8px}canvas{display:block}
</style><header><div>ÖNCE<small>Önceki renk ve yüzey ayarları</small></div><div>ANTRASİT / TURUNCU / METAL<small>Aynı model, poz, kamera ve ışık</small></div></header>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js"}}</script><script type="module">
import * as THREE from 'three';
import {GLTFLoader} from '/three/examples/jsm/loaders/GLTFLoader.js';
import {DRACOLoader} from '/three/examples/jsm/loaders/DRACOLoader.js';
import {RoomEnvironment} from '/three/examples/jsm/environments/RoomEnvironment.js';
const data=await(await fetch('/data')).json();
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1600,828);renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e6e9eb');
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.95;
scene.add(new THREE.AmbientLight('#f4f7fa',.22));
const key=new THREE.DirectionalLight('#fff6e8',.85);key.position.set(0,10,1);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-15,right:15,top:15,bottom:-15,far:35});key.shadow.bias=-.0003;scene.add(key);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#cbd0d3',roughness:.85}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.368;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(40,40,'#b0b9be','#c0c7cb');grid.position.y=-1.367;scene.add(grid);
const draco=new DRACOLoader().setDecoderPath('/draco/');const loader=new GLTFLoader().setDRACOLoader(draco);
const robot=new THREE.Group();scene.add(robot);const items=[];
await Promise.all(data.after.map(async d=>{
 const gltf=await loader.loadAsync(d.url);const group=new THREE.Group();group.matrix.fromArray(d.matrix);group.matrixAutoUpdate=false;group.add(gltf.scene);robot.add(group);
 gltf.scene.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;m.material=new THREE.MeshStandardMaterial({...d.material,flatShading:true});}});items.push({group,d});
}));
scene.updateMatrixWorld(true);
const box=new THREE.Box3();for(const item of items)if(!['axis1','axis1_chain'].includes(item.d.part))box.union(new THREE.Box3().setFromObject(item.group));
const center=box.getCenter(new THREE.Vector3());const size=box.getSize(new THREE.Vector3());
const half=Math.max(size.y*.63,size.z*.58,2.85);const camera=new THREE.OrthographicCamera(-half*800/828,half*800/828,half,-half,.01,100);
camera.position.copy(center).add(new THREE.Vector3(-8,4,9));camera.lookAt(center);
renderer.setScissorTest(true);
for(let i=0;i<2;i++){
 const variant=i?data.after:data.before;
 for(const item of items){const d=variant.find(v=>v.part===item.d.part);item.group.traverse(m=>{if(m.isMesh){m.material.color.set(d.material.color);m.material.metalness=d.material.metalness;m.material.roughness=d.material.roughness;}});}
 renderer.setViewport(i*800,0,800,828);renderer.setScissor(i*800,0,800,828);renderer.render(scene,camera);
}
window.__ready=true;
</script></html>`;
const server=createServer((req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost').pathname;
    if(url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
    if(url==='/data'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));}
    let base,relative;
    if(url.startsWith('/three/')){base=resolve(ROOT,'client/node_modules/three');relative=url.slice(7);}
    else {base=resolve(ROOT,'client/public');relative=url.slice(1);}
    const file=resolve(base,relative);if(!file.startsWith(base+sep)){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(readFileSync(file));
  }catch(e){res.writeHead(404).end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  const require=createRequire(resolve(process.env.PLAYWRIGHT_INSTALL_ROOT||resolve(ROOT,'client'),'package.json'));
  const {chromium}=require('playwright');
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'load'});
  await page.waitForFunction('window.__ready===true',null,{timeout:60000});
  const out=resolve(ROOT,'docs/inspection-cell-finishes-comparison.png');await page.screenshot({path:out});console.log(out);
  if(errors.length)throw new Error(errors.join('\n'));
}finally{if(browser)await browser.close();server.close();}

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
const cli=process.env.GLTF_CLI;
if(!cli) throw new Error('Set GLTF_CLI to the locally installed gltf-transform CLI');
mkdirSync('.tmp/stages',{recursive:true});
for(const robot of ['robot1','robot2']) for(const lod of ['hi','lo']) for(const part of ['axis3_fixed','axis3_middle','axis3_outer']) {
  const file=resolve('client/public/meshes/bus-inspection',robot,lod,part+'.glb');
  const tmp=resolve('.tmp/stages',robot+'-'+lod+'-'+part);
  for(const args of [['weld',file,tmp+'.w.glb'],['simplify',tmp+'.w.glb',tmp+'.s.glb','--ratio',lod==='hi'?'.4':'.12','--error',lod==='hi'?'.002':'.012'],['draco',tmp+'.s.glb',file]])
    execFileSync(process.execPath,[cli,...args],{stdio:'pipe'});
  console.log('Optimized',robot,lod,part);
}

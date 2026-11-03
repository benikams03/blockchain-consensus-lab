import {spawnSync,spawn} from 'node:child_process';
const r=spawnSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);
const child=spawn(process.execPath,['build/server/index.js'],{stdio:'inherit'});
process.on('SIGINT',()=>child.kill('SIGINT'));

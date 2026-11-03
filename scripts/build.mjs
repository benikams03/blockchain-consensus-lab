import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const typecheck=spawnSync(process.execPath,['node_modules/typescript/bin/tsc'],{stdio:'inherit'});
if(typecheck.status!==0)process.exit(typecheck.status??1);
await mkdir('dist',{recursive:true});
const fingerprint=createHash('sha256');
async function inputs(dir){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=dir+'/'+entry.name;if(entry.isDirectory())await inputs(path);else{fingerprint.update(path);fingerprint.update(await readFile(path));}}}
await inputs('src');fingerprint.update(await readFile('deployment/sepolia.json'));fingerprint.update(await readFile('package-lock.json'));fingerprint.update(await readFile('scripts/build.mjs'));
const buildId=fingerprint.digest('hex').slice(0,16), define={__ATELIER_BUILD__:JSON.stringify(buildId)};
await Promise.all([
  build({entryPoints:['src/web/main.tsx'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/app.js',sourcemap:true,minify:true,define}),
  build({entryPoints:['src/web/worker.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/worker.js',sourcemap:true,minify:true}),
  build({entryPoints:['src/web/advanced-worker.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/advanced-worker.js',sourcemap:true,minify:true})
]);
for(const name of ['styles.css','designs.html'])await copyFile('src/web/'+name,'dist/'+name);
await writeFile('dist/index.html',(await readFile('src/web/index.html','utf8')).replace('src="/app.js"',`src="/app.js?v=${buildId}"`).replace('href="/styles.css"',`href="/styles.css?v=${buildId}"`));
console.log('Build prêt : dist/ (interface) et build/server/index.js (API + WebSocket).');

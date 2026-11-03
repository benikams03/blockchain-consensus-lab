import {spawnSync} from 'node:child_process';
const check=spawnSync(process.execPath,['node_modules/typescript/bin/tsc'],{stdio:'inherit'});
if(check.status!==0)process.exit(check.status??1);
const result=spawnSync(process.execPath,['--test','build/tests/core.test.js','build/tests/protocols.test.js','build/tests/server.test.js','build/tests/experience.test.js','build/tests/advanced.test.js','build/tests/fusion.test.js','build/tests/roles.test.js'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
// Real-time process tests run separately so CPU-bound virtual simulations do not starve their timers.
const distributed=spawnSync(process.execPath,['--test','build/tests/distributed.test.js'],{stdio:'inherit'});
process.exit(distributed.status??1);

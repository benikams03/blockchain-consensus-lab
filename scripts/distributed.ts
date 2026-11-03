import { writeFile, mkdir } from 'node:fs/promises';
import { DistributedNetwork } from '../server/distributed/network.js';
import type { DistributedConfig } from '../server/distributed/types.js';
const args = process.argv.slice(2), input: Partial<DistributedConfig> = {};
for (let i = 0; i < args.length; i += 2) {
  const flag = args[i], value = args[i + 1];
  if (!value) throw new Error('Valeur manquante : ' + flag);
  if (flag === '--fault') input.fault = value as DistributedConfig['fault'];
  else if (flag === '--duration') input.duration = Number(value);
  else if (flag === '--nodes') input.nodes = Number(value) as 4 | 7;
  else throw new Error('Option inconnue : ' + flag);
}
const network = new DistributedNetwork(input);
try {
  console.log('Démarrage de processus PBFT indépendants avec récepteurs HTTP locaux…');
  await network.start();
  const timer = setInterval(() => { const s = network.snapshot(); console.log(`${Math.round(s.elapsed / 1000)} s : ${s.nodes.map(n => `${n.id}[PID ${n.pid}] h=${n.height} v=${n.view}`).join(' · ')}`); }, 2000);
  await new Promise<void>(resolve => { const poll = setInterval(() => { if (network.finished) { clearInterval(poll); resolve(); } }, 200); }); clearInterval(timer);
  await mkdir('artifacts', { recursive: true }); await writeFile('artifacts/distributed-report.json', JSON.stringify(network.snapshot(), null, 2)); console.log('Rapport : artifacts/distributed-report.json');
} finally { await network.close(); }

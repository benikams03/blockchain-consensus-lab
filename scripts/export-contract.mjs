import { readFile, writeFile, mkdir } from 'node:fs/promises';
const artifact = JSON.parse(await readFile('smart-contracts/artifacts/smart-contracts/contracts/ResultsRegistry.sol/ResultsRegistry.json', 'utf8'));
await mkdir('src/web/features', { recursive: true });
await writeFile('src/web/features/registry-artifact.json', JSON.stringify({ abi: artifact.abi, bytecode: artifact.bytecode, compiler: '0.8.28', optimizerRuns: 200, evmVersion: 'paris', registryId: 'UNIKIN_CONSENSUS_RESULTS_V2' }, null, 2));
await mkdir('deployment', { recursive: true });
await writeFile('deployment/verification-input.json', JSON.stringify({ language: 'Solidity', sources: { 'smart-contracts/contracts/ResultsRegistry.sol': { content: await readFile('smart-contracts/contracts/ResultsRegistry.sol', 'utf8') } }, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'] } } } }, null, 2));
console.log('ABI, bytecode et entrée de vérification exportés. Aucun contrat public déployé par cette commande.');

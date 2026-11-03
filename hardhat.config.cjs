// Hardhat local uniquement : aucun réseau public ni clé privée n'est configuré.
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, hre, runSuper) => {
  if (solcVersion === '0.8.28') return { compilerPath: require.resolve('solc/soljson.js'), isSolcJs: true,
    version: solcVersion, longVersion: require('solc').version() };
  return runSuper();
});
module.exports = {
  solidity: { version: '0.8.28', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris' } },
  paths: { sources: './smart-contracts/contracts', tests: './smart-contracts/test', cache: './.local/hardhat-cache', artifacts: './smart-contracts/artifacts' },
  networks: { hardhat: { chainId: 31337 } }, mocha: { timeout: 30000 }
};

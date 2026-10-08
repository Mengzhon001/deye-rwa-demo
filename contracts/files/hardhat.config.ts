import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({solcVersion}) => {
  const compiler = require("solc");
  if (!compiler.version().startsWith(solcVersion + "+")) throw new Error("Compiler version mismatch");
  return { compilerPath: require.resolve("solc/soljson.js"), isSolcJs:true, version:solcVersion, longVersion:compiler.version() };
});
const config: HardhatUserConfig = {
  solidity: { version:"0.8.26", settings: {evmVersion:"cancun", optimizer:{enabled:true,runs:200}} },
  networks: {hardhat:{chainId:31337},local:{url:process.env.LOCAL_RPC_URL || "http://127.0.0.1:18545",chainId:20260922,accounts:process.env.DEPLOYER_PRIVATE_KEY?[process.env.DEPLOYER_PRIVATE_KEY]:[]}}
};
export default config;

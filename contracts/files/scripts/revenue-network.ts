/** Explicit network policy shared by deployment and application code. */
export const BASE_SEPOLIA = 84532;
export const CIRCLE_BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
];
export function publicTestnet(chainId = Number(process.env.REVENUE_CHAIN_ID)) {
  return chainId === BASE_SEPOLIA;
}
export function assertPublicConfiguration(chainId: number) {
  if (!publicTestnet(chainId)) return;
  if (process.env.REVENUE_WALLET_REQUIRED !== "true") throw new Error("Base Sepolia requires wallet signatures");
  if (process.env.REVENUE_EXTERNAL_USDC?.toLowerCase() !== CIRCLE_BASE_SEPOLIA_USDC.toLowerCase())
    throw new Error("Base Sepolia requires the official Circle test USDC address");
  if (!process.env.REVENUE_SYSTEM_MNEMONIC || process.env.REVENUE_SYSTEM_MNEMONIC === "test test test test test test test test test test test junk")
    throw new Error("Base Sepolia requires explicitly configured system accounts");
  if (process.env.REVENUE_MONITOR_LIVE === "true" || process.env.REVENUE_AUTO_SYNC_STATION_ID)
    throw new Error("This isolated Base Sepolia test uses explicitly recorded evidence");
}
export function assertLocalCapability(capability: string, chainId = Number(process.env.REVENUE_CHAIN_ID)) {
  if (publicTestnet(chainId)) throw new Error(`${capability} is disabled on Base Sepolia. Public-chain time and Circle test USDC cannot be changed by this application. / 公链不支持演示重置、时间推进或代币增发。`);
}

import { CronCapability, HTTPClient, EVMClient, handler, Runner, consensusIdenticalAggregation, getNetwork, hexToBase64, bytesToHex, type Runtime } from '@chainlink/cre-sdk';
import { decodeFunctionResult, erc20Abi } from 'viem';
import { z } from 'zod';
import { CHAIN_ID, CIRCLE_USDC, verifyMonthly } from './bill';

const ConfigSchema = z.object({
  mode: z.literal('local-shadow'), schedule: z.string().min(1),
  sourceUrl: z.string().regex(/^http:\/\/127\.0\.0\.1:\d+\/month$/),
  expectedInputDigest: z.string().regex(/^0x[0-9a-f]{64}$/),
}).strict();
export type Config = z.infer<typeof ConfigSchema>;

export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const config = ConfigSchema.parse(runtime.config);
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: 'ethereum-testnet-sepolia-base-1', isTestnet: true });
  if (!network || Number(network.chainId) !== CHAIN_ID) throw Error('Unexpected chain selector');
  const chain = new EVMClient(network.chainSelector.selector);
  const token = chain.callContract(runtime, { call: { to: hexToBase64(CIRCLE_USDC), data: hexToBase64('0x313ce567') } }).result();
  if (decodeFunctionResult({ abi: erc20Abi, functionName: 'decimals', data: bytesToHex(token.data) }) !== 6) throw Error('Circle USDC decimals mismatch');
  const normalized = new HTTPClient().sendRequest(runtime, (sendRequester) => {
    const response = sendRequester.sendRequest({ url: config.sourceUrl, method: 'GET' }).result();
    if (response.statusCode !== 200) throw Error('Monthly source request failed');
    if (response.body.length > 65536) throw Error('Monthly source is too large');
    const raw = JSON.parse(new TextDecoder().decode(response.body));
    return JSON.stringify(verifyMonthly(raw, config.expectedInputDigest));
  }, consensusIdenticalAggregation<string>())().result();
  runtime.log('DEYE_ORACLE_RESULT=' + normalized);
  return normalized;
};
export const initWorkflow = (config: Config) => {
  ConfigSchema.parse(config);
  return [handler(new CronCapability().trigger({ schedule: config.schedule }), onCronTrigger)];
};
export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

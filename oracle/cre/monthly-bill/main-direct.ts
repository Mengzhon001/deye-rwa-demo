import { CronCapability, HTTPClient, EVMClient, Runner, handler, consensusIdenticalAggregation, getNetwork, hexToBase64, bytesToHex, type Runtime } from '@chainlink/cre-sdk';
import { decodeFunctionResult, erc20Abi, stringToHex } from 'viem';
import { CIRCLE_USDC } from './bill';
import { AuthSchema, DEYE_HOSTS, validateDirectConfig, normalizeDirect, joinDailyWindows, type DirectConfig, type ReadPath } from './deye-direct';

function onDirectTrigger(runtime: Runtime<DirectConfig>): string {
  const now = Math.floor(runtime.now().getTime() / 1000);
  const c = validateDirectConfig(runtime.config, now);
  let auth: ReturnType<typeof AuthSchema.parse>;
  try { auth = AuthSchema.parse(JSON.parse(runtime.getSecret({ id: 'DEYE_READONLY_AUTH' }).result().value)); }
  catch { throw Error('Deye read-only authentication secret is missing or invalid'); }
  const network = getNetwork({ chainFamily: 'evm', chainSelectorName: 'ethereum-testnet-sepolia-base-1', isTestnet: true });
  if (!network || Number(network.chainId) !== 84532) throw Error('Unexpected chain selector');
  const reply = new EVMClient(network.chainSelector.selector).callContract(runtime, { call: { to: hexToBase64(CIRCLE_USDC), data: hexToBase64('0x313ce567') } }).result();
  if (decodeFunctionResult({ abi: erc20Abi, functionName: 'decimals', data: bytesToHex(reply.data) }) !== 6) throw Error('Circle USDC decimals mismatch');
  const result = new HTTPClient().sendRequest(runtime, requester => {
    function post(path: string, body: unknown, token?: string): any {
      const stage = path.startsWith('/v1.0/account/token') ? 'authentication' : path === '/v1.0/station/detail' ? 'station detail' : 'station history';
      let status = 0, accepted = false;
      try {
        const response = requester.sendRequest({
          url: DEYE_HOSTS[c.region] + path, method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: hexToBase64(stringToHex(JSON.stringify(body))),
        }).result();
        status = response.statusCode;
        if (response.statusCode !== 200 || response.body.length > 200000) throw Error('request');
        const value = JSON.parse(new TextDecoder().decode(response.body));
        accepted = value?.success === true;
        if (value?.success !== true) throw Error('response');
        return value;
      } catch { throw Error(`Deye ${stage} request failed (HTTP ${status}, accepted ${accepted}); verify authorization and source availability`); }
    }
    const token = post(`/v1.0/account/token?appId=${encodeURIComponent(auth.appId)}`, {
      appSecret: auth.appSecret, email: auth.email, password: auth.passwordSha256,
      ...(auth.companyId ? { companyId: auth.companyId } : {}),
    });
    if (typeof token.accessToken !== 'string' || !token.accessToken) throw Error('Deye token response is invalid');
    function read(path: ReadPath, body: unknown) {
      if (!['/station/detail', '/station/history'].includes(path)) throw Error('Read-only endpoint required');
      return post('/v1.0' + path, body, token.accessToken);
    }
    const id = Number(c.stationId), [year, month] = c.observationMonth.split('-').map(Number);
    const detail = read('/station/detail', { stationId: id });
    const monthly = read('/station/history', { stationId: id, granularity: 3, startAt: c.observationMonth, endAt: c.observationMonth });
    // Deye rejects a 31-day inclusive window. Read bounded half-month windows.
    const daily = joinDailyWindows([
      read('/station/history', { stationId: id, granularity: 2, startAt: c.observationMonth + '-01', endAt: c.observationMonth + '-16' }),
      read('/station/history', { stationId: id, granularity: 2, startAt: c.observationMonth + '-16', endAt: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10) }),
    ]);
    return JSON.stringify(normalizeDirect(c, detail, monthly, daily, now));
  }, consensusIdenticalAggregation<string>())().result();
  runtime.log('DEYE_ORACLE_DIRECT_INPUT_DIGEST=' + JSON.parse(result).inputDigest);
  return result;
}
function initWorkflow(config: DirectConfig) {
  return [handler(new CronCapability().trigger({ schedule: config.schedule }), onDirectTrigger)];
}
export async function main() { await (await Runner.newRunner<DirectConfig>()).run(initWorkflow); }

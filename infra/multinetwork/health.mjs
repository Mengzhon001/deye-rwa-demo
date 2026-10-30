export async function checkUnifiedEntry(app, request = fetch) {
  if (!app) return { healthy: false, reason: 'No public application configured' };
  try {
    const response = await request(app + '/networks.json', {
      signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const data = await response.json();
    if (data.version !== 1 || data.networks?.length !== 2 ||
        !data.networks.some(n => n.id === 'private' && n.chainId === 20261008) ||
        !data.networks.some(n => n.id === 'base-sepolia' && n.chainId === 84532)) {
      throw Error('Public network descriptor mismatch');
    }
    return { healthy: true };
  } catch (error) {
    return { healthy: false, reason: error.cause?.code || error.message };
  }
}

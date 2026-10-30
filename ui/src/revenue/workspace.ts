import type { RevenueRuntime } from './runtime';
import type { RevenueCatalog } from './catalog';
import type { Actor } from './store';

/** Small authenticated reads. Never pass repository objects or transaction payloads through. */
export function workspaceMetadata(runtime: RevenueRuntime, catalog: RevenueCatalog) {
  const s = runtime.repo.read(), entry = catalog.entry(runtime);
  return {
    chainId: s.manifest!.chainId, vault: s.manifest!.addresses.vault, readAt: Date.now(),
    product: { title: entry.title, kind: entry.kind, archived: !!entry.archived },
    mode: s.mode,
    stations: s.stations.map(station => ({ id: station.id, name: station.name, source: station.source, observedAt: station.observedAt })),
  };
}

export async function workspaceBalances(runtime: RevenueRuntime, actor: Actor) {
  const s = runtime.repo.read(), address = runtime.address(actor), provider = runtime.usdc.runner?.provider;
  if (!provider) throw Error('Balance provider unavailable');
  const [usdc, native] = await Promise.all([runtime.usdc.balanceOf(address), provider.getBalance(address)]);
  return {
    chainId: s.manifest!.chainId, vault: s.manifest!.addresses.vault, address,
    token: s.manifest!.addresses.usdc, usdc: String(usdc), nativeBalanceWei: String(native), readAt: Date.now(),
  };
}

export function workspaceRecords(runtime: RevenueRuntime) {
  const s = runtime.repo.read();
  return {
    chainId: s.manifest!.chainId, vault: s.manifest!.addresses.vault, readAt: Date.now(),
    records: s.operations.slice(-15).reverse().map(operation => ({
      id: operation.id, actor: operation.actor, action: operation.action, status: operation.status,
      hashes: [...new Set(Object.values(operation.steps).map(step => step.hash).filter(Boolean))],
    })),
  };
}

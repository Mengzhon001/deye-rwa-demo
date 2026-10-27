#!/usr/bin/env node
import { existsSync, readFileSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { HDNodeWallet } from 'ethers';
const root = resolve(import.meta.dirname, '..');
const file = join(root, '.env.web3.local');
if (!existsSync(file)) throw Error('Run npm run web3:init first.');
const match = readFileSync(file, 'utf8').match(/^ANVIL_MNEMONIC=(.+)$/m);
if (!match) throw Error('Local test mnemonic is missing.');
const indexes = { owner: 5, agent: 1, investor: 6, investor2: 7, trustee: 2, trustee2: 3 };
const wallets = Object.fromEntries(Object.entries(indexes).map(([role, index]) => {
  const wallet = HDNodeWallet.fromPhrase(match[1].trim(), undefined, `m/44'/60'/0'/0/${index}`);
  return [role, { address: wallet.address, privateKey: wallet.privateKey }];
}));
const dir = join(root, '.data/local-wallets');
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
const destination = join(dir, 'wallet-import.private.json');
writeFileSync(destination, JSON.stringify(wallets, null, 2) + '\n', { mode: 0o600 });
chmodSync(destination, 0o600);
console.log('Local-only wallet import file: .data/local-wallets/wallet-import.private.json');
console.table(Object.entries(wallets).map(([role, wallet]) => ({ role, address: wallet.address })));

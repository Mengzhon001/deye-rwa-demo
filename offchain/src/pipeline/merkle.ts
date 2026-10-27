import { concat, getBytes, keccak256 } from "ethers";

function sortPair(a: `0x${string}`, b: `0x${string}`): [`0x${string}`, `0x${string}`] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

function hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
  const [left, right] = sortPair(a, b);
  return keccak256(concat([getBytes(left), getBytes(right)])) as `0x${string}`;
}

export function buildMerkleRoot(leaves: `0x${string}`[]): `0x${string}` {
  if (leaves.length === 0) {
    throw new Error("cannot build merkle root from empty leaves");
  }

  let level = [...leaves];
  while (level.length > 1) {
    const nextLevel: `0x${string}`[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      nextLevel.push(hashPair(left, right));
    }
    level = nextLevel;
  }

  return level[0];
}

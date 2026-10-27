import { AbiCoder, encodeBytes32String, keccak256, toUtf8Bytes } from "ethers";

const abi = AbiCoder.defaultAbiCoder();

export function schemaVersionHash(version: string): `0x${string}` {
  return keccak256(toUtf8Bytes(version)) as `0x${string}`;
}

export function evidenceHash(payload: unknown): `0x${string}` {
  const encoded = JSON.stringify(payload);
  return keccak256(toUtf8Bytes(encoded)) as `0x${string}`;
}

export function entitlementLeaf(
  periodId: string,
  beneficiary: string,
  amountUSDC6: string
): `0x${string}` {
  const periodBytes32 = encodeBytes32String(periodId);
  const amount = BigInt(amountUSDC6);
  return keccak256(
    abi.encode(["bytes32", "address", "uint256"], [periodBytes32, beneficiary, amount])
  ) as `0x${string}`;
}

export function facilityDistributionLeaf(
  periodId: string,
  facilityId: string,
  amountUSDC6: string
): `0x${string}` {
  const periodBytes32 = encodeBytes32String(periodId);
  const amount = BigInt(amountUSDC6);
  return keccak256(
    abi.encode(["bytes32", "bytes32", "uint256"], [periodBytes32, facilityId, amount])
  ) as `0x${string}`;
}

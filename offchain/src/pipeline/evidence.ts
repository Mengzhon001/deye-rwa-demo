import {
  AssetStatusSnapshot,
  EntitlementRecord,
  PeriodEvidence,
  PeriodEvidenceSchema
} from "../types/schemas";
import { buildMerkleRoot } from "./merkle";
import { evidenceHash, entitlementLeaf, schemaVersionHash } from "../utils/hash";
import type { NormalizedDataset } from "./ingest";

export type EvidenceOutput = {
  periodEvidence: PeriodEvidence;
  eligibleEntitlements: EntitlementRecord[];
  merkleRoot: `0x${string}`;
  schemaVersionHash: `0x${string}`;
  totalEligibleAmountUSDC6: string;
};

export function buildEvidencePackage(
  normalized: NormalizedDataset,
  entitlements: EntitlementRecord[],
  statusSnapshot: AssetStatusSnapshot[]
): EvidenceOutput {
  const activeSnapshotCount = statusSnapshot.filter((s) => s.assetStatus === "ACTIVE").length;
  if (activeSnapshotCount === 0) {
    throw new Error("no ACTIVE assets in status snapshot");
  }

  const eligible = entitlements.filter((e) => e.eligibilityStatus === "ELIGIBLE");
  if (eligible.length === 0) {
    throw new Error("no eligible entitlement records");
  }

  const leaves = eligible.map((e) => entitlementLeaf(e.periodId, e.beneficiary, e.amountUSDC6));
  const merkleRoot = buildMerkleRoot(leaves);

  const totalEligible = eligible.reduce((acc, cur) => acc + BigInt(cur.amountUSDC6), 0n);

  const rawEvidence = {
    periodId: normalized.periodId,
    siteId: normalized.siteId,
    startTs: normalized.startTs,
    endTs: normalized.endTs,
    energyProducedKWh: normalized.energyProducedKWh,
    availabilityPct: normalized.availabilityPct,
    anomalyFlags: normalized.anomalyFlags,
    offlineDurationSec: normalized.offlineDurationSec,
    schemaVersion: normalized.schemaVersion
  };

  const hashedEvidence = {
    ...rawEvidence,
    evidenceHash: evidenceHash({ rawEvidence, eligibleCount: eligible.length, merkleRoot })
  };

  const periodEvidence = PeriodEvidenceSchema.parse(hashedEvidence);

  return {
    periodEvidence,
    eligibleEntitlements: eligible,
    merkleRoot,
    schemaVersionHash: schemaVersionHash(normalized.schemaVersion),
    totalEligibleAmountUSDC6: totalEligible.toString()
  };
}

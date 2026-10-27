import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDeploymentSubmissionPayload,
  buildLifecycleSubmissionPayload
} from "./pipeline/relay";
import { buildRelayPayloadFromInput } from "./pipeline/reward";
import { deployFacility } from "./simulator/deploy";
import { emitLifecycleEvent } from "./simulator/lifecycle";
import { simulateFacilityPeriod } from "./simulator/period";
import type {
  FacilityDeploymentInput,
  FacilityLifecycleEventInput,
  PeriodSimulationInput,
  RewardFlowInput
} from "./types/schemas";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8")) as T;
}

function run() {
  const deploymentInput = readJson<FacilityDeploymentInput>("examples/facility-deployment.input.sample.json");
  const periodInput = readJson<PeriodSimulationInput>("examples/period-simulation.input.sample.json");
  const brokenEventInput = readJson<FacilityLifecycleEventInput>("examples/lifecycle-broken.input.sample.json");
  const retiredEventInput = readJson<FacilityLifecycleEventInput>("examples/lifecycle-retired.input.sample.json");
  const rewardFlowInput = readJson<RewardFlowInput>("examples/period-input.sample.json");

  const firstDeployment = deployFacility(deploymentInput);
  const secondDeployment = deployFacility(deploymentInput);
  assert.deepEqual(firstDeployment, secondDeployment);
  assert.equal(firstDeployment.tokenization.initialStatus, "ACTIVE");
  assert.equal(firstDeployment.beneficiary, deploymentInput.beneficiary);
  assert.deepEqual(
    buildDeploymentSubmissionPayload(firstDeployment),
    buildDeploymentSubmissionPayload(secondDeployment)
  );

  const firstPeriod = simulateFacilityPeriod(firstDeployment, periodInput);
  const secondPeriod = simulateFacilityPeriod(firstDeployment, periodInput);
  assert.deepEqual(firstPeriod, secondPeriod);
  assert.equal(firstPeriod.periodId, periodInput.periodId);
  assert.equal(firstPeriod.rewardDistribution.amountUSDC6, firstPeriod.cashflowData.netRevenueUSDC6);
  assert.equal(firstPeriod.productionData.operatingState, "ACTIVE");

  const brokenEvent = emitLifecycleEvent(firstDeployment, brokenEventInput);
  assert.equal(brokenEvent.fromStatus, "ACTIVE");
  assert.equal(brokenEvent.toStatus, "PENDING");
  assert.deepEqual(
    buildLifecycleSubmissionPayload(brokenEvent),
    buildLifecycleSubmissionPayload(brokenEvent)
  );

  const retiredEvent = emitLifecycleEvent(firstDeployment, retiredEventInput);
  assert.equal(retiredEvent.toStatus, "RETIRED");

  const generatedRewardFlow = {
    facility: firstDeployment,
    operatingPeriod: firstPeriod,
    reviewDecision: {
      periodId: firstPeriod.periodId,
      status: "APPROVED" as const,
      reviewerId: "demo.reviewer.generated",
      reviewNotesHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
      reviewedAt: periodInput.endTs + 3600
    },
    signedDecisionUri: "file://generated-review-decision.json"
  };

  const generatedPayloadResult = buildRelayPayloadFromInput(generatedRewardFlow);
  assert.equal(
    generatedPayloadResult.payload.rewardFunding.amountUSDC6,
    firstPeriod.rewardDistribution.amountUSDC6
  );
  assert.ok(generatedPayloadResult.payload.rewardFunding.claimRoot.startsWith("0x"));
  assert.equal(generatedPayloadResult.payload.facilityId, firstDeployment.assetId);

  const samplePayloadResult = buildRelayPayloadFromInput(rewardFlowInput);
  assert.equal(
    samplePayloadResult.payload.rewardFunding.amountUSDC6,
    rewardFlowInput.operatingPeriod.rewardDistribution.amountUSDC6
  );
  assert.equal(samplePayloadResult.derivedInput.reviewDecision.periodId, rewardFlowInput.operatingPeriod.periodId);

  process.stdout.write("Demo validation passed.\n");
}

run();

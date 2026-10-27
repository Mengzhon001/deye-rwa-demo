import { readFileSync, writeFileSync } from "node:fs";
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
  FacilityDeploymentRecord,
  FacilityLifecycleEvent,
  FacilityLifecycleEventInput,
  PeriodSimulationInput
} from "./types/schemas";
import {
  FacilityDeploymentInputSchema,
  FacilityDeploymentRecordSchema,
  FacilityLifecycleEventInputSchema,
  FacilityLifecycleEventSchema
} from "./types/schemas";

function readJson<T>(inputPath: string): T {
  return JSON.parse(readFileSync(inputPath, "utf8")) as T;
}

function writeJson(outPath: string | undefined, payload: unknown) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;

  if (outPath) {
    writeFileSync(outPath, text, "utf8");
    return;
  }

  process.stdout.write(text);
}

function resolveFacilityRecord(inputPath: string) {
  const raw = readJson<FacilityDeploymentInput | FacilityDeploymentRecord>(inputPath);
  const existingRecord = FacilityDeploymentRecordSchema.safeParse(raw);
  if (existingRecord.success) {
    return existingRecord.data;
  }

  return deployFacility(FacilityDeploymentInputSchema.parse(raw));
}

function resolveLifecycleEvent(inputPath: string, facility: FacilityDeploymentRecord) {
  const raw = readJson<FacilityLifecycleEventInput | FacilityLifecycleEvent>(inputPath);
  const eventRecord = FacilityLifecycleEventSchema.safeParse(raw);
  if (eventRecord.success) {
    return eventRecord.data;
  }

  return emitLifecycleEvent(
    facility,
    FacilityLifecycleEventInputSchema.parse(raw)
  );
}

function parseFlags(args: string[]) {
  const positional: string[] = [];
  let outPath: string | undefined;
  let adminAddress: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--out") {
      outPath = args[index + 1];
      index += 1;
      continue;
    }
    if (value === "--admin") {
      adminAddress = args[index + 1];
      index += 1;
      continue;
    }
    positional.push(value);
  }

  return { positional, outPath, adminAddress };
}

function showUsage() {
  const usage = [
    "Usage:",
    "  npm run dev -- <reward-input.json>",
    "  npm run dev -- build-payload <reward-input.json> [--out file]",
    "  npm run dev -- build-period-payload <reward-input.json> [--out file]",
    "  npm run dev -- deploy-facility <deployment-input.json> [--out file]",
    "  npm run dev -- build-deployment-payload <facility-record.json> [--admin address] [--out file]",
    "  npm run dev -- simulate-period <facility-record.json> <period-input.json> [--out file]",
    "  npm run dev -- emit-lifecycle <facility-record.json> <event-input.json> [--out file]",
    "  npm run dev -- build-lifecycle-payload <facility-record.json> <event-input-or-record.json> [--out file]"
  ].join("\n");

  process.stderr.write(`${usage}\n`);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    const payload = buildRelayPayloadFromInput(
      readJson("./examples/period-input.sample.json")
    );
    writeJson(undefined, payload.payload);
    return;
  }

  const firstArg = argv[0];
  const isImplicitPayloadBuild = firstArg.endsWith(".json");
  const command = isImplicitPayloadBuild ? "build-payload" : firstArg;
  const args = isImplicitPayloadBuild ? argv : argv.slice(1);
  const {
    positional,
    outPath,
    adminAddress
  } = parseFlags(args);

  switch (command) {
    case "build-payload":
    case "build-period-payload": {
      const inputPath = positional[0] ?? "./examples/period-input.sample.json";
      const payload = buildRelayPayloadFromInput(readJson(inputPath));
      writeJson(outPath, payload.payload);
      return;
    }
    case "deploy-facility": {
      const inputPath = positional[0];
      if (!inputPath) {
        showUsage();
        process.exit(1);
      }

      const deployed = deployFacility(readJson<FacilityDeploymentInput>(inputPath));
      writeJson(outPath, deployed);
      return;
    }
    case "build-deployment-payload": {
      const facilityPath = positional[0];
      if (!facilityPath) {
        showUsage();
        process.exit(1);
      }

      const payload = buildDeploymentSubmissionPayload(
        resolveFacilityRecord(facilityPath),
        adminAddress
      );
      writeJson(outPath, payload);
      return;
    }
    case "simulate-period": {
      const facilityPath = positional[0];
      const periodPath = positional[1];
      if (!facilityPath || !periodPath) {
        showUsage();
        process.exit(1);
      }

      const period = simulateFacilityPeriod(
        resolveFacilityRecord(facilityPath),
        readJson<PeriodSimulationInput>(periodPath)
      );
      writeJson(outPath, period);
      return;
    }
    case "emit-lifecycle": {
      const facilityPath = positional[0];
      const eventPath = positional[1];
      if (!facilityPath || !eventPath) {
        showUsage();
        process.exit(1);
      }

      const event = emitLifecycleEvent(
        resolveFacilityRecord(facilityPath),
        readJson<FacilityLifecycleEventInput>(eventPath)
      );
      writeJson(outPath, event);
      return;
    }
    case "build-lifecycle-payload": {
      const facilityPath = positional[0];
      const eventPath = positional[1];
      if (!facilityPath || !eventPath) {
        showUsage();
        process.exit(1);
      }

      const facility = resolveFacilityRecord(facilityPath);
      const event = resolveLifecycleEvent(eventPath, facility);
      writeJson(outPath, buildLifecycleSubmissionPayload(event));
      return;
    }
    default:
      showUsage();
      process.exit(1);
  }
}

main();

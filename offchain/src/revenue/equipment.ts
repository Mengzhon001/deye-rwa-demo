import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const EquipmentEvidenceSchema = z.object({
  commissionedOn: date,
  pvUsefulLifeYears: z.number().min(1).max(60),
  pvAnnualLossPct: z.number().min(0).max(10),
  battery: z.object({
    commissionedOn: date,
    usefulLifeYears: z.number().min(1).max(30),
    stateOfHealthPct: z.number().min(0).max(100),
    minimumHealthPct: z.number().min(0).max(100),
    annualCapacityLossPct: z.number().min(0).max(20),
    batteryDependentSelfUsePct: z.number().min(0).max(100),
    replacementMonth: z.number().int().min(1).max(360).optional(),
    replacementCostLocal: z.number().nonnegative().optional(),
  }).optional(),
  source: z.enum(["deye-api", "owner-declared"]),
  evidence: z.string().min(20).max(2000),
  reviewedAt: z.number().int().positive().optional(),
  reviewer: z.string().optional(),
});
export type EquipmentEvidence = z.infer<typeof EquipmentEvidenceSchema>;

function monthIndex(day: string) {
  const d = new Date(day + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== day)
    throw new Error("Invalid equipment commissioning date");
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Only reviewed equipment can support a new rights sale. Old signed products are grandfathered. */
export function equipmentEligibility(raw: unknown, startAt: number, termMonths: number) {
  if (!raw) return { status: "missing" as const, reasons: ["Equipment dates, lifetime and inspection evidence are required"] };
  const e = EquipmentEvidenceSchema.parse(raw);
  if (!e.reviewedAt || !e.reviewer) return { status: "pending" as const, reasons: ["Intermediary must review equipment evidence"] };
  const start = new Date(startAt * 1000);
  const endMonth = start.getUTCFullYear() * 12 + start.getUTCMonth() + termMonths;
  const reasons: string[] = [];
  if (monthIndex(e.commissionedOn) + Math.floor(e.pvUsefulLifeYears * 12) < endMonth)
    reasons.push("PV supported lifetime ends before the proposed rights term");
  if (e.battery) {
    const b = e.battery;
    const untilReplacement = b.replacementMonth ? Math.min(termMonths, b.replacementMonth - 1) : termMonths;
    const remainingHealth = b.stateOfHealthPct - untilReplacement * b.annualCapacityLossPct / 12;
    if (remainingHealth < b.minimumHealthPct)
      reasons.push("Battery health falls below its reviewed operating minimum before replacement");
    if (monthIndex(b.commissionedOn) + Math.floor(b.usefulLifeYears * 12) < endMonth && !b.replacementMonth)
      reasons.push("Battery supported lifetime ends before the proposed rights term without a replacement plan");
    if (b.replacementMonth && (!b.replacementCostLocal || b.replacementMonth > termMonths))
      reasons.push("Battery replacement month and reviewed cost must cover the rights term");
  }
  return { status: reasons.length ? "rejected" as const : "eligible" as const, reasons };
}

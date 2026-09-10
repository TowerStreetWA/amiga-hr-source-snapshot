import type { SicknessAbsence } from "@workspace/db";
import { todayIsoDate, isoDateOffsetDays } from "./workingDays";

/**
 * Bradford Factor = S^2 * D, where S is the number of separate spells of
 * absence and D is the total number of days lost over a rolling 12 month
 * window.
 */
export function bradfordScore(
  absences: Pick<SicknessAbsence, "startDate" | "daysLost">[],
  asOf: string = todayIsoDate(),
): number {
  const cutoff = isoDateOffsetDays(-365, new Date(asOf + "T00:00:00.000Z"));
  const window = absences.filter((a) => a.startDate >= cutoff && a.startDate <= asOf);
  const spells = window.length;
  const days = window.reduce((sum, a) => sum + Number(a.daysLost ?? 0), 0);
  return Math.round(spells * spells * days);
}

export type RiskBand = "low" | "medium" | "high" | "critical";

export function riskBand(score: number): RiskBand {
  if (score >= 200) return "critical";
  if (score >= 100) return "high";
  if (score >= 50) return "medium";
  return "low";
}

import { CandidateCurrentStage } from "@workspace/api-client-react";

export type Stage = (typeof CandidateCurrentStage)[keyof typeof CandidateCurrentStage];

export const ACTIVE_STAGES: Stage[] = [
  "new",
  "cv_review",
  "shortlisted",
  "phone_screen",
  "interview_1",
  "interview_2",
  "interview_3",
  "assessment",
  "offer_pending",
  "offered",
];

export const ALL_STAGES: Stage[] = [...ACTIVE_STAGES, "hired", "rejected"];

export const STAGE_LABELS: Record<Stage, string> = {
  new: "New",
  cv_review: "CV Review",
  shortlisted: "Shortlisted",
  phone_screen: "Phone Screen",
  interview_1: "Interview 1",
  interview_2: "Interview 2",
  interview_3: "Interview 3",
  assessment: "Assessment",
  offer_pending: "Offer Pending",
  offered: "Offered",
  hired: "Hired",
  rejected: "Rejected",
};

export const STAGE_TONE: Record<Stage, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-200",
  cv_review: "bg-blue-50 text-blue-700 border-blue-200",
  shortlisted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  phone_screen: "bg-violet-50 text-violet-700 border-violet-200",
  interview_1: "bg-purple-50 text-purple-700 border-purple-200",
  interview_2: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  interview_3: "bg-pink-50 text-pink-700 border-pink-200",
  assessment: "bg-amber-50 text-amber-700 border-amber-200",
  offer_pending: "bg-orange-50 text-orange-700 border-orange-200",
  offered: "bg-[#C5A059]/15 text-[#7a5e1c] border-[#C5A059]/30",
  hired: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-slate-100 text-slate-500 border-slate-200",
};

export function formatCurrency(value: number | null | undefined, currency = "GBP"): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency = "GBP",
): string {
  if (min === null && max === null) return "Salary on application";
  if (min !== null && min !== undefined && max !== null && max !== undefined) {
    return `${formatCurrency(min, currency)} – ${formatCurrency(max, currency)}`;
  }
  if (min !== null && min !== undefined) return `From ${formatCurrency(min, currency)}`;
  if (max !== null && max !== undefined) return `Up to ${formatCurrency(max, currency)}`;
  return "Salary on application";
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

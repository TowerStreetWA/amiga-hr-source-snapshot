export type TrainingTemplate = {
  name: string;
  category: "mandatory" | "professional" | "technical" | "soft_skills" | "compliance" | "other";
  // Months until expiry once completed
  validityMonths: number;
};

export const MANDATORY_LLOYDS_TRAINING: TrainingTemplate[] = [
  { name: "Anti-Money Laundering (AML)", category: "mandatory", validityMonths: 12 },
  { name: "GDPR & Data Protection", category: "mandatory", validityMonths: 12 },
  { name: "Cyber Security Awareness", category: "mandatory", validityMonths: 12 },
  { name: "FCA Regulatory Conduct", category: "mandatory", validityMonths: 12 },
  { name: "Lloyd's Market Induction", category: "mandatory", validityMonths: 24 },
  { name: "Bribery Act Training", category: "mandatory", validityMonths: 12 },
  { name: "Conflicts of Interest", category: "mandatory", validityMonths: 12 },
  { name: "Health & Safety", category: "mandatory", validityMonths: 24 },
];

export function buildMandatoryTrainingRows(
  employeeId: number,
  tenantId: string,
) {
  return MANDATORY_LLOYDS_TRAINING.map((tpl) => ({
    tenantId,
    employeeId,
    name: tpl.name,
    category: tpl.category,
    status: "pending" as const,
    isMandatory: true,
    currency: "GBP",
  }));
}

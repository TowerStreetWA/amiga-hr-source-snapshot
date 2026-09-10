export type OnboardingTaskTemplate = {
  title: string;
  description?: string;
  category: "admin" | "it_systems" | "documents" | "compliance" | "benefits" | "meet_team" | "other";
  // Days from start date when the task is due (negative = before start)
  dueOffsetDays: number;
};

export const DEFAULT_ONBOARDING_TASKS: OnboardingTaskTemplate[] = [
  // ADMIN
  { title: "Collect signed contract", category: "admin", dueOffsetDays: -7, description: "Ensure signed offer letter and employment contract are returned." },
  { title: "Verify proof of identity", category: "admin", dueOffsetDays: -3, description: "Passport / national ID copies on file." },
  { title: "Set up payroll record", category: "admin", dueOffsetDays: -1, description: "Add to payroll system, collect bank details, P45/Starter Checklist." },
  { title: "Issue welcome pack", category: "admin", dueOffsetDays: 0 },

  // IT & SYSTEMS
  { title: "Provision laptop and peripherals", category: "it_systems", dueOffsetDays: -1 },
  { title: "Create email and SSO account", category: "it_systems", dueOffsetDays: -1 },
  { title: "Grant access to broker placement system", category: "it_systems", dueOffsetDays: 0 },
  { title: "Add to Slack / Teams channels", category: "it_systems", dueOffsetDays: 0 },

  // DOCUMENTS
  { title: "Receive emergency contact details", category: "documents", dueOffsetDays: 1 },
  { title: "Right-to-work check filed", category: "documents", dueOffsetDays: 1 },

  // COMPLIANCE
  { title: "FCA regulatory registration check", category: "compliance", dueOffsetDays: 7, description: "If a Certified Person, confirm certification status." },
  { title: "DBS / background screening complete", category: "compliance", dueOffsetDays: 7 },
  { title: "Conflicts of interest declaration", category: "compliance", dueOffsetDays: 14 },
  { title: "Sign code of conduct & data protection acknowledgment", category: "compliance", dueOffsetDays: 14 },

  // BENEFITS
  { title: "Enrol in pension scheme", category: "benefits", dueOffsetDays: 14 },
  { title: "Enrol in private medical insurance", category: "benefits", dueOffsetDays: 14 },
  { title: "Issue benefits handbook", category: "benefits", dueOffsetDays: 7 },

  // MEET TEAM
  { title: "Welcome lunch with line manager", category: "meet_team", dueOffsetDays: 0 },
  { title: "Intro meetings with key stakeholders", category: "meet_team", dueOffsetDays: 7 },
  { title: "Two-week check-in with line manager", category: "meet_team", dueOffsetDays: 14 },
  { title: "One-month review", category: "meet_team", dueOffsetDays: 30 },
];

export function buildOnboardingTaskRows(
  employeeId: number,
  startDate: string,
  tenantId: string,
) {
  const start = new Date(startDate);
  return DEFAULT_ONBOARDING_TASKS.map((tpl, idx) => {
    const due = new Date(start);
    due.setUTCDate(due.getUTCDate() + tpl.dueOffsetDays);
    return {
      tenantId,
      employeeId,
      title: tpl.title,
      description: tpl.description ?? null,
      category: tpl.category,
      dueDate: due.toISOString().slice(0, 10),
      status: "pending" as const,
      sortOrder: idx,
      isCustom: false,
    };
  });
}

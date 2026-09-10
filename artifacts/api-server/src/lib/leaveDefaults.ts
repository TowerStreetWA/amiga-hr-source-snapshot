export const LEAVE_TYPES = [
  "annual",
  "maternity",
  "paternity",
  "compassionate",
  "study",
  "unpaid",
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

export const DEFAULT_LEAVE_ENTITLEMENT_DAYS: Record<LeaveType, number> = {
  annual: 25,
  maternity: 183,
  paternity: 14,
  compassionate: 5,
  study: 5,
  unpaid: 0,
};

export const SEEDABLE_LEAVE_TYPES: LeaveType[] = [
  "annual",
  "maternity",
  "paternity",
  "compassionate",
  "study",
];

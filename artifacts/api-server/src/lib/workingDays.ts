function parseDateOnly(s: string): Date {
  // Construct in UTC to avoid timezone drift
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function countWorkingDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  if (endDate < startDate) return 0;
  let count = 0;
  for (
    let d = startDate.getTime();
    d <= endDate.getTime();
    d += 24 * 60 * 60 * 1000
  ) {
    const day = new Date(d).getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

/**
 * Count working days (Mon-Fri) between start and end that fall within `year`.
 * Used to allocate cross-year leave to the correct entitlement bucket.
 */
export function countWorkingDaysInYear(
  start: string,
  end: string,
  year: number,
): number {
  if (!start || !end) return 0;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const clampedStart = start > yearStart ? start : yearStart;
  const clampedEnd = end < yearEnd ? end : yearEnd;
  if (clampedEnd < clampedStart) return 0;
  return countWorkingDays(clampedStart, clampedEnd);
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isoDateOffsetDays(days: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

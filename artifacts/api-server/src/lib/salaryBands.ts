export type SalaryBandDef = { label: string; min: number; max: number | null };

export const SALARY_BANDS: SalaryBandDef[] = [
  { label: "Under £30k", min: 0, max: 30000 },
  { label: "£30k–£50k", min: 30000, max: 50000 },
  { label: "£50k–£75k", min: 50000, max: 75000 },
  { label: "£75k–£100k", min: 75000, max: 100000 },
  { label: "£100k–£150k", min: 100000, max: 150000 },
  { label: "£150k+", min: 150000, max: null },
];

export function bandFor(salary: number): SalaryBandDef | null {
  for (const b of SALARY_BANDS) {
    if (salary >= b.min && (b.max === null || salary < b.max)) return b;
  }
  return null;
}

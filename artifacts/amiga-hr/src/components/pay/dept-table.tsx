import type { DepartmentPay } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function DepartmentPayTable({
  rows,
  loading,
}: {
  rows?: DepartmentPay[];
  loading: boolean;
}) {
  return (
    <Card className="border-[#000033]/10 shadow-sm">
      <CardHeader className="border-b border-[#000033]/5 pb-4">
        <CardTitle className="text-lg font-medium text-[#000033]">Pay by Department</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-8 text-center text-[#000033]/50 text-sm">No department data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-dept-pay">
              <thead className="bg-[#F8F7F4] text-[#000033]/60 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold">Department</th>
                  <th className="text-right px-6 py-3 font-semibold">Headcount</th>
                  <th className="text-right px-6 py-3 font-semibold">Total Annual</th>
                  <th className="text-right px-6 py-3 font-semibold">Average</th>
                  <th className="text-right px-6 py-3 font-semibold">Min</th>
                  <th className="text-right px-6 py-3 font-semibold">Max</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#000033]/5">
                {rows.map((r) => (
                  <tr key={r.department} className="hover:bg-[#000033]/[0.02]">
                    <td className="px-6 py-3 font-medium text-[#000033]">{r.department}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-[#000033]">{r.headcount}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-[#000033]">
                      {GBP.format(r.totalAnnualCost)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-[#000033]/80">
                      {GBP.format(r.averageSalary)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-[#000033]/60">
                      {GBP.format(r.minSalary)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-[#000033]/60">
                      {GBP.format(r.maxSalary)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

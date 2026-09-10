import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SalaryChangeWithEmployee } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function pctBadge(p: number | null | undefined) {
  if (p === null || p === undefined) {
    return (
      <Badge className="bg-slate-100 text-slate-700 border-slate-200">
        <Minus className="h-3 w-3 mr-1" />
        New
      </Badge>
    );
  }
  if (p > 0) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
        <TrendingUp className="h-3 w-3 mr-1" />+{p.toFixed(2)}%
      </Badge>
    );
  }
  if (p < 0) {
    return (
      <Badge className="bg-rose-100 text-rose-700 border-rose-200">
        <TrendingDown className="h-3 w-3 mr-1" />
        {p.toFixed(2)}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-slate-100 text-slate-700 border-slate-200">
      <Minus className="h-3 w-3 mr-1" />
      0%
    </Badge>
  );
}

export function RecentChangesList({
  rows,
  loading,
}: {
  rows?: SalaryChangeWithEmployee[];
  loading: boolean;
}) {
  return (
    <Card className="border-[#000033]/10 shadow-sm">
      <CardHeader className="border-b border-[#000033]/5 pb-4">
        <CardTitle className="text-lg font-medium text-[#000033]">Recent Salary Changes</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-8 text-center text-[#000033]/50 text-sm">No salary changes recorded</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-recent-changes">
              <thead className="bg-[#F8F7F4] text-[#000033]/60 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold">Employee</th>
                  <th className="text-left px-6 py-3 font-semibold">Department</th>
                  <th className="text-right px-6 py-3 font-semibold">Previous</th>
                  <th className="text-right px-6 py-3 font-semibold">New</th>
                  <th className="text-center px-6 py-3 font-semibold">Change</th>
                  <th className="text-left px-6 py-3 font-semibold">Effective</th>
                  <th className="text-left px-6 py-3 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#000033]/5">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[#000033]/[0.02]">
                    <td className="px-6 py-3">
                      <Link href={`/employees/${r.employeeId}`}>
                        <span className="font-medium text-[#000033] hover:text-[#C5A059] cursor-pointer">
                          {r.employeeName}
                        </span>
                      </Link>
                      <div className="text-xs text-[#000033]/50 tabular-nums">{r.employeeNumber}</div>
                    </td>
                    <td className="px-6 py-3 text-[#000033]/70">{r.department}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-[#000033]/60">
                      {r.previousSalary !== null && r.previousSalary !== undefined ? GBP.format(r.previousSalary) : "—"}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-semibold text-[#000033]">
                      {GBP.format(r.newSalary)}
                    </td>
                    <td className="px-6 py-3 text-center">{pctBadge(r.percentChange)}</td>
                    <td className="px-6 py-3 text-[#000033]/70 tabular-nums">
                      {format(parseISO(r.effectiveDate), "d MMM yyyy")}
                    </td>
                    <td className="px-6 py-3 text-[#000033]/60 text-xs max-w-xs truncate">
                      {r.reason ?? "—"}
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

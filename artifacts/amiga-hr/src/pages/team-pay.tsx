import { useMemo } from "react";
import { PoundSterling, TrendingUp } from "lucide-react";
import {
  useListEmployees,
  getListEmployeesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

function formatGbp(value: number | null, currency: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function TeamPay() {
  const { data, isLoading } = useListEmployees(
    {},
    { query: { queryKey: getListEmployeesQueryKey() } },
  );

  const rows = data ?? [];
  const totalPayroll = useMemo(
    () => rows.reduce((sum, e) => sum + (e.salary ?? 0), 0),
    [rows],
  );

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0">
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <PoundSterling className="h-4 w-4 text-[#C5A059]" /> My team
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Team pay</h1>
          <p className="text-[#000033]/60 mt-1">
            Read-only compensation for your direct reports.
          </p>
        </header>

        <div className="shrink-0 grid grid-cols-2 gap-4 max-w-lg">
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Direct reports</p>
              <p className="text-3xl font-serif mt-1 text-[#000033]" data-testid="text-team-headcount">{rows.length}</p>
            </CardContent>
          </Card>
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#C5A059]" />
                <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Team payroll</p>
              </div>
              <p className="text-3xl font-serif mt-1 text-[#000033] tabular-nums" data-testid="text-team-payroll">
                {formatGbp(totalPayroll, "GBP")}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : rows.length === 0 ? (
            <Card className="border-[#000033]/10">
              <CardContent className="py-16 text-center text-[#000033]/50">
                You have no direct reports yet.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[#000033]/10">
              <CardContent className="p-0 divide-y divide-[#000033]/5">
                {rows.map((e) => (
                  <div key={e.id} className="px-4 py-3 flex items-center gap-3" data-testid={`row-team-pay-${e.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#000033]">{e.firstName} {e.lastName}</p>
                        <Badge variant="outline" className="bg-white border-[#000033]/20 text-[#000033] text-[10px]">
                          {e.jobTitle}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#000033]/60 mt-1">{e.employeeNumber} · {e.department}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-[#000033] tabular-nums">{formatGbp(e.salary ?? null, e.currency ?? "GBP")}</p>
                      <p className="text-[10px] uppercase tracking-wider text-[#000033]/40">per year</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

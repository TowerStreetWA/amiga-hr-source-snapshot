import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CheckCircle2, RefreshCw } from "lucide-react";
import {
  useGetDueForReview,
  useApplyBulkReview,
  getGetDueForReviewQueryKey,
  getGetPayStatsQueryKey,
  getGetRecentSalaryChangesQueryKey,
  getGetPayByDepartmentQueryKey,
  getGetSalaryBandsQueryKey,
  getListSalaryHistoryQueryKey,
  type DueForReviewEmployee,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

type Row = DueForReviewEmployee & {
  selected: boolean;
  newSalary: number;
};

export function BulkReviewPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetDueForReview({
    query: { queryKey: getGetDueForReviewQueryKey() },
  });
  const [percent, setPercent] = useState<string>("3");
  const [effectiveDate, setEffectiveDate] = useState<string>(todayIso());
  const [reason, setReason] = useState<string>("Annual pay review");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!data) return;
    const pct = Number(percent) || 0;
    setRows(
      data.map((d) => ({
        ...d,
        selected: true,
        newSalary: d.currentSalary
          ? Math.round(d.currentSalary * (1 + pct / 100))
          : 0,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const applyPct = () => {
    const pct = Number(percent);
    if (!Number.isFinite(pct)) return;
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        newSalary: r.currentSalary ? Math.round(r.currentSalary * (1 + pct / 100)) : r.newSalary,
      })),
    );
  };

  const toggleAll = (checked: boolean) =>
    setRows((prev) => prev.map((r) => ({ ...r, selected: checked })));

  const selected = useMemo(() => rows.filter((r) => r.selected && r.newSalary > 0), [rows]);

  const totalCurrent = useMemo(
    () => selected.reduce((s, r) => s + (r.currentSalary ?? 0), 0),
    [selected],
  );
  const totalNew = useMemo(() => selected.reduce((s, r) => s + r.newSalary, 0), [selected]);
  const delta = totalNew - totalCurrent;

  const mutation = useApplyBulkReview();

  const apply = () => {
    if (selected.length === 0) {
      toast({ title: "Nothing to apply", description: "Select at least one employee.", variant: "destructive" });
      return;
    }
    mutation.mutate(
      {
        data: {
          effectiveDate,
          reason,
          items: selected.map((r) => ({ employeeId: r.employeeId, newSalary: r.newSalary })),
        },
      },
      {
        onSuccess: (res) => {
          toast({
            title: "Pay review applied",
            description: `${res.applied} employee(s) updated${res.skipped ? `, ${res.skipped} skipped` : ""}.`,
          });
          qc.invalidateQueries({ queryKey: getGetDueForReviewQueryKey() });
          qc.invalidateQueries({ queryKey: getGetPayStatsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetRecentSalaryChangesQueryKey() });
          qc.invalidateQueries({ queryKey: getGetPayByDepartmentQueryKey() });
          qc.invalidateQueries({ queryKey: getGetSalaryBandsQueryKey() });
          // bust per-employee history caches
          for (const r of selected) {
            qc.invalidateQueries({ queryKey: getListSalaryHistoryQueryKey(r.employeeId) });
          }
        },
        onError: () => {
          toast({ title: "Apply failed", description: "Could not apply bulk review.", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card className="border-[#000033]/10 shadow-sm">
        <CardHeader className="border-b border-[#000033]/5 pb-4">
          <CardTitle className="text-lg font-medium text-[#000033]">Annual Pay Review</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1">
            <Label htmlFor="bulk-pct">Increase %</Label>
            <Input
              id="bulk-pct"
              type="number"
              step="0.1"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              data-testid="input-bulk-percent"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bulk-effective">Effective Date</Label>
            <Input
              id="bulk-effective"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              data-testid="input-bulk-date"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bulk-reason">Reason</Label>
            <Input
              id="bulk-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-bulk-reason"
            />
          </div>
          <Button
            type="button"
            onClick={applyPct}
            variant="outline"
            className="border-[#000033]/20 text-[#000033]"
            data-testid="button-recalc"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Recalculate
          </Button>
        </CardContent>
      </Card>

      <Card className="border-[#000033]/10 shadow-sm">
        <CardHeader className="border-b border-[#000033]/5 pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-medium text-[#000033]">
            Due for Review
            <Badge className="ml-3 bg-amber-100 text-amber-700 border-amber-200">
              {data?.length ?? 0}
            </Badge>
          </CardTitle>
          <div className="text-sm text-[#000033]/60">
            <span className="mr-4">
              Selected: <span className="font-semibold text-[#000033]">{selected.length}</span>
            </span>
            <span className="mr-4">
              Total cost: <span className="font-semibold text-[#000033] tabular-nums">{GBP.format(totalNew)}</span>
            </span>
            <span>
              Delta:{" "}
              <span
                className={`font-semibold tabular-nums ${
                  delta > 0 ? "text-emerald-700" : delta < 0 ? "text-rose-700" : "text-[#000033]/60"
                }`}
              >
                {delta >= 0 ? "+" : ""}
                {GBP.format(delta)}
              </span>
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-emerald-500 mb-3" />
              <p className="text-sm text-[#000033]/70">All employees are up to date on pay reviews.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-bulk-review">
                <thead className="bg-[#F8F7F4] text-[#000033]/60 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && rows.every((r) => r.selected)}
                        onChange={(e) => toggleAll(e.target.checked)}
                        data-testid="checkbox-bulk-all"
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold">Employee</th>
                    <th className="text-left px-4 py-3 font-semibold">Department</th>
                    <th className="text-left px-4 py-3 font-semibold">Last Review</th>
                    <th className="text-right px-4 py-3 font-semibold">Current</th>
                    <th className="text-right px-4 py-3 font-semibold">New</th>
                    <th className="text-right px-4 py-3 font-semibold">Δ %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#000033]/5">
                  {rows.map((r, idx) => {
                    const pct =
                      r.currentSalary && r.currentSalary > 0
                        ? ((r.newSalary - r.currentSalary) / r.currentSalary) * 100
                        : null;
                    return (
                      <tr key={r.employeeId} className="hover:bg-[#000033]/[0.02]">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={r.selected}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, selected: e.target.checked } : p)),
                              )
                            }
                            data-testid={`checkbox-bulk-${r.employeeId}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#000033]">{r.employeeName}</div>
                          <div className="text-xs text-[#000033]/50 tabular-nums">{r.employeeNumber} · {r.jobTitle}</div>
                        </td>
                        <td className="px-4 py-3 text-[#000033]/70">{r.department}</td>
                        <td className="px-4 py-3 text-[#000033]/70 tabular-nums">
                          {r.lastReviewDate ? format(parseISO(r.lastReviewDate), "d MMM yyyy") : "Never"}
                          {r.monthsSinceReview !== null && r.monthsSinceReview !== undefined && (
                            <div className="text-xs text-amber-700">{r.monthsSinceReview} months ago</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-[#000033]/70">
                          {r.currentSalary !== null && r.currentSalary !== undefined
                            ? GBP.format(r.currentSalary)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Input
                            type="number"
                            value={r.newSalary}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((p, i) =>
                                  i === idx ? { ...p, newSalary: Number(e.target.value) || 0 } : p,
                                ),
                              )
                            }
                            className="w-32 ml-auto text-right tabular-nums"
                            data-testid={`input-newsal-${r.employeeId}`}
                          />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {pct !== null ? (
                            <span
                              className={
                                pct > 0
                                  ? "text-emerald-700 font-semibold"
                                  : pct < 0
                                    ? "text-rose-700 font-semibold"
                                    : "text-[#000033]/60"
                              }
                            >
                              {pct >= 0 ? "+" : ""}
                              {pct.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-[#000033]/40">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={apply}
            disabled={mutation.isPending || selected.length === 0}
            className="bg-[#000033] hover:bg-[#000033]/90 text-white"
            data-testid="button-apply-bulk"
          >
            {mutation.isPending ? "Applying…" : `Apply review to ${selected.length} employee${selected.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}
    </div>
  );
}

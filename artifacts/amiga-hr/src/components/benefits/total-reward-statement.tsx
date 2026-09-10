import { format, parseISO } from "date-fns";
import { Printer } from "lucide-react";
import {
  useGetTotalReward,
  getGetTotalRewardQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const CATEGORY_LABEL: Record<string, string> = {
  pension: "Pension",
  health: "Health",
  life_assurance: "Life Assurance",
  income_protection: "Income Protection",
  dental: "Dental",
  allowance: "Allowance",
  other: "Other",
};

const LEAVE_LABEL: Record<string, string> = {
  annual: "Annual leave",
  maternity: "Maternity",
  paternity: "Paternity",
  compassionate: "Compassionate",
  study: "Study",
  unpaid: "Unpaid",
};

export function TotalRewardDialog({
  open,
  onOpenChange,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: number;
}) {
  const { data, isLoading } = useGetTotalReward(employeeId, {
    query: { queryKey: getGetTotalRewardQueryKey(employeeId), enabled: open },
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle className="font-serif text-[#000033] flex items-center justify-between">
            Total Reward Statement
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              className="border-[#000033]/20 text-[#000033]"
              data-testid="button-print-trs"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div id="trs-print" className="space-y-6 print:p-8">
            <div className="border-b border-[#000033]/10 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#000033]/60 font-semibold">
                    Amiga Specialty HR
                  </p>
                  <h2 className="text-2xl font-serif text-[#000033] mt-1">
                    Total Reward Statement
                  </h2>
                  <p className="text-sm text-[#000033]/70 mt-2">
                    {data.employeeName} · {data.employeeNumber}
                  </p>
                  <p className="text-xs text-[#000033]/60">
                    {data.jobTitle} · {data.department}
                  </p>
                  {data.startDate && (
                    <p className="text-xs text-[#000033]/60">
                      Start date: {format(parseISO(data.startDate), "d MMMM yyyy")}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-[#000033]/60 font-semibold">
                    Generated
                  </p>
                  <p className="text-sm text-[#000033]">
                    {format(new Date(data.generatedAt), "d MMM yyyy")}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="border border-[#000033]/10 rounded p-4">
                <p className="text-[10px] uppercase tracking-wider text-[#000033]/60 font-semibold">
                  Base Salary
                </p>
                <p
                  className="text-2xl font-semibold tabular-nums text-[#000033] mt-1"
                  data-testid="trs-base-salary"
                >
                  {GBP.format(data.baseSalary)}
                </p>
              </div>
              <div className="border border-[#000033]/10 rounded p-4">
                <p className="text-[10px] uppercase tracking-wider text-[#000033]/60 font-semibold">
                  Benefits Value
                </p>
                <p
                  className="text-2xl font-semibold tabular-nums text-[#000033] mt-1"
                  data-testid="trs-benefits-value"
                >
                  {GBP.format(data.totalBenefitsValue)}
                </p>
              </div>
              <div className="border-2 border-[#C5A059] rounded p-4 bg-[#C5A059]/5">
                <p className="text-[10px] uppercase tracking-wider text-[#C5A059] font-semibold">
                  Total Package
                </p>
                <p
                  className="text-2xl font-semibold tabular-nums text-[#000033] mt-1"
                  data-testid="trs-total-package"
                >
                  {GBP.format(data.totalPackageValue)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="font-serif text-lg text-[#000033] mb-3">Benefits</h3>
              {data.benefits.length === 0 ? (
                <p className="text-sm text-[#000033]/60">No active benefits.</p>
              ) : (
                <table className="w-full text-sm border border-[#000033]/10">
                  <thead className="bg-[#F8F7F4] text-xs uppercase tracking-wider text-[#000033]/60">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Benefit</th>
                      <th className="text-left px-3 py-2 font-semibold">Category</th>
                      <th className="text-left px-3 py-2 font-semibold">Provider</th>
                      <th className="text-right px-3 py-2 font-semibold">Annual Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#000033]/5">
                    {data.benefits.map((b) => (
                      <tr key={b.id}>
                        <td className="px-3 py-2 text-[#000033] font-medium">{b.name}</td>
                        <td className="px-3 py-2 text-[#000033]/70">
                          {CATEGORY_LABEL[b.category] ?? b.category}
                        </td>
                        <td className="px-3 py-2 text-[#000033]/70">{b.provider ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[#000033]">
                          {GBP.format(b.annualValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#F8F7F4]">
                      <td colSpan={3} className="px-3 py-2 text-right font-semibold text-[#000033]">
                        Total
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#000033]">
                        {GBP.format(data.totalBenefitsValue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div>
              <h3 className="font-serif text-lg text-[#000033] mb-3">
                Leave Entitlements ({new Date().getUTCFullYear()})
              </h3>
              {data.leaveEntitlements.length === 0 ? (
                <p className="text-sm text-[#000033]/60">No entitlements set.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {data.leaveEntitlements.map((e) => (
                    <div
                      key={e.leaveType}
                      className="border border-[#000033]/10 rounded p-3"
                    >
                      <p className="text-xs uppercase tracking-wider text-[#000033]/60 font-semibold">
                        {LEAVE_LABEL[e.leaveType] ?? e.leaveType}
                      </p>
                      <p className="text-lg font-semibold tabular-nums text-[#000033] mt-0.5">
                        {e.entitledDays} days
                      </p>
                      <p className="text-xs text-[#000033]/60">
                        {e.remainingDays} remaining
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[#000033]/10 pt-3 text-xs text-[#000033]/60 text-center print:mt-6">
              This statement is for information only and forms no part of any contract of employment.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

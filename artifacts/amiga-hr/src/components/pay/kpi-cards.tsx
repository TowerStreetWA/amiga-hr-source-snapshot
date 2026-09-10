import { motion } from "framer-motion";
import { PoundSterling, Users, BarChart3, AlertCircle } from "lucide-react";
import type { PayStats } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function PayKpiCards({ stats, loading }: { stats?: PayStats; loading: boolean }) {
  const items = [
    {
      label: "Total Annual Payroll",
      value: stats ? GBP.format(stats.totalAnnualPayroll) : "—",
      icon: PoundSterling,
      testid: "kpi-total-annual",
    },
    {
      label: "Monthly Payroll",
      value: stats ? GBP.format(stats.totalMonthlyPayroll) : "—",
      icon: BarChart3,
      testid: "kpi-monthly",
    },
    {
      label: "Average Salary",
      value: stats ? GBP.format(stats.averageSalary) : "—",
      icon: Users,
      testid: "kpi-average",
    },
    {
      label: "Due for Review",
      value: stats?.dueForReviewCount ?? 0,
      icon: AlertCircle,
      tone: "amber" as const,
      testid: "kpi-due-review",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((it, idx) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05 }}
        >
          <Card className="border-[#000033]/10 shadow-sm h-full">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#000033]/60">
                  {it.label}
                </p>
                <it.icon className={`h-4 w-4 ${it.tone === "amber" ? "text-amber-600" : "text-[#000033]/40"}`} />
              </div>
              {loading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <div
                  className={`text-2xl font-semibold tabular-nums ${
                    it.tone === "amber" ? "text-amber-700" : "text-[#000033]"
                  }`}
                  data-testid={it.testid}
                >
                  {it.value}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

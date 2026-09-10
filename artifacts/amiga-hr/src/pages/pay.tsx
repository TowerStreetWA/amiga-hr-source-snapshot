import { useState } from "react";
import { PoundSterling } from "lucide-react";
import {
  useGetPayStats,
  getGetPayStatsQueryKey,
  useGetPayByDepartment,
  getGetPayByDepartmentQueryKey,
  useGetSalaryBands,
  getGetSalaryBandsQueryKey,
  useGetRecentSalaryChanges,
  getGetRecentSalaryChangesQueryKey,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PayKpiCards } from "@/components/pay/kpi-cards";
import { DepartmentPayTable } from "@/components/pay/dept-table";
import { SalaryBandsChart } from "@/components/pay/bands-chart";
import { RecentChangesList } from "@/components/pay/changes-list";
import { BulkReviewPanel } from "@/components/pay/bulk-review";

type Tab = "overview" | "departments" | "bands" | "changes" | "review";

export function Pay() {
  const [tab, setTab] = useState<Tab>("overview");

  const { data: stats, isLoading: statsLoading } = useGetPayStats({
    query: { queryKey: getGetPayStatsQueryKey() },
  });
  const { data: depts, isLoading: deptsLoading } = useGetPayByDepartment({
    query: { queryKey: getGetPayByDepartmentQueryKey() },
  });
  const { data: bands, isLoading: bandsLoading } = useGetSalaryBands({
    query: { queryKey: getGetSalaryBandsQueryKey() },
  });
  const { data: changes, isLoading: changesLoading } = useGetRecentSalaryChanges(
    { limit: 25 },
    { query: { queryKey: getGetRecentSalaryChangesQueryKey({ limit: 25 }) } },
  );

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-serif text-[#000033] flex items-center gap-3">
              <PoundSterling className="h-8 w-8 text-[#C5A059]" />
              Pay & Compensation
            </h1>
            <p className="text-[#000033]/60 mt-1">
              Workforce pay overview, salary bands, and annual review tools.
            </p>
          </div>
        </header>

        <PayKpiCards stats={stats} loading={statsLoading} />

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
          <TabsList className="bg-transparent border-b border-[#000033]/10 rounded-none w-full justify-start h-auto p-0 space-x-8">
            {[
              { v: "overview", label: "Overview" },
              { v: "departments", label: "By Department" },
              { v: "bands", label: "Salary Bands" },
              { v: "changes", label: "Recent Changes" },
              { v: "review", label: "Annual Review" },
            ].map((t) => (
              <TabsTrigger
                key={t.v}
                value={t.v}
                className="rounded-none border-b-2 border-transparent px-0 py-3 data-[state=active]:border-[#C5A059] data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-[#000033] text-[#000033]/60 hover:text-[#000033]/80 tracking-wider font-semibold text-xs transition-all"
                data-testid={`tab-pay-${t.v}`}
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-6">
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SalaryBandsChart bands={bands} loading={bandsLoading} />
                <DepartmentPayTable rows={depts} loading={deptsLoading} />
              </div>
              <RecentChangesList rows={changes?.slice(0, 8)} loading={changesLoading} />
            </TabsContent>

            <TabsContent value="departments">
              <DepartmentPayTable rows={depts} loading={deptsLoading} />
            </TabsContent>

            <TabsContent value="bands">
              <SalaryBandsChart bands={bands} loading={bandsLoading} />
            </TabsContent>

            <TabsContent value="changes">
              <RecentChangesList rows={changes} loading={changesLoading} />
            </TabsContent>

            <TabsContent value="review">
              <BulkReviewPanel />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Users, CalendarClock, Hourglass } from "lucide-react";
import {
  useListLeaveRequests,
  getListLeaveRequestsQueryKey,
  getListEmployeeLeaveRequestsQueryKey,
  getListEmployeeLeaveEntitlementsQueryKey,
  type LeaveRequestWithEmployee,
} from "@workspace/api-client-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApprovalDialog } from "@/components/leave/approval-dialog";

type Tab = "pending" | "all";

const TYPE_LABEL: Record<string, string> = {
  annual: "Annual leave",
  maternity: "Maternity",
  paternity: "Paternity",
  compassionate: "Compassionate",
  study: "Study",
  unpaid: "Unpaid",
};

function statusBadge(s: string) {
  switch (s) {
    case "approved": return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Approved</Badge>;
    case "declined": return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Declined</Badge>;
    case "cancelled": return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Cancelled</Badge>;
    default: return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>;
  }
}

export function TeamLeave() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pending");
  const [approval, setApproval] = useState<{ request: LeaveRequestWithEmployee; decision: "approved" | "declined" } | null>(null);

  const apiStatus = tab === "pending" ? { status: "pending" } : {};
  const { data, isLoading } = useListLeaveRequests(apiStatus, {
    query: { queryKey: getListLeaveRequestsQueryKey(apiStatus) },
  });

  const pendingCount = useMemo(
    () => (data ?? []).filter((r) => r.status === "pending").length,
    [data],
  );

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/leave/calendar"] });
    if (approval) {
      qc.invalidateQueries({ queryKey: getListEmployeeLeaveRequestsQueryKey(approval.request.employeeId) });
      qc.invalidateQueries({
        queryKey: getListEmployeeLeaveEntitlementsQueryKey(approval.request.employeeId, { year: new Date().getFullYear() }),
      });
    }
  };

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0">
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <Users className="h-4 w-4 text-[#C5A059]" /> My team
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Team leave</h1>
          <p className="text-[#000033]/60 mt-1">Review and approve leave for your direct reports.</p>
        </header>

        <Card className="border-[#000033]/10 shrink-0 max-w-xs">
          <CardContent className="py-5">
            <div className="flex items-center gap-2">
              <Hourglass className="h-4 w-4 text-amber-600" />
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Awaiting your review</p>
            </div>
            <p className={`text-3xl font-serif mt-1 ${pendingCount ? "text-amber-700" : "text-[#000033]"}`} data-testid="text-team-pending">
              {pendingCount}
            </p>
          </CardContent>
        </Card>

        <div className="shrink-0 bg-white rounded-lg border border-[#000033]/10 shadow-sm p-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="bg-[#F8F7F4] border border-[#000033]/10">
              <TabsTrigger value="pending" data-testid="tab-team-pending">Pending</TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-team-all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : (data ?? []).length === 0 ? (
            <Card className="border-[#000033]/10">
              <CardContent className="py-16 text-center text-[#000033]/50">
                {tab === "pending" ? "No requests awaiting your review." : "No leave requests from your team yet."}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[#000033]/10">
              <CardContent className="p-0 divide-y divide-[#000033]/5">
                {(data ?? []).map((r) => (
                  <div key={r.id} className="px-4 py-3 flex items-start gap-3" data-testid={`row-team-leave-${r.id}`}>
                    <div className="mt-1 w-8 h-8 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                      <CalendarClock className="h-4 w-4 text-[#C5A059]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#000033]">{r.employeeName}</p>
                        {statusBadge(r.status)}
                        <Badge variant="outline" className="bg-white border-[#000033]/20 text-[#000033] text-[10px]">
                          {TYPE_LABEL[r.leaveType] ?? r.leaveType}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#000033]/60 mt-1">{r.employeeNumber} · {r.department}</p>
                      <p className="text-xs text-[#000033]/60 mt-1 tabular-nums">
                        {format(parseISO(r.startDate), "d MMM yyyy")} – {format(parseISO(r.endDate), "d MMM yyyy")} · {r.workingDays} working day{r.workingDays === 1 ? "" : "s"}
                      </p>
                      {r.reason && <p className="text-xs text-[#000033]/60 italic mt-1">"{r.reason}"</p>}
                    </div>
                    {r.status === "pending" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setApproval({ request: r, decision: "approved" })} data-testid={`button-team-approve-${r.id}`}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setApproval({ request: r, decision: "declined" })} data-testid={`button-team-decline-${r.id}`}>
                          Decline
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ApprovalDialog
        open={approval !== null}
        onOpenChange={(v) => !v && setApproval(null)}
        request={approval?.request ?? null}
        decision={approval?.decision ?? "approved"}
        onDone={invalidateAll}
      />
    </div>
  );
}

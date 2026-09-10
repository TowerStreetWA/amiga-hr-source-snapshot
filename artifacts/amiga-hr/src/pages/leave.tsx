import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plane, Users, Search, Hourglass, BadgeCheck } from "lucide-react";
import {
  useListLeaveRequests,
  useGetLeaveStats,
  getListLeaveRequestsQueryKey,
  getGetLeaveStatsQueryKey,
  getListEmployeeLeaveRequestsQueryKey,
  getListEmployeeLeaveEntitlementsQueryKey,
  type LeaveRequestWithEmployee,
} from "@workspace/api-client-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LeaveCalendar } from "@/components/leave/calendar";
import { ApprovalDialog } from "@/components/leave/approval-dialog";

type Tab = "all" | "calendar" | "pending";

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

export function Leave() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [approval, setApproval] = useState<{ request: LeaveRequestWithEmployee; decision: "approved" | "declined" } | null>(null);

  const apiStatus = tab === "pending" ? { status: "pending" } : {};
  const { data, isLoading } = useListLeaveRequests(apiStatus, {
    query: { queryKey: getListLeaveRequestsQueryKey(apiStatus) },
  });
  const { data: stats, isLoading: statsLoading } = useGetLeaveStats({
    query: { queryKey: getGetLeaveStatsQueryKey() },
  });

  const filtered = useMemo(() => {
    return (data ?? []).filter((r) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return `${r.employeeName} ${r.employeeNumber} ${r.department} ${TYPE_LABEL[r.leaveType] ?? r.leaveType}`.toLowerCase().includes(q);
    });
  }, [data, search]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetLeaveStatsQueryKey() });
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
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0">
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <CalendarClock className="h-4 w-4 text-[#C5A059]" /> People Operations
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Leave</h1>
          <p className="text-[#000033]/60 mt-1">Annual leave, parental leave and other absences across the firm.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <div className="flex items-center gap-2">
                <Hourglass className="h-4 w-4 text-amber-600" />
                <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Pending requests</p>
              </div>
              {statsLoading ? <Skeleton className="h-8 w-12 mt-1" /> : (
                <p className={`text-3xl font-serif mt-1 ${stats?.pendingRequests ? "text-amber-700" : "text-[#000033]"}`} data-testid="text-stat-pending-leave">
                  {stats?.pendingRequests ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <div className="flex items-center gap-2">
                <Plane className="h-4 w-4 text-sky-600" />
                <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Off today</p>
              </div>
              {statsLoading ? <Skeleton className="h-8 w-12 mt-1" /> : (
                <p className={`text-3xl font-serif mt-1 ${stats?.offTodayCount ? "text-sky-700" : "text-[#000033]"}`} data-testid="text-stat-off-today">
                  {stats?.offTodayCount ?? 0}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-emerald-600" />
                <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Approved this view</p>
              </div>
              <p className="text-3xl font-serif text-[#000033] mt-1 tabular-nums">
                {(data ?? []).filter((r) => r.status === "approved").length}
              </p>
            </CardContent>
          </Card>
        </div>

        {!statsLoading && stats?.offTodayCount ? (
          <Card className="border-sky-200 bg-sky-50 shrink-0">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-sky-700 shrink-0" />
              <div className="text-sm text-sky-900">
                <span className="font-semibold">{stats.offTodayCount} off today:</span>{" "}
                <span>{stats.offTodayNames.join(", ")}</span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="shrink-0 bg-white rounded-lg border border-[#000033]/10 shadow-sm p-4 space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="bg-[#F8F7F4] border border-[#000033]/10">
              <TabsTrigger value="all" data-testid="tab-leave-all">All</TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-leave-calendar">Calendar</TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-leave-pending">
                Pending{stats?.pendingRequests ? ` (${stats.pendingRequests})` : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {tab !== "calendar" && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#000033]/40" />
              <Input
                placeholder="Search by employee, ID, department, or type…"
                className="pl-9 border-[#000033]/20 focus-visible:ring-[#C5A059]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-leave-search"
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {tab === "calendar" ? (
            <LeaveCalendar />
          ) : isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-[#000033]/10">
              <CardContent className="py-16 text-center text-[#000033]/50">
                {tab === "pending" ? "No pending requests right now." : "No leave requests match these filters."}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[#000033]/10">
              <CardContent className="p-0 divide-y divide-[#000033]/5">
                {filtered.map((r) => (
                  <div key={r.id} className="px-4 py-3 flex items-start gap-3" data-testid={`row-leave-${r.id}`}>
                    <div className="mt-1 w-8 h-8 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                      <CalendarClock className="h-4 w-4 text-[#C5A059]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/employees/${r.employeeId}?tab=leave`}>
                          <p className="text-sm font-medium text-[#000033] hover:underline cursor-pointer">{r.employeeName}</p>
                        </Link>
                        {statusBadge(r.status)}
                        <Badge variant="outline" className="bg-white border-[#000033]/20 text-[#000033] text-[10px]">
                          {TYPE_LABEL[r.leaveType] ?? r.leaveType}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#000033]/60 mt-1">
                        {r.employeeNumber} · {r.department}
                      </p>
                      <p className="text-xs text-[#000033]/60 mt-1 tabular-nums">
                        {format(parseISO(r.startDate), "d MMM yyyy")} – {format(parseISO(r.endDate), "d MMM yyyy")} · {r.workingDays} working day{r.workingDays === 1 ? "" : "s"}
                      </p>
                      {r.reason && <p className="text-xs text-[#000033]/60 italic mt-1">"{r.reason}"</p>}
                    </div>
                    {r.status === "pending" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setApproval({ request: r, decision: "approved" })} data-testid={`button-hub-approve-${r.id}`}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setApproval({ request: r, decision: "declined" })} data-testid={`button-hub-decline-${r.id}`}>
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

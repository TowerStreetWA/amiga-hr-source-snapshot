import { useState } from "react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, CalendarDays } from "lucide-react";
import {
  useListEmployeeLeaveRequests,
  useListEmployeeLeaveEntitlements,
  useUpdateLeaveRequest,
  getListEmployeeLeaveRequestsQueryKey,
  getListEmployeeLeaveEntitlementsQueryKey,
  type LeaveRequest,
} from "@workspace/api-client-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { LeaveCalendar } from "@/components/leave/calendar";
import { AddLeaveRequestDialog } from "@/components/leave/add-request-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";

type Tab = "requests" | "calendar";

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

function NotLinked() {
  return (
    <div className="flex-1 p-8 bg-[#F8F7F4]">
      <div className="max-w-3xl mx-auto">
        <Card className="border-[#000033]/10">
          <CardContent className="py-16 text-center text-[#000033]/60">
            Your login isn&apos;t linked to an employee record yet, so there is no
            leave to show. Please contact HR.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function MyLeave() {
  const { employeeId } = useCurrentUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("requests");
  const [addOpen, setAddOpen] = useState(false);
  const year = new Date().getFullYear();

  const cancel = useUpdateLeaveRequest();

  const id = employeeId ?? 0;
  const enabled = employeeId !== null;

  const { data: entitlements, isLoading: entLoading } = useListEmployeeLeaveEntitlements(
    id,
    { year },
    { query: { enabled, queryKey: getListEmployeeLeaveEntitlementsQueryKey(id, { year }) } },
  );
  const { data: requests, isLoading: reqLoading } = useListEmployeeLeaveRequests(id, {
    query: { enabled, queryKey: getListEmployeeLeaveRequestsQueryKey(id) },
  });

  if (employeeId === null) return <NotLinked />;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListEmployeeLeaveRequestsQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListEmployeeLeaveEntitlementsQueryKey(id, { year }) });
    qc.invalidateQueries({ queryKey: ["/api/leave/calendar"] });
  };

  const onCancel = (r: LeaveRequest) => {
    cancel.mutate(
      { requestId: r.id, data: { status: "cancelled" } },
      {
        onSuccess: () => {
          toast({ title: "Request cancelled" });
          invalidate();
        },
        onError: (err: any) =>
          toast({ title: "Could not cancel", description: err?.message ?? "Please try again", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
              <CalendarClock className="h-4 w-4 text-[#C5A059]" /> Self service
            </div>
            <h1 className="text-3xl font-serif text-[#000033] mt-1">My leave</h1>
            <p className="text-[#000033]/60 mt-1">Request time off and track your allowance.</p>
          </div>
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-[#000033] hover:bg-[#000033]/90 text-white shrink-0"
            data-testid="button-request-leave"
          >
            <Plus className="h-4 w-4 mr-2" /> Request leave
          </Button>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 shrink-0">
          {entLoading ? (
            [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)
          ) : (entitlements ?? []).length === 0 ? (
            <Card className="border-[#000033]/10 sm:col-span-4">
              <CardContent className="py-6 text-center text-sm text-[#000033]/50">
                No leave entitlements have been set up for {year} yet.
              </CardContent>
            </Card>
          ) : (
            (entitlements ?? []).map((e) => (
              <Card key={e.id} className="border-[#000033]/10">
                <CardContent className="py-5">
                  <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">
                    {TYPE_LABEL[e.leaveType] ?? e.leaveType}
                  </p>
                  <p className="text-3xl font-serif text-[#000033] mt-1 tabular-nums">{e.remainingDays}</p>
                  <p className="text-xs text-[#000033]/60 mt-1">
                    of {e.entitledDays + e.carriedOverDays} days · {e.usedDays} used
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="shrink-0 bg-white rounded-lg border border-[#000033]/10 shadow-sm p-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="bg-[#F8F7F4] border border-[#000033]/10">
              <TabsTrigger value="requests" data-testid="tab-my-requests">My requests</TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-my-calendar">
                <CalendarDays className="h-4 w-4 mr-1" /> Team calendar
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {tab === "calendar" ? (
            <LeaveCalendar linkEmployees={false} />
          ) : reqLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : (requests ?? []).length === 0 ? (
            <Card className="border-[#000033]/10">
              <CardContent className="py-16 text-center text-[#000033]/50">
                You haven&apos;t requested any leave yet.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[#000033]/10">
              <CardContent className="p-0 divide-y divide-[#000033]/5">
                {(requests ?? []).map((r) => (
                  <div key={r.id} className="px-4 py-3 flex items-start gap-3" data-testid={`row-my-leave-${r.id}`}>
                    <div className="mt-1 w-8 h-8 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                      <CalendarClock className="h-4 w-4 text-[#C5A059]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(r.status)}
                        <Badge variant="outline" className="bg-white border-[#000033]/20 text-[#000033] text-[10px]">
                          {TYPE_LABEL[r.leaveType] ?? r.leaveType}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#000033]/60 mt-1 tabular-nums">
                        {format(parseISO(r.startDate), "d MMM yyyy")} – {format(parseISO(r.endDate), "d MMM yyyy")} · {r.workingDays} working day{r.workingDays === 1 ? "" : "s"}
                      </p>
                      {r.reason && <p className="text-xs text-[#000033]/60 italic mt-1">"{r.reason}"</p>}
                      {r.reviewerNote && (
                        <p className="text-xs text-[#000033]/60 mt-1">HR note: {r.reviewerNote}</p>
                      )}
                    </div>
                    {r.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50 shrink-0"
                        disabled={cancel.isPending}
                        onClick={() => onCancel(r)}
                        data-testid={`button-cancel-leave-${r.id}`}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AddLeaveRequestDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        employeeId={id}
        onCreated={invalidate}
      />
    </div>
  );
}

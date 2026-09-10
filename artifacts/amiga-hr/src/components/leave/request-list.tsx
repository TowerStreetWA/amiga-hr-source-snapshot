import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, Plane, CalendarClock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEmployeeLeaveRequests,
  useDeleteLeaveRequest,
  getListEmployeeLeaveRequestsQueryKey,
  getListLeaveRequestsQueryKey,
  getGetLeaveStatsQueryKey,
  getListEmployeeLeaveEntitlementsQueryKey,
  type LeaveRequest,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { EntitlementCard } from "./entitlement-card";
import { AddLeaveRequestDialog } from "./add-request-dialog";
import { ApprovalDialog } from "./approval-dialog";

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
    case "approved":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Approved</Badge>;
    case "declined":
      return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Declined</Badge>;
    case "cancelled":
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Cancelled</Badge>;
    default:
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>;
  }
}

export function LeaveRequestList({ employeeId }: { employeeId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [approval, setApproval] = useState<{ request: LeaveRequest; decision: "approved" | "declined" } | null>(null);

  const { data, isLoading } = useListEmployeeLeaveRequests(employeeId, {
    query: { queryKey: getListEmployeeLeaveRequestsQueryKey(employeeId) },
  });
  const remove = useDeleteLeaveRequest();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListEmployeeLeaveRequestsQueryKey(employeeId) });
    qc.invalidateQueries({ queryKey: getListLeaveRequestsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetLeaveStatsQueryKey() });
    qc.invalidateQueries({ queryKey: getListEmployeeLeaveEntitlementsQueryKey(employeeId, { year: new Date().getFullYear() }) });
    qc.invalidateQueries({ queryKey: ["/api/leave/calendar"] });
  };

  return (
    <div className="space-y-6">
      <EntitlementCard employeeId={employeeId} />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-[#000033]">Leave requests</h3>
          <p className="text-sm text-[#000033]/60">Submitted bookings, with current approval status.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-[#000033] hover:bg-[#000033]/90 text-white" data-testid="button-add-leave-request">
          <Plus className="h-4 w-4 mr-2" /> Request leave
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : (data ?? []).length === 0 ? (
        <Card className="border-[#000033]/10">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-[#000033]/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plane className="h-8 w-8 text-[#000033]/20" />
            </div>
            <p className="text-[#000033]/50">No leave requests yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-[#000033]/10">
          <CardContent className="p-0 divide-y divide-[#000033]/5">
            {(data ?? []).map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-start gap-3" data-testid={`row-leave-request-${r.id}`}>
                <div className="mt-1 w-8 h-8 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                  <CalendarClock className="h-4 w-4 text-[#C5A059]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[#000033]">{TYPE_LABEL[r.leaveType] ?? r.leaveType}</p>
                    {statusBadge(r.status)}
                    <Badge variant="outline" className="bg-white border-[#000033]/20 text-[#000033] text-[10px]">
                      {r.workingDays} day{r.workingDays === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#000033]/60 mt-1 tabular-nums">
                    {format(parseISO(r.startDate), "d MMM yyyy")} – {format(parseISO(r.endDate), "d MMM yyyy")}
                  </p>
                  {r.reason && <p className="text-xs text-[#000033]/60 italic mt-1">"{r.reason}"</p>}
                  {r.reviewerNote && (
                    <p className="text-xs text-[#000033]/50 mt-1">
                      Reviewer: {r.reviewerNote}{r.reviewedBy ? ` — ${r.reviewedBy}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50" onClick={() => setApproval({ request: r, decision: "approved" })} data-testid={`button-approve-${r.id}`}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setApproval({ request: r, decision: "declined" })} data-testid={`button-decline-${r.id}`}>
                        Decline
                      </Button>
                    </>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-[#000033]/40 hover:text-rose-600"
                    onClick={() =>
                      remove.mutate(
                        { requestId: r.id },
                        {
                          onSuccess: () => { invalidateAll(); toast({ title: "Request deleted" }); },
                          onError: () => toast({ title: "Could not delete", variant: "destructive" }),
                        },
                      )
                    }
                    data-testid={`button-delete-leave-${r.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AddLeaveRequestDialog open={addOpen} onOpenChange={setAddOpen} employeeId={employeeId} onCreated={invalidateAll} />
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

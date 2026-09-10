import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { useUpdateLeaveRequest, type LeaveRequestWithEmployee, type LeaveRequest } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/use-current-user";

const TYPE_LABEL: Record<string, string> = {
  annual: "Annual leave",
  maternity: "Maternity",
  paternity: "Paternity",
  compassionate: "Compassionate",
  study: "Study",
  unpaid: "Unpaid",
};

type Decision = "approved" | "declined";

export function ApprovalDialog({
  open,
  onOpenChange,
  request,
  decision,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: LeaveRequestWithEmployee | LeaveRequest | null;
  decision: Decision;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const update = useUpdateLeaveRequest();
  const [note, setNote] = useState("");

  useEffect(() => { if (open) setNote(""); }, [open]);

  if (!request) return null;
  const employeeName = "employeeName" in request ? request.employeeName : `Employee #${request.employeeId}`;

  const reviewerName = user?.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
    : user?.email ?? "Admin";

  const submit = () => {
    update.mutate(
      {
        requestId: request.id,
        data: {
          status: decision,
          reviewerNote: note.trim() || undefined,
          reviewedBy: reviewerName,
        },
      },
      {
        onSuccess: () => {
          toast({ title: decision === "approved" ? "Request approved" : "Request declined" });
          onOpenChange(false);
          onDone();
        },
        onError: () => toast({ title: "Could not update request", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] border-[#000033]/10">
        <DialogHeader>
          <DialogTitle className="font-serif text-[#000033]">
            {decision === "approved" ? "Approve leave request" : "Decline leave request"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-[#F8F7F4] border border-[#000033]/10 rounded-md p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="font-medium text-[#000033]">{employeeName}</p>
              <Badge variant="outline" className="bg-white border-[#000033]/20 text-[#000033]">
                {TYPE_LABEL[request.leaveType] ?? request.leaveType}
              </Badge>
            </div>
            <p className="text-sm text-[#000033]/70">
              {format(parseISO(request.startDate), "d MMM yyyy")} – {format(parseISO(request.endDate), "d MMM yyyy")}
              {" · "}
              <span className="font-medium">{request.workingDays} working day{request.workingDays === 1 ? "" : "s"}</span>
            </p>
            {request.reason && <p className="text-xs text-[#000033]/60 italic">"{request.reason}"</p>}
          </div>
          <div>
            <Label htmlFor="approval-note">Reviewer note (optional)</Label>
            <Textarea
              id="approval-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
              rows={3}
              data-testid="input-approval-note"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#000033]/20">Cancel</Button>
          <Button
            onClick={submit}
            disabled={update.isPending}
            className={
              decision === "approved"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-rose-600 hover:bg-rose-700 text-white"
            }
            data-testid={`button-confirm-${decision}`}
          >
            {update.isPending
              ? "Saving..."
              : decision === "approved" ? "Approve" : "Decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

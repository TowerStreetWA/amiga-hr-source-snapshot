import { useState } from "react";
import { useCreateLeaveRequest, CreateLeaveRequestBodyLeaveType } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const TYPE_OPTIONS: { value: CreateLeaveRequestBodyLeaveType; label: string }[] = [
  { value: "annual", label: "Annual leave" },
  { value: "maternity", label: "Maternity" },
  { value: "paternity", label: "Paternity" },
  { value: "compassionate", label: "Compassionate" },
  { value: "study", label: "Study" },
  { value: "unpaid", label: "Unpaid" },
];

export function AddLeaveRequestDialog({
  open,
  onOpenChange,
  employeeId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: number;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateLeaveRequest();
  const [leaveType, setLeaveType] = useState<CreateLeaveRequestBodyLeaveType>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const reset = () => {
    setLeaveType("annual");
    setStartDate("");
    setEndDate("");
    setReason("");
  };

  const submit = () => {
    if (!startDate || !endDate) {
      toast({ title: "Start and end dates are required", variant: "destructive" });
      return;
    }
    if (endDate < startDate) {
      toast({ title: "End date must be on or after start date", variant: "destructive" });
      return;
    }
    create.mutate(
      {
        id: employeeId,
        data: { leaveType, startDate, endDate, reason: reason.trim() || undefined },
      },
      {
        onSuccess: () => {
          toast({ title: "Leave request submitted" });
          reset();
          onOpenChange(false);
          onCreated();
        },
        onError: (err: any) => toast({
          title: "Could not submit request",
          description: err?.message ?? "Please try again",
          variant: "destructive",
        }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px] border-[#000033]/10">
        <DialogHeader>
          <DialogTitle className="font-serif text-[#000033]">Request leave</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Type</Label>
            <Select value={leaveType} onValueChange={(v: CreateLeaveRequestBodyLeaveType) => setLeaveType(v)}>
              <SelectTrigger className="border-[#000033]/20" data-testid="select-leave-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="leave-start">Start date</Label>
              <Input
                id="leave-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
                data-testid="input-leave-start"
              />
            </div>
            <div>
              <Label htmlFor="leave-end">End date</Label>
              <Input
                id="leave-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
                data-testid="input-leave-end"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="leave-reason">Reason (optional)</Label>
            <Textarea
              id="leave-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#000033]/20">Cancel</Button>
          <Button onClick={submit} disabled={create.isPending} className="bg-[#000033] hover:bg-[#000033]/90 text-white" data-testid="button-create-leave-request">
            {create.isPending ? "Submitting..." : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useCreateSicknessAbsence } from "@workspace/api-client-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

export function AddSicknessDialog({
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
  const create = useCreateSicknessAbsence();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [selfCertified, setSelfCertified] = useState(true);
  const [fitNoteReceived, setFitNoteReceived] = useState(false);
  const [notes, setNotes] = useState("");

  const reset = () => {
    setStartDate("");
    setEndDate("");
    setReason("");
    setSelfCertified(true);
    setFitNoteReceived(false);
    setNotes("");
  };

  const submit = () => {
    if (!startDate) {
      toast({ title: "Start date is required", variant: "destructive" });
      return;
    }
    if (endDate && endDate < startDate) {
      toast({ title: "End date must be on or after start date", variant: "destructive" });
      return;
    }
    create.mutate(
      {
        id: employeeId,
        data: {
          startDate,
          endDate: endDate || null,
          reason: reason.trim() || null,
          selfCertified,
          fitNoteReceived,
          notes: notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Sickness absence recorded" });
          reset();
          onOpenChange(false);
          onCreated();
        },
        onError: () => toast({ title: "Could not record absence", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px] border-[#000033]/10">
        <DialogHeader>
          <DialogTitle className="font-serif text-[#000033]">Record sickness absence</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sick-start">Start date</Label>
              <Input
                id="sick-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
                data-testid="input-sick-start"
              />
            </div>
            <div>
              <Label htmlFor="sick-end">End date (leave blank if ongoing)</Label>
              <Input
                id="sick-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
                data-testid="input-sick-end"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="sick-reason">Reason</Label>
            <Input
              id="sick-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Flu, migraine, back pain"
              className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
              data-testid="input-sick-reason"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm text-[#000033]">
              <Checkbox checked={selfCertified} onCheckedChange={(v) => setSelfCertified(v === true)} data-testid="checkbox-self-certified" />
              Self-certified (≤7 days)
            </label>
            <label className="flex items-center gap-2 text-sm text-[#000033]">
              <Checkbox checked={fitNoteReceived} onCheckedChange={(v) => setFitNoteReceived(v === true)} data-testid="checkbox-fit-note" />
              Fit note received
            </label>
          </div>
          <div>
            <Label htmlFor="sick-notes">Notes (optional)</Label>
            <Textarea
              id="sick-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#000033]/20">Cancel</Button>
          <Button onClick={submit} disabled={create.isPending} className="bg-[#000033] hover:bg-[#000033]/90 text-white" data-testid="button-create-sickness">
            {create.isPending ? "Saving..." : "Record absence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

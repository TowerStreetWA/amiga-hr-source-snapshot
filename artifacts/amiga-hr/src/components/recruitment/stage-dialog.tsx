import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useChangeCandidateStage,
  getListCandidatesQueryKey,
  getGetCandidateQueryKey,
  getGetRecruitmentStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ALL_STAGES, STAGE_LABELS, type Stage } from "@/lib/recruitment";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidateId: number | null;
  currentStage: Stage | null;
  candidateName: string;
};

export function StageDialog({
  open,
  onOpenChange,
  candidateId,
  currentStage,
  candidateName,
}: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("new");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open && currentStage) {
      setStage(currentStage);
      setNote("");
      setReason("");
    }
  }, [open, currentStage]);

  const change = useChangeCandidateStage({
    mutation: {
      onSuccess: () => {
        if (candidateId) {
          qc.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidateId) });
        }
        qc.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRecruitmentStatsQueryKey() });
        toast({ title: "Stage updated", description: `${candidateName} moved to ${STAGE_LABELS[stage]}.` });
        onOpenChange(false);
      },
    },
  });

  function submit() {
    if (!candidateId) return;
    change.mutate({
      id: candidateId,
      data: {
        toStage: stage,
        note: note || undefined,
        rejectedReason: stage === "rejected" ? reason || undefined : undefined,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-[#000033]">Move candidate</DialogTitle>
          <DialogDescription>
            Change the stage for {candidateName}. The history is recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>New stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Note (optional)</Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Brief note for the audit trail"
            />
          </div>
          {stage === "rejected" && (
            <div className="grid gap-2">
              <Label>Reason for rejection</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Capture why so future searches can learn"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={change.isPending}
            className="bg-[#000033] text-white hover:bg-[#000033]/90"
          >
            Move candidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

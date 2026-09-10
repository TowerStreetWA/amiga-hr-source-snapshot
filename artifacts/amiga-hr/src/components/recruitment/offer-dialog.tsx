import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateOffer,
  getGetCandidateQueryKey,
  getListOffersQueryKey,
  getListCandidatesQueryKey,
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
import { Input } from "@/components/ui/input";
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

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidateId: number;
  defaultSalary?: number | null;
};

function defaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function OfferDialog({ open, onOpenChange, candidateId, defaultSalary }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [employmentType, setEmploymentType] = useState<"full_time" | "part_time" | "contractor">(
    "full_time",
  );
  const [contractType, setContractType] = useState<"permanent" | "fixed_term" | "contract">(
    "permanent",
  );
  const [benefits, setBenefits] = useState(
    "25 days holiday + bank, pension match to 5%, private medical",
  );
  const [status, setStatus] = useState<"draft" | "sent">("sent");

  useEffect(() => {
    if (open) {
      setSalary(defaultSalary ? String(defaultSalary) : "");
      setStartDate(defaultStartDate());
      setEmploymentType("full_time");
      setContractType("permanent");
      setStatus("sent");
    }
  }, [open, defaultSalary]);

  const create = useCreateOffer({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCandidateQueryKey(candidateId) });
        qc.invalidateQueries({ queryKey: getListOffersQueryKey(candidateId) });
        qc.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRecruitmentStatsQueryKey() });
        toast({ title: "Offer created", description: status === "sent" ? "Marked as sent." : "Saved as draft." });
        onOpenChange(false);
      },
    },
  });

  function submit() {
    create.mutate({
      id: candidateId,
      data: {
        salary: Number(salary),
        currency: "GBP",
        startDate,
        employmentType,
        contractType,
        benefitsNote: benefits || null,
        status,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl text-[#000033]">Create offer</DialogTitle>
          <DialogDescription>Generate an offer for this candidate.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Salary (£)</Label>
              <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Employment type</Label>
              <Select
                value={employmentType}
                onValueChange={(v) => setEmploymentType(v as typeof employmentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Contract</Label>
              <Select
                value={contractType}
                onValueChange={(v) => setContractType(v as typeof contractType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="fixed_term">Fixed term</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Benefits</Label>
            <Textarea
              rows={3}
              value={benefits}
              onChange={(e) => setBenefits(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft (not sent)</SelectItem>
                <SelectItem value="sent">Sent to candidate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!salary || create.isPending}
            className="bg-[#000033] text-white hover:bg-[#000033]/90"
          >
            Create offer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

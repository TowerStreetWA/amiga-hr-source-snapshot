import { useEffect, useState } from "react";
import {
  useCreateTrainingRecord,
  useUpdateTrainingRecord,
  TrainingRecordCategory,
  TrainingRecordStatus,
  type TrainingRecord,
} from "@workspace/api-client-react";
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

const CATEGORY_OPTIONS: { value: TrainingRecordCategory; label: string }[] = [
  { value: "mandatory", label: "Mandatory" },
  { value: "professional", label: "Professional" },
  { value: "technical", label: "Technical" },
  { value: "soft_skills", label: "Soft skills" },
  { value: "compliance", label: "Compliance" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS: { value: TrainingRecordStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "expired", label: "Expired" },
];

export function AddRecordDialog({
  open,
  onOpenChange,
  employeeId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: number;
  editing: TrainingRecord | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateTrainingRecord();
  const update = useUpdateTrainingRecord();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<TrainingRecordCategory>("professional");
  const [status, setStatus] = useState<TrainingRecordStatus>("pending");
  const [provider, setProvider] = useState("");
  const [completedDate, setCompletedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setCategory((editing?.category ?? "professional") as TrainingRecordCategory);
      setStatus((editing?.status ?? "pending") as TrainingRecordStatus);
      setProvider(editing?.provider ?? "");
      setCompletedDate(editing?.completedDate ?? "");
      setExpiryDate(editing?.expiryDate ?? "");
      setCost(editing?.cost != null ? String(editing.cost) : "");
      setNotes(editing?.notes ?? "");
    }
  }, [open, editing]);

  const submit = () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const payload = {
      name: name.trim(),
      category,
      status,
      provider: provider.trim() || undefined,
      completedDate: completedDate || undefined,
      expiryDate: expiryDate || undefined,
      cost: cost ? Number(cost) : undefined,
      notes: notes.trim() || undefined,
    };
    if (editing) {
      update.mutate(
        { recordId: editing.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Training updated" }); onOpenChange(false); onSaved(); },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        },
      );
    } else {
      create.mutate(
        { id: employeeId, data: payload },
        {
          onSuccess: () => { toast({ title: "Training added" }); onOpenChange(false); onSaved(); },
          onError: () => toast({ title: "Could not add training", variant: "destructive" }),
        },
      );
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] border-[#000033]/10">
        <DialogHeader>
          <DialogTitle className="font-serif text-[#000033]">
            {editing ? "Update training record" : "Add training record"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="t-name">Course / programme</Label>
            <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} className="border-[#000033]/20 focus-visible:ring-[#C5A059]" data-testid="input-training-name" disabled={!!editing?.isMandatory} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v: TrainingRecordCategory) => setCategory(v)}>
                <SelectTrigger className="border-[#000033]/20" data-testid="select-training-category"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v: TrainingRecordStatus) => setStatus(v)}>
                <SelectTrigger className="border-[#000033]/20" data-testid="select-training-status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="t-completed">Completed date</Label>
              <Input id="t-completed" type="date" value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} className="border-[#000033]/20 focus-visible:ring-[#C5A059]" />
            </div>
            <div>
              <Label htmlFor="t-expiry">Expiry date</Label>
              <Input id="t-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="border-[#000033]/20 focus-visible:ring-[#C5A059]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="t-provider">Provider</Label>
              <Input id="t-provider" value={provider} onChange={(e) => setProvider(e.target.value)} className="border-[#000033]/20 focus-visible:ring-[#C5A059]" />
            </div>
            <div>
              <Label htmlFor="t-cost">Cost (GBP)</Label>
              <Input id="t-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="border-[#000033]/20 focus-visible:ring-[#C5A059]" />
            </div>
          </div>
          <div>
            <Label htmlFor="t-notes">Notes</Label>
            <Textarea id="t-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="border-[#000033]/20 focus-visible:ring-[#C5A059]" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#000033]/20">Cancel</Button>
          <Button onClick={submit} disabled={isPending} className="bg-[#000033] hover:bg-[#000033]/90 text-white" data-testid="button-save-training">
            {isPending ? "Saving..." : (editing ? "Save changes" : "Add training")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateBenefit,
  useUpdateBenefit,
  getListBenefitsQueryKey,
  type BenefitCatalog,
  CreateBenefitBodyCategory,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES: { value: keyof typeof CreateBenefitBodyCategory; label: string }[] = [
  { value: "pension", label: "Pension" },
  { value: "health", label: "Health Insurance" },
  { value: "life_assurance", label: "Life Assurance" },
  { value: "income_protection", label: "Income Protection" },
  { value: "dental", label: "Dental" },
  { value: "allowance", label: "Allowance" },
  { value: "other", label: "Other" },
];

export function BenefitFormDialog({
  open,
  onOpenChange,
  benefit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  benefit?: BenefitCatalog | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateBenefit();
  const update = useUpdateBenefit();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<keyof typeof CreateBenefitBodyCategory>("pension");
  const [provider, setProvider] = useState("");
  const [description, setDescription] = useState("");
  const [defaultAnnualValue, setDefaultAnnualValue] = useState<string>("");

  useEffect(() => {
    if (open) {
      setName(benefit?.name ?? "");
      setCategory((benefit?.category as keyof typeof CreateBenefitBodyCategory) ?? "pension");
      setProvider(benefit?.provider ?? "");
      setDescription(benefit?.description ?? "");
      setDefaultAnnualValue(
        benefit?.defaultAnnualValue !== null && benefit?.defaultAnnualValue !== undefined
          ? String(benefit.defaultAnnualValue)
          : "",
      );
    }
  }, [open, benefit]);

  const submit = () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    const payload = {
      name: name.trim(),
      category: CreateBenefitBodyCategory[category],
      provider: provider.trim() || null,
      description: description.trim() || null,
      defaultAnnualValue: defaultAnnualValue ? Number(defaultAnnualValue) : null,
    };
    const onSuccess = () => {
      toast({ title: benefit ? "Benefit updated" : "Benefit added" });
      qc.invalidateQueries({ queryKey: getListBenefitsQueryKey() });
      onOpenChange(false);
    };
    const onError = () =>
      toast({ title: "Save failed", variant: "destructive" });

    if (benefit) {
      update.mutate({ benefitId: benefit.id, data: payload }, { onSuccess, onError });
    } else {
      create.mutate({ data: payload }, { onSuccess, onError });
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-[#000033]">
            {benefit ? "Edit Benefit" : "Add Benefit"}
          </DialogTitle>
          <DialogDescription>
            Catalogue benefits available to assign to employees.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="b-name">Name *</Label>
            <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-benefit-name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="b-cat">Category *</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as keyof typeof CreateBenefitBodyCategory)}
              >
                <SelectTrigger id="b-cat" data-testid="select-benefit-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="b-provider">Provider</Label>
              <Input id="b-provider" value={provider} onChange={(e) => setProvider(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-value">Default Annual Value (£)</Label>
            <Input
              id="b-value"
              type="number"
              step="1"
              value={defaultAnnualValue}
              onChange={(e) => setDefaultAnnualValue(e.target.value)}
              data-testid="input-benefit-value"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-desc">Description</Label>
            <Textarea
              id="b-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending}
            className="bg-[#000033] hover:bg-[#000033]/90 text-white"
            data-testid="button-save-benefit"
          >
            {pending ? "Saving…" : benefit ? "Save" : "Add Benefit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

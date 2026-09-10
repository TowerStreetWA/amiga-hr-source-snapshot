import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, Award, FileText } from "lucide-react";
import {
  useListEmployeeBenefits,
  useListBenefits,
  useCreateEmployeeBenefit,
  useDeleteEmployeeBenefit,
  getListEmployeeBenefitsQueryKey,
  getGetTotalRewardQueryKey,
  getListBenefitsQueryKey,
  type EmployeeBenefitWithCatalog,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { TotalRewardDialog } from "./total-reward-statement";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const CATEGORY_LABEL: Record<string, string> = {
  pension: "Pension",
  health: "Health",
  life_assurance: "Life Assurance",
  income_protection: "Income Protection",
  dental: "Dental",
  allowance: "Allowance",
  other: "Other",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function EmployeeBenefitsTab({ employeeId }: { employeeId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: rows, isLoading } = useListEmployeeBenefits(employeeId, {
    query: { queryKey: getListEmployeeBenefitsQueryKey(employeeId) },
  });
  const { data: catalog } = useListBenefits({
    query: { queryKey: getListBenefitsQueryKey() },
  });

  const create = useCreateEmployeeBenefit();
  const remove = useDeleteEmployeeBenefit();

  const [addOpen, setAddOpen] = useState(false);
  const [trsOpen, setTrsOpen] = useState(false);
  const [deleting, setDeleting] = useState<EmployeeBenefitWithCatalog | null>(null);

  // Add form state
  const [benefitId, setBenefitId] = useState<string>("");
  const [employerContribution, setEmployerContribution] = useState<string>("");
  const [employeeContribution, setEmployeeContribution] = useState<string>("");
  const [annualValue, setAnnualValue] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [endDate, setEndDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const openAdd = () => {
    setBenefitId("");
    setEmployerContribution("");
    setEmployeeContribution("");
    setAnnualValue("");
    setStartDate(todayIso());
    setEndDate("");
    setNotes("");
    setAddOpen(true);
  };

  const onPickBenefit = (id: string) => {
    setBenefitId(id);
    const b = catalog?.find((c) => String(c.id) === id);
    if (b?.defaultAnnualValue !== null && b?.defaultAnnualValue !== undefined) {
      setAnnualValue(String(b.defaultAnnualValue));
      setEmployerContribution(String(b.defaultAnnualValue));
    }
  };

  const submitAdd = () => {
    if (!benefitId) {
      toast({ title: "Pick a benefit", variant: "destructive" });
      return;
    }
    create.mutate(
      {
        id: employeeId,
        data: {
          benefitId: Number(benefitId),
          employerContribution: employerContribution ? Number(employerContribution) : null,
          employeeContribution: employeeContribution ? Number(employeeContribution) : null,
          annualValue: annualValue ? Number(annualValue) : null,
          startDate: startDate || null,
          endDate: endDate || null,
          notes: notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Benefit assigned" });
          qc.invalidateQueries({ queryKey: getListEmployeeBenefitsQueryKey(employeeId) });
          qc.invalidateQueries({ queryKey: getGetTotalRewardQueryKey(employeeId) });
          setAddOpen(false);
        },
        onError: () => toast({ title: "Could not assign benefit", variant: "destructive" }),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(
      { employeeBenefitId: deleting.id },
      {
        onSuccess: () => {
          toast({ title: "Benefit removed" });
          qc.invalidateQueries({ queryKey: getListEmployeeBenefitsQueryKey(employeeId) });
          qc.invalidateQueries({ queryKey: getGetTotalRewardQueryKey(employeeId) });
          setDeleting(null);
        },
        onError: () =>
          toast({ title: "Could not remove benefit", variant: "destructive" }),
      },
    );
  };

  const totalValue = (rows ?? []).reduce((s, r) => s + (r.annualValue ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif text-[#000033]">Employee Benefits</h2>
          <p className="text-sm text-[#000033]/60">
            Total annual value:{" "}
            <span className="font-semibold tabular-nums text-[#000033]">
              {GBP.format(totalValue)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setTrsOpen(true)}
            className="border-[#000033]/20 text-[#000033]"
            data-testid="button-total-reward"
          >
            <FileText className="h-4 w-4 mr-2" />
            Total Reward Statement
          </Button>
          <Button
            onClick={openAdd}
            className="bg-[#000033] hover:bg-[#000033]/90 text-white"
            data-testid="button-add-employee-benefit"
          >
            <Plus className="h-4 w-4 mr-2" />
            Assign Benefit
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <Card className="border-dashed border-[#000033]/20">
          <CardContent className="p-12 text-center">
            <Award className="h-10 w-10 text-[#000033]/30 mx-auto mb-3" />
            <p className="text-[#000033]/60">No benefits assigned to this employee yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((b) => (
            <Card
              key={b.id}
              className="border-[#000033]/10 shadow-sm"
              data-testid={`employee-benefit-${b.id}`}
            >
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#000033]">{b.name}</span>
                    <Badge variant="outline" className="text-xs border-[#000033]/20 text-[#000033]/70">
                      {CATEGORY_LABEL[b.category] ?? b.category}
                    </Badge>
                    {b.endDate && parseISO(b.endDate) < new Date() && (
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200">Ended</Badge>
                    )}
                  </div>
                  <div className="text-xs text-[#000033]/60 mt-1 space-x-3">
                    {b.provider && <span>{b.provider}</span>}
                    <span>From {format(parseISO(b.startDate), "d MMM yyyy")}</span>
                    {b.endDate && <span>to {format(parseISO(b.endDate), "d MMM yyyy")}</span>}
                  </div>
                  {b.notes && (
                    <p className="text-xs text-[#000033]/60 mt-2 italic">{b.notes}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-[#000033]/50 font-semibold">
                    Annual Value
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-[#000033]">
                    {GBP.format(b.annualValue)}
                  </p>
                  <p className="text-[10px] text-[#000033]/50">
                    Employer: {GBP.format(b.employerContribution)}
                    {b.employeeContribution > 0 ? ` · You: ${GBP.format(b.employeeContribution)}` : ""}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleting(b)}
                  className="text-[#000033]/60 hover:text-rose-700"
                  data-testid={`button-remove-benefit-${b.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-[#000033]">Assign Benefit</DialogTitle>
            <DialogDescription>Pick a benefit from the catalogue and set values.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="eb-benefit">Benefit *</Label>
              <Select value={benefitId} onValueChange={onPickBenefit}>
                <SelectTrigger id="eb-benefit" data-testid="select-employee-benefit">
                  <SelectValue placeholder="Choose a benefit" />
                </SelectTrigger>
                <SelectContent>
                  {(catalog ?? []).filter((c) => c.isActive).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} {c.provider ? `· ${c.provider}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="eb-employer">Employer Contribution (£)</Label>
                <Input
                  id="eb-employer"
                  type="number"
                  value={employerContribution}
                  onChange={(e) => setEmployerContribution(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="eb-employee">Employee Contribution (£)</Label>
                <Input
                  id="eb-employee"
                  type="number"
                  value={employeeContribution}
                  onChange={(e) => setEmployeeContribution(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="eb-value">Annual Value (£)</Label>
              <Input
                id="eb-value"
                type="number"
                value={annualValue}
                onChange={(e) => setAnnualValue(e.target.value)}
                data-testid="input-employee-benefit-value"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="eb-start">Start Date</Label>
                <Input
                  id="eb-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="eb-end">End Date</Label>
                <Input
                  id="eb-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="eb-notes">Notes</Label>
              <Input id="eb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitAdd}
              disabled={create.isPending}
              className="bg-[#000033] hover:bg-[#000033]/90 text-white"
              data-testid="button-save-employee-benefit"
            >
              {create.isPending ? "Saving…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-[#000033]">
              Remove benefit?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} will no longer be assigned to this employee.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TotalRewardDialog open={trsOpen} onOpenChange={setTrsOpen} employeeId={employeeId} />
    </div>
  );
}

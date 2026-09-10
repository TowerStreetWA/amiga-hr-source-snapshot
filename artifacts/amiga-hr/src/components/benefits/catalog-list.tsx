import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  useListBenefits,
  useDeleteBenefit,
  getListBenefitsQueryKey,
  type BenefitCatalog,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { BenefitFormDialog } from "./benefit-form-dialog";

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

const CATEGORY_TONE: Record<string, string> = {
  pension: "bg-indigo-100 text-indigo-700 border-indigo-200",
  health: "bg-emerald-100 text-emerald-700 border-emerald-200",
  life_assurance: "bg-slate-100 text-slate-700 border-slate-200",
  income_protection: "bg-sky-100 text-sky-700 border-sky-200",
  dental: "bg-cyan-100 text-cyan-700 border-cyan-200",
  allowance: "bg-amber-100 text-amber-700 border-amber-200",
  other: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export function BenefitsCatalog() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListBenefits({
    query: { queryKey: getListBenefitsQueryKey() },
  });
  const del = useDeleteBenefit();

  const [editing, setEditing] = useState<BenefitCatalog | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<BenefitCatalog | null>(null);

  const onAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const onEdit = (b: BenefitCatalog) => {
    setEditing(b);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    del.mutate(
      { benefitId: deleting.id },
      {
        onSuccess: () => {
          toast({ title: "Benefit removed" });
          qc.invalidateQueries({ queryKey: getListBenefitsQueryKey() });
          setDeleting(null);
        },
        onError: (e) => {
          const msg =
            (e as unknown as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            "Could not delete benefit.";
          toast({ title: "Delete failed", description: msg, variant: "destructive" });
          setDeleting(null);
        },
      },
    );
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-[#000033]/60">{data?.length ?? 0} benefits in catalogue</p>
        </div>
        <Button
          onClick={onAdd}
          className="bg-[#000033] hover:bg-[#000033]/90 text-white"
          data-testid="button-add-benefit"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Benefit
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card className="border-dashed border-[#000033]/20">
          <CardContent className="p-12 text-center">
            <p className="text-[#000033]/60 mb-4">No benefits configured yet.</p>
            <Button onClick={onAdd} className="bg-[#000033] hover:bg-[#000033]/90 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Add your first benefit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((b) => (
            <Card
              key={b.id}
              className="border-[#000033]/10 shadow-sm hover:shadow-md transition-shadow"
              data-testid={`benefit-card-${b.id}`}
            >
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-[#000033]">{b.name}</h3>
                    {b.provider && (
                      <p className="text-xs text-[#000033]/60 mt-0.5">{b.provider}</p>
                    )}
                  </div>
                  <Badge className={CATEGORY_TONE[b.category] ?? CATEGORY_TONE.other}>
                    {CATEGORY_LABEL[b.category] ?? b.category}
                  </Badge>
                </div>
                {b.description && (
                  <p className="text-sm text-[#000033]/70 line-clamp-2">{b.description}</p>
                )}
                <div className="flex items-end justify-between pt-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#000033]/50 font-semibold">
                      Default Value
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-[#000033]">
                      {b.defaultAnnualValue !== null && b.defaultAnnualValue !== undefined
                        ? GBP.format(b.defaultAnnualValue)
                        : "—"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEdit(b)}
                      className="text-[#000033]/60 hover:text-[#000033]"
                      data-testid={`button-edit-benefit-${b.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleting(b)}
                      className="text-[#000033]/60 hover:text-rose-700"
                      data-testid={`button-delete-benefit-${b.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BenefitFormDialog open={formOpen} onOpenChange={setFormOpen} benefit={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-[#000033]">
              Remove “{deleting?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The benefit will be removed from the catalogue. Benefits already assigned to
              employees cannot be deleted.
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
    </>
  );
}

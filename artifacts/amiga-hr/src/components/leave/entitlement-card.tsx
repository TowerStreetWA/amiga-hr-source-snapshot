import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Edit2 } from "lucide-react";
import {
  useListEmployeeLeaveEntitlements,
  useUpsertEmployeeLeaveEntitlement,
  useSeedEmployeeLeaveDefaults,
  getListEmployeeLeaveEntitlementsQueryKey,
  type LeaveEntitlement,
  type LeaveEntitlementLeaveType,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const TYPE_LABEL: Record<LeaveEntitlementLeaveType, string> = {
  annual: "Annual",
  maternity: "Maternity",
  paternity: "Paternity",
  compassionate: "Compassionate",
  study: "Study",
  unpaid: "Unpaid",
};

const TYPE_ORDER: LeaveEntitlementLeaveType[] = [
  "annual", "compassionate", "study", "maternity", "paternity", "unpaid",
];

export function EntitlementCard({ employeeId }: { employeeId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const year = new Date().getFullYear();
  const [editing, setEditing] = useState<LeaveEntitlement | null>(null);
  const [editEntitled, setEditEntitled] = useState(0);
  const [editCarry, setEditCarry] = useState(0);

  const { data, isLoading } = useListEmployeeLeaveEntitlements(employeeId, { year }, {
    query: { queryKey: getListEmployeeLeaveEntitlementsQueryKey(employeeId, { year }) },
  });

  const seed = useSeedEmployeeLeaveDefaults();
  const upsert = useUpsertEmployeeLeaveEntitlement();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListEmployeeLeaveEntitlementsQueryKey(employeeId, { year }) });
  };

  const handleSeed = () => {
    seed.mutate(
      { id: employeeId, data: { year } },
      {
        onSuccess: () => { invalidate(); toast({ title: "Default entitlements seeded" }); },
        onError: () => toast({ title: "Could not seed defaults", variant: "destructive" }),
      },
    );
  };

  const openEdit = (e: LeaveEntitlement) => {
    setEditing(e);
    setEditEntitled(e.entitledDays);
    setEditCarry(e.carriedOverDays);
  };

  const saveEdit = () => {
    if (!editing) return;
    upsert.mutate(
      {
        id: employeeId,
        leaveType: editing.leaveType,
        data: { year: editing.year, entitledDays: editEntitled, carriedOverDays: editCarry },
      },
      {
        onSuccess: () => {
          toast({ title: "Entitlement updated" });
          setEditing(null);
          invalidate();
        },
        onError: () => toast({ title: "Could not update entitlement", variant: "destructive" }),
      },
    );
  };

  if (isLoading) {
    return <Skeleton className="h-40" />;
  }

  const entitlements = (data ?? []).slice().sort((a, b) => TYPE_ORDER.indexOf(a.leaveType) - TYPE_ORDER.indexOf(b.leaveType));

  if (entitlements.length === 0) {
    return (
      <Card className="border-[#000033]/10">
        <CardContent className="py-12 text-center">
          <div className="w-16 h-16 bg-[#000033]/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-[#000033]/20" />
          </div>
          <h3 className="text-lg font-medium text-[#000033] mb-1">No entitlements set for {year}</h3>
          <p className="text-[#000033]/50 max-w-sm mx-auto mb-4">Seed the standard policy (annual 25, maternity 183, paternity 14, compassionate 5, study 5).</p>
          <Button onClick={handleSeed} disabled={seed.isPending} className="bg-[#000033] hover:bg-[#000033]/90 text-white" data-testid="button-seed-entitlements">
            <Sparkles className="h-4 w-4 mr-2" /> Seed default entitlements
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-[#000033]/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Entitlements · {year}</p>
              <p className="text-sm text-[#000033]/60">Working days remaining per leave category.</p>
            </div>
            <Button variant="outline" size="sm" className="border-[#000033]/20" onClick={handleSeed} disabled={seed.isPending}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Seed missing
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {entitlements.map((e) => {
              const total = e.entitledDays + e.carriedOverDays;
              const pct = total === 0 ? 0 : Math.min(100, Math.round((e.usedDays / total) * 100));
              return (
                <div key={e.id} className="border border-[#000033]/10 rounded-md p-3 bg-white" data-testid={`entitlement-${e.leaveType}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-[#000033]">{TYPE_LABEL[e.leaveType]}</p>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-[#000033]/40 hover:text-[#000033]" onClick={() => openEdit(e)} data-testid={`button-edit-entitlement-${e.leaveType}`}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-baseline justify-between text-xs mb-1.5">
                    <span className="text-[#000033]/60 tabular-nums">{e.usedDays} used / {total} total</span>
                    <span className="text-[#000033] font-semibold tabular-nums">{e.remainingDays}d left</span>
                  </div>
                  <Progress value={pct} className="h-1.5 [&>div]:bg-[#C5A059]" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-[420px] border-[#000033]/10">
          <DialogHeader>
            <DialogTitle className="font-serif text-[#000033]">
              Edit {editing ? TYPE_LABEL[editing.leaveType] : ""} entitlement
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ent-days">Entitled days</Label>
              <Input
                id="ent-days"
                type="number"
                min={0}
                value={editEntitled}
                onChange={(e) => setEditEntitled(Number(e.target.value))}
                className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
                data-testid="input-entitled-days"
              />
            </div>
            <div>
              <Label htmlFor="ent-carry">Carried over from previous year</Label>
              <Input
                id="ent-carry"
                type="number"
                min={0}
                value={editCarry}
                onChange={(e) => setEditCarry(Number(e.target.value))}
                className="border-[#000033]/20 focus-visible:ring-[#C5A059]"
                data-testid="input-carried-days"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="border-[#000033]/20">Cancel</Button>
            <Button onClick={saveEdit} disabled={upsert.isPending} className="bg-[#000033] hover:bg-[#000033]/90 text-white" data-testid="button-save-entitlement">
              {upsert.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

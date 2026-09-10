import { useState } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import { Plus, Trash2, GraduationCap, AlertCircle, ShieldCheck, Clock, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEmployeeTrainingRecords,
  useDeleteTrainingRecord,
  getListEmployeeTrainingRecordsQueryKey,
  getGetTrainingStatsQueryKey,
  getListAllTrainingRecordsQueryKey,
  type TrainingRecord,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AddRecordDialog } from "./add-record-dialog";

function statusBadge(status: string, expiryDate: string | null | undefined) {
  if (status === "completed" && expiryDate) {
    const days = differenceInDays(parseISO(expiryDate), new Date());
    if (days < 0) return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Expired</Badge>;
    if (days <= 60) return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Expiring in {days}d</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Valid</Badge>;
  }
  switch (status) {
    case "completed":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Completed</Badge>;
    case "in_progress":
      return <Badge className="bg-sky-100 text-sky-700 border-sky-200">In progress</Badge>;
    case "expired":
      return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Expired</Badge>;
    default:
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Pending</Badge>;
  }
}

export function TrainingRecordList({ employeeId }: { employeeId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingRecord | null>(null);

  const { data: records, isLoading } = useListEmployeeTrainingRecords(employeeId);
  const remove = useDeleteTrainingRecord();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListEmployeeTrainingRecordsQueryKey(employeeId) });
    qc.invalidateQueries({ queryKey: getGetTrainingStatsQueryKey() });
    qc.invalidateQueries({ queryKey: getListAllTrainingRecordsQueryKey() });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  const list = records ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => { setEditing(null); setAddOpen(true); }} className="bg-[#000033] hover:bg-[#000033]/90 text-white" data-testid="button-add-training">
          <Plus className="h-4 w-4 mr-2" /> Add training
        </Button>
      </div>

      {list.length === 0 ? (
        <Card className="border-[#000033]/10">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-[#000033]/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="h-8 w-8 text-[#000033]/20" />
            </div>
            <h3 className="text-lg font-medium text-[#000033] mb-1">No training on file</h3>
            <p className="text-[#000033]/50 max-w-sm mx-auto">Record completed and upcoming training to track expiries.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-[#000033]/10">
          <CardContent className="p-0 divide-y divide-[#000033]/5">
            {list.map((rec) => (
              <div key={rec.id} className="flex items-start gap-3 px-4 py-3" data-testid={`row-training-${rec.id}`}>
                <div className="mt-1 w-8 h-8 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                  {rec.isMandatory ? <ShieldCheck className="h-4 w-4 text-[#C5A059]" /> : <GraduationCap className="h-4 w-4 text-[#000033]/60" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[#000033]">{rec.name}</p>
                    {rec.isMandatory && (
                      <Badge variant="outline" className="bg-[#C5A059]/10 text-[#000033] border-[#C5A059]/30 text-[10px]">Mandatory</Badge>
                    )}
                    {statusBadge(rec.status, rec.expiryDate)}
                  </div>
                  <div className="text-xs text-[#000033]/60 mt-1 flex items-center gap-3 flex-wrap">
                    {rec.provider && <span>{rec.provider}</span>}
                    {rec.completedDate && <span><Clock className="h-3 w-3 inline mr-1" />Completed {format(parseISO(rec.completedDate), "d MMM yyyy")}</span>}
                    {rec.expiryDate && <span>Expires {format(parseISO(rec.expiryDate), "d MMM yyyy")}</span>}
                    {rec.cost !== null && rec.cost !== undefined && <span>{rec.currency} {rec.cost.toLocaleString()}</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-[#000033]/20"
                  onClick={() => { setEditing(rec); setAddOpen(true); }}
                  data-testid={`button-edit-training-${rec.id}`}
                >
                  Update
                </Button>
                {!rec.isMandatory && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-[#000033]/40 hover:text-rose-600"
                    onClick={() => remove.mutate({ recordId: rec.id }, { onSuccess: () => { invalidate(); toast({ title: "Removed" }); } })}
                    data-testid={`button-delete-training-${rec.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AddRecordDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        employeeId={employeeId}
        editing={editing}
        onSaved={invalidate}
      />
    </div>
  );
}

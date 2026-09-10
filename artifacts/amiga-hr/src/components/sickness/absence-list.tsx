import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, HeartPulse } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetEmployeeSickness,
  useDeleteSicknessAbsence,
  getGetEmployeeSicknessQueryKey,
  getListSicknessAbsencesQueryKey,
  getGetLeaveStatsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BradfordMeter } from "./bradford-meter";
import { AddSicknessDialog } from "./add-absence-dialog";

export function SicknessAbsenceList({ employeeId }: { employeeId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useGetEmployeeSickness(employeeId, {
    query: { queryKey: getGetEmployeeSicknessQueryKey(employeeId) },
  });
  const remove = useDeleteSicknessAbsence();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getGetEmployeeSicknessQueryKey(employeeId) });
    qc.invalidateQueries({ queryKey: getListSicknessAbsencesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetLeaveStatsQueryKey() });
  };

  if (isLoading || !data) {
    return <Skeleton className="h-40" />;
  }

  return (
    <div className="space-y-6">
      <Card className="border-[#000033]/10">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <BradfordMeter score={data.bradfordScore} band={data.riskBand} />
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[#000033]/50 uppercase tracking-wider font-semibold">Episodes (12mo)</p>
                  <p className="text-lg font-serif text-[#000033] mt-0.5 tabular-nums">{data.episodesLast12Months}</p>
                </div>
                <div>
                  <p className="text-[#000033]/50 uppercase tracking-wider font-semibold">Days lost (12mo)</p>
                  <p className="text-lg font-serif text-[#000033] mt-0.5 tabular-nums">{data.daysLostLast12Months}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[#000033]/50 uppercase tracking-wider font-semibold">Total episodes</p>
                <p className="text-lg font-serif text-[#000033] mt-0.5 tabular-nums">{data.totalEpisodes}</p>
              </div>
              <div>
                <p className="text-[#000033]/50 uppercase tracking-wider font-semibold">Total days lost</p>
                <p className="text-lg font-serif text-[#000033] mt-0.5 tabular-nums">{data.totalDaysLost}</p>
              </div>
              {data.currentlyOff && (
                <div className="col-span-2">
                  <Badge className="bg-rose-100 text-rose-700 border-rose-200" data-testid="badge-currently-off">
                    Currently off sick
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-[#000033]">Sickness episodes</h3>
          <p className="text-sm text-[#000033]/60">All recorded absences, most recent first.</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-[#000033] hover:bg-[#000033]/90 text-white" data-testid="button-add-sickness">
          <Plus className="h-4 w-4 mr-2" /> Record absence
        </Button>
      </div>

      {data.absences.length === 0 ? (
        <Card className="border-[#000033]/10">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-[#000033]/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <HeartPulse className="h-8 w-8 text-[#000033]/20" />
            </div>
            <p className="text-[#000033]/50">No sickness absences recorded.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-[#000033]/10">
          <CardContent className="p-0 divide-y divide-[#000033]/5">
            {data.absences.map((a) => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3" data-testid={`row-sickness-${a.id}`}>
                <div className="mt-1 w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                  <HeartPulse className="h-4 w-4 text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-[#000033]">{a.reason ?? "Sickness absence"}</p>
                    <Badge variant="outline" className="bg-white border-[#000033]/20 text-[#000033] text-[10px]">
                      {a.daysLost} day{a.daysLost === 1 ? "" : "s"}
                    </Badge>
                    {a.selfCertified && <Badge variant="outline" className="bg-[#F8F7F4] border-[#000033]/15 text-[#000033]/70 text-[10px]">Self-certified</Badge>}
                    {a.fitNoteReceived && <Badge variant="outline" className="bg-sky-50 border-sky-200 text-sky-700 text-[10px]">Fit note</Badge>}
                  </div>
                  <p className="text-xs text-[#000033]/60 mt-1 tabular-nums">
                    {format(parseISO(a.startDate), "d MMM yyyy")}
                    {a.endDate ? ` – ${format(parseISO(a.endDate), "d MMM yyyy")}` : " — ongoing"}
                  </p>
                  {a.notes && <p className="text-xs text-[#000033]/50 mt-1 italic">"{a.notes}"</p>}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-[#000033]/40 hover:text-rose-600"
                  onClick={() =>
                    remove.mutate(
                      { absenceId: a.id },
                      {
                        onSuccess: () => { invalidateAll(); toast({ title: "Absence deleted" }); },
                        onError: () => toast({ title: "Could not delete", variant: "destructive" }),
                      },
                    )
                  }
                  data-testid={`button-delete-sickness-${a.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AddSicknessDialog open={addOpen} onOpenChange={setAddOpen} employeeId={employeeId} onCreated={invalidateAll} />
    </div>
  );
}

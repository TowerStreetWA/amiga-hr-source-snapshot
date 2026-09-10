import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { HeartPulse, Activity, AlertTriangle } from "lucide-react";
import {
  useListSicknessAbsences,
  getListSicknessAbsencesQueryKey,
  type SicknessAbsenceWithEmployee,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Band = "all" | "low" | "medium" | "high" | "critical";

const BAND_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function bandBadge(band: string) {
  switch (band) {
    case "critical":
      return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Critical</Badge>;
    case "high":
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">High</Badge>;
    case "medium":
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Medium</Badge>;
    default:
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Low</Badge>;
  }
}

function isOpenToday(a: SicknessAbsenceWithEmployee): boolean {
  const today = format(new Date(), "yyyy-MM-dd");
  return a.startDate <= today && (!a.endDate || a.endDate >= today);
}

export function TeamSickness() {
  const [band, setBand] = useState<Band>("all");
  const { data, isLoading } = useListSicknessAbsences({
    query: { queryKey: getListSicknessAbsencesQueryKey() },
  });

  const rows = data ?? [];
  const offToday = useMemo(() => rows.filter(isOpenToday), [rows]);
  const filtered = useMemo(
    () => (band === "all" ? rows : rows.filter((r) => r.riskBand === band)),
    [rows, band],
  );

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0">
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <HeartPulse className="h-4 w-4 text-[#C5A059]" /> My team
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Team sickness</h1>
          <p className="text-[#000033]/60 mt-1">
            Sickness absences for your direct reports, sorted by Bradford Factor.
          </p>
        </header>

        {offToday.length > 0 && (
          <Card className="border-rose-200 bg-rose-50 shrink-0">
            <CardContent className="py-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
              <p className="text-sm text-rose-800">
                <span className="font-semibold">{offToday.length}</span> on your team{" "}
                {offToday.length === 1 ? "is" : "are"} off sick today:{" "}
                {offToday.map((a) => a.employeeName).join(", ")}.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          {(["all", "low", "medium", "high", "critical"] as Band[]).map((b) => (
            <button
              key={b}
              onClick={() => setBand(b)}
              data-testid={`filter-band-${b}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                band === b
                  ? "bg-[#000033] text-white border-[#000033]"
                  : "bg-white text-[#000033]/70 border-[#000033]/15 hover:border-[#000033]/30"
              }`}
            >
              {b === "all" ? "All" : BAND_LABEL[b]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : filtered.length === 0 ? (
            <Card className="border-[#000033]/10">
              <CardContent className="py-16 text-center text-[#000033]/50">
                {rows.length === 0
                  ? "No sickness absences recorded for your team."
                  : "No absences in this risk band."}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[#000033]/10">
              <CardContent className="p-0 divide-y divide-[#000033]/5">
                {filtered.map((a) => (
                  <div key={a.id} className="px-4 py-3 flex items-start gap-3" data-testid={`row-team-sickness-${a.id}`}>
                    <div className="mt-1 w-8 h-8 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                      <Activity className="h-4 w-4 text-[#C5A059]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#000033]">{a.employeeName}</p>
                        {bandBadge(a.riskBand)}
                        {isOpenToday(a) && (
                          <Badge variant="outline" className="bg-rose-50 border-rose-200 text-rose-700 text-[10px]">
                            Off today
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-[#000033]/60 mt-1">
                        {a.employeeNumber} · {a.department} · Bradford {a.bradfordScore}
                      </p>
                      <p className="text-xs text-[#000033]/60 mt-1 tabular-nums">
                        {format(parseISO(a.startDate), "d MMM yyyy")}
                        {a.endDate ? ` – ${format(parseISO(a.endDate), "d MMM yyyy")}` : " – ongoing"} ·{" "}
                        {a.daysLost} day{a.daysLost === 1 ? "" : "s"} lost
                      </p>
                      {a.reason && <p className="text-xs text-[#000033]/60 italic mt-1">"{a.reason}"</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

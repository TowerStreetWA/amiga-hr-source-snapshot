import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { HeartPulse, Search, AlertCircle, Activity, Users } from "lucide-react";
import {
  useListSicknessAbsences,
  getListSicknessAbsencesQueryKey,
  useGetLeaveStats,
  getGetLeaveStatsQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskBadge, RiskKey } from "@/components/sickness/bradford-meter";

const RISK_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export function Sickness() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "critical" | "high" | "medium" | "low">("all");

  const { data, isLoading } = useListSicknessAbsences({
    query: { queryKey: getListSicknessAbsencesQueryKey() },
  });
  const { data: stats } = useGetLeaveStats({
    query: { queryKey: getGetLeaveStatsQueryKey() },
  });

  const sorted = useMemo(() => {
    const list = (data ?? []).slice();
    list.sort((a, b) => {
      const r = RISK_RANK[a.riskBand] - RISK_RANK[b.riskBand];
      if (r !== 0) return r;
      return b.bradfordScore - a.bradfordScore;
    });
    return list;
  }, [data]);

  const filtered = useMemo(() => {
    return sorted.filter((a) => {
      if (riskFilter !== "all" && a.riskBand !== riskFilter) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return `${a.employeeName} ${a.employeeNumber} ${a.department} ${a.reason ?? ""}`.toLowerCase().includes(q);
    });
  }, [sorted, search, riskFilter]);

  const counts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    const seen = new Set<number>();
    for (const a of sorted) {
      if (seen.has(a.employeeId)) continue;
      seen.add(a.employeeId);
      c[a.riskBand]++;
    }
    return c;
  }, [sorted]);

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0">
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <HeartPulse className="h-4 w-4 text-[#C5A059]" /> Health & Wellbeing
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Sickness</h1>
          <p className="text-[#000033]/60 mt-1">Bradford Factor scoring identifies short, frequent absence patterns.</p>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
          {(["critical", "high", "medium", "low"] as const).map((band) => (
            <Card key={band} className="border-[#000033]/10">
              <CardContent className="py-5">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#C5A059]" />
                  <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold capitalize">{band} risk</p>
                </div>
                <p className="text-3xl font-serif text-[#000033] mt-1 tabular-nums">{counts[band]}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {stats && stats.offSickTodayCount > 0 && (
          <Card className="border-rose-200 bg-rose-50 shrink-0">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <Users className="h-5 w-5 text-rose-700 shrink-0" />
              <div className="text-sm text-rose-900">
                <span className="font-semibold">{stats.offSickTodayCount} off sick today:</span>{" "}
                <span>{stats.offSickTodayNames.join(", ")}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="shrink-0 bg-white rounded-lg border border-[#000033]/10 shadow-sm p-4 space-y-4">
          <RiskKey />
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#000033]/40" />
              <Input
                placeholder="Search by employee, ID, or reason…"
                className="pl-9 border-[#000033]/20 focus-visible:ring-[#C5A059]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-sickness-search"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["all", "critical", "high", "medium", "low"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRiskFilter(r)}
                  className={`px-3 py-1 text-xs uppercase tracking-wider font-semibold rounded-full border transition ${
                    riskFilter === r
                      ? "bg-[#000033] text-white border-[#000033]"
                      : "bg-white text-[#000033]/60 border-[#000033]/15 hover:border-[#000033]/30"
                  }`}
                  data-testid={`filter-risk-${r}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-[#000033]/10">
              <CardContent className="py-16 text-center text-[#000033]/50">
                {(data ?? []).length === 0 ? (
                  <>
                    <AlertCircle className="h-8 w-8 text-[#000033]/20 mx-auto mb-2" />
                    No sickness absences recorded yet.
                  </>
                ) : (
                  "No absences match these filters."
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[#000033]/10">
              <CardContent className="p-0 divide-y divide-[#000033]/5">
                {filtered.map((a) => (
                  <Link key={a.id} href={`/employees/${a.employeeId}?tab=sickness`}>
                    <div className="flex items-start gap-3 px-4 py-3 hover:bg-[#F8F7F4]/60 cursor-pointer" data-testid={`row-sickness-hub-${a.id}`}>
                      <div className="mt-1 w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                        <HeartPulse className="h-4 w-4 text-rose-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[#000033]">{a.employeeName}</p>
                          <RiskBadge band={a.riskBand} score={a.bradfordScore} />
                          <Badge variant="outline" className="bg-white border-[#000033]/20 text-[#000033] text-[10px]">
                            {a.daysLost} day{a.daysLost === 1 ? "" : "s"}
                          </Badge>
                          {a.selfCertified && <Badge variant="outline" className="bg-[#F8F7F4] border-[#000033]/15 text-[#000033]/70 text-[10px]">Self-certified</Badge>}
                          {a.fitNoteReceived && <Badge variant="outline" className="bg-sky-50 border-sky-200 text-sky-700 text-[10px]">Fit note</Badge>}
                        </div>
                        <p className="text-xs text-[#000033]/60 mt-1">
                          {a.employeeNumber} · {a.department}
                        </p>
                        <p className="text-xs text-[#000033]/60 mt-1 tabular-nums">
                          {format(parseISO(a.startDate), "d MMM yyyy")}
                          {a.endDate ? ` – ${format(parseISO(a.endDate), "d MMM yyyy")}` : " — ongoing"}
                          {a.reason ? ` · ${a.reason}` : ""}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

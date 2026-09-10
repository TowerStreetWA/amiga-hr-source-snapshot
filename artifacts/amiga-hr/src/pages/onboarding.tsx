import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { ClipboardCheck, Search, AlertCircle, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { useGetOnboardingOverview, type OnboardingEmployeeOverview } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StatusFilter = "all" | "in_progress" | "needs_attention" | "completed";

function statusBadge(label: OnboardingEmployeeOverview["statusLabel"]) {
  switch (label) {
    case "completed":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
    case "needs_attention":
      return <Badge className="bg-rose-100 text-rose-700 border-rose-200"><AlertCircle className="h-3 w-3 mr-1" />Needs attention</Badge>;
    case "on_track":
      return <Badge className="bg-sky-100 text-sky-700 border-sky-200"><Clock className="h-3 w-3 mr-1" />On track</Badge>;
    default:
      return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Not started</Badge>;
  }
}

export function Onboarding() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const { data, isLoading } = useGetOnboardingOverview();

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (filter === "in_progress") list = list.filter((r) => r.statusLabel === "on_track" || r.statusLabel === "needs_attention");
    if (filter === "needs_attention") list = list.filter((r) => r.statusLabel === "needs_attention");
    if (filter === "completed") list = list.filter((r) => r.statusLabel === "completed");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) =>
        `${r.firstName} ${r.lastName} ${r.employeeNumber} ${r.jobTitle} ${r.department}`.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, filter, search]);

  const totals = useMemo(() => {
    const all = data ?? [];
    return {
      active: all.filter((r) => r.statusLabel !== "completed").length,
      overdue: all.reduce((s, r) => s + r.overdueTasks, 0),
      completed: all.filter((r) => r.statusLabel === "completed").length,
    };
  }, [data]);

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0">
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <ClipboardCheck className="h-4 w-4 text-[#C5A059]" /> People Operations
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Onboarding Hub</h1>
          <p className="text-[#000033]/60 mt-1">Track new joiners through their first weeks.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">In progress</p>
              <p className="text-3xl font-serif text-[#000033] mt-1">{totals.active}</p>
            </CardContent>
          </Card>
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Overdue tasks</p>
              <p className={`text-3xl font-serif mt-1 ${totals.overdue > 0 ? "text-rose-600" : "text-[#000033]"}`}>{totals.overdue}</p>
            </CardContent>
          </Card>
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Completed onboardings</p>
              <p className="text-3xl font-serif text-[#000033] mt-1">{totals.completed}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 shrink-0 bg-white p-4 rounded-lg border border-[#000033]/10 shadow-sm">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#000033]/40" />
            <Input
              placeholder="Search by name, ID, role…"
              className="pl-9 border-[#000033]/20 focus-visible:ring-[#C5A059]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-onboarding-search"
            />
          </div>
          <Select value={filter} onValueChange={(v: StatusFilter) => setFilter(v)}>
            <SelectTrigger className="w-[200px] border-[#000033]/20 focus:ring-[#C5A059]" data-testid="select-onboarding-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="needs_attention">Needs attention</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          <div className="space-y-3">
            {isLoading && (
              <>
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
              </>
            )}
            {!isLoading && filtered.length === 0 && (
              <Card className="border-[#000033]/10">
                <CardContent className="py-16 text-center text-[#000033]/50">No onboardings match your filters.</CardContent>
              </Card>
            )}
            {filtered.map((row) => (
              <Link key={row.employeeId} href={`/employees/${row.employeeId}?tab=onboarding`}>
                <Card className="border-[#000033]/10 hover:border-[#C5A059]/40 transition cursor-pointer" data-testid={`card-onboarding-${row.employeeId}`}>
                  <CardContent className="py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-lg font-medium text-[#000033]">{row.firstName} {row.lastName}</p>
                        <p className="text-sm text-[#000033]/60">{row.jobTitle} · {row.department}</p>
                        <p className="text-xs text-[#000033]/40 mt-1">{row.employeeNumber} · Started {format(parseISO(row.startDate), "d MMM yyyy")}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {statusBadge(row.statusLabel)}
                        <span className="text-xs text-[#000033]/60">{row.completedTasks} / {row.totalTasks} tasks</span>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <Progress value={row.progressPercent} className="h-2 [&>div]:bg-[#C5A059] flex-1" />
                      <span className="text-xs font-medium text-[#000033]/70 w-10 text-right">{row.progressPercent}%</span>
                      <ArrowRight className="h-4 w-4 text-[#000033]/40" />
                    </div>
                    {row.overdueTasks > 0 && (
                      <p className="text-xs text-rose-600 mt-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {row.overdueTasks} overdue task{row.overdueTasks === 1 ? "" : "s"}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

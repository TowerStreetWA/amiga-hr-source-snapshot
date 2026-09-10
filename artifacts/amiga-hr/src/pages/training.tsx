import { useState } from "react";
import { Link } from "wouter";
import { format, parseISO, differenceInDays } from "date-fns";
import { GraduationCap, ShieldCheck, AlertCircle, Clock, Search } from "lucide-react";
import { useListAllTrainingRecords, useGetTrainingStats } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FilterTab = "all" | "overdue" | "expiring_soon" | "completed";

function statusBadge(status: string, expiryDate: string | null | undefined) {
  if (status === "expired") return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Expired</Badge>;
  if (status === "completed" && expiryDate) {
    const days = differenceInDays(parseISO(expiryDate), new Date());
    if (days < 0) return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Expired</Badge>;
    if (days <= 60) return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Expiring in {days}d</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Valid</Badge>;
  }
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Completed</Badge>;
  if (status === "in_progress") return <Badge className="bg-sky-100 text-sky-700 border-sky-200">In progress</Badge>;
  return <Badge className="bg-slate-100 text-slate-700 border-slate-200">Pending</Badge>;
}

export function Training() {
  const [tab, setTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const apiStatus = tab === "all" ? undefined : tab === "completed" ? "completed" : tab;
  const { data, isLoading } = useListAllTrainingRecords({ status: apiStatus });
  const { data: stats } = useGetTrainingStats();

  const filtered = (data ?? []).filter((r) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return `${r.name} ${r.employeeName} ${r.employeeNumber} ${r.department ?? ""}`.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0">
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <GraduationCap className="h-4 w-4 text-[#C5A059]" /> Learning & Development
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Training Register</h1>
          <p className="text-[#000033]/60 mt-1">Mandatory Lloyd's Market training, professional certifications, and renewals.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Overdue</p>
              <p className={`text-3xl font-serif mt-1 ${stats?.overdueTrainingRecords ? "text-rose-600" : "text-[#000033]"}`} data-testid="text-stat-overdue-training">{stats?.overdueTrainingRecords ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Expiring within 60 days</p>
              <p className={`text-3xl font-serif mt-1 ${stats?.expiringSoonRecords ? "text-amber-600" : "text-[#000033]"}`} data-testid="text-stat-expiring-soon">{stats?.expiringSoonRecords ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-[#000033]/10">
            <CardContent className="py-5">
              <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">In onboarding</p>
              <p className="text-3xl font-serif text-[#000033] mt-1">{stats?.employeesInOnboarding ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <div className="shrink-0 bg-white rounded-lg border border-[#000033]/10 shadow-sm p-4 space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as FilterTab)}>
            <TabsList className="bg-[#F8F7F4] border border-[#000033]/10">
              <TabsTrigger value="all" data-testid="tab-training-all">All</TabsTrigger>
              <TabsTrigger value="overdue" data-testid="tab-training-overdue">Overdue</TabsTrigger>
              <TabsTrigger value="expiring_soon" data-testid="tab-training-expiring">Expiring soon</TabsTrigger>
              <TabsTrigger value="completed" data-testid="tab-training-completed">Completed</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#000033]/40" />
            <Input
              placeholder="Search by employee, course, or ID…"
              className="pl-9 border-[#000033]/20 focus-visible:ring-[#C5A059]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-training-search"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <Card className="border-[#000033]/10">
              <CardContent className="py-16 text-center text-[#000033]/50">No training records match these filters.</CardContent>
            </Card>
          )}
          {!isLoading && filtered.length > 0 && (
            <Card className="border-[#000033]/10">
              <CardContent className="p-0 divide-y divide-[#000033]/5">
                {filtered.map((rec) => (
                  <Link key={rec.id} href={`/employees/${rec.employeeId}?tab=training`}>
                    <div className="flex items-start gap-3 px-4 py-3 hover:bg-[#F8F7F4]/60 cursor-pointer" data-testid={`row-training-register-${rec.id}`}>
                      <div className="mt-1 w-8 h-8 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                        {rec.isMandatory ? <ShieldCheck className="h-4 w-4 text-[#C5A059]" /> : <GraduationCap className="h-4 w-4 text-[#000033]/60" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[#000033]">{rec.name}</p>
                          {rec.isMandatory && <Badge variant="outline" className="bg-[#C5A059]/10 text-[#000033] border-[#C5A059]/30 text-[10px]">Mandatory</Badge>}
                          {statusBadge(rec.status, rec.expiryDate)}
                        </div>
                        <p className="text-xs text-[#000033]/60 mt-1">
                          {rec.employeeName} · {rec.employeeNumber}{rec.department ? ` · ${rec.department}` : ""}
                        </p>
                        <p className="text-xs text-[#000033]/50 mt-0.5 flex flex-wrap gap-3">
                          {rec.completedDate && <span><Clock className="h-3 w-3 inline mr-1" />Completed {format(parseISO(rec.completedDate), "d MMM yyyy")}</span>}
                          {rec.expiryDate && <span>Expires {format(parseISO(rec.expiryDate), "d MMM yyyy")}</span>}
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

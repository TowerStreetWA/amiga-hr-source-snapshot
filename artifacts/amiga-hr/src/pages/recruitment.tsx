import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import {
  Briefcase,
  Plus,
  Search,
  Users,
  CalendarClock,
  FileSignature,
  ExternalLink,
  Copy,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type Job,
  type Candidate,
  useListJobs,
  useListCandidates,
  useGetRecruitmentStats,
  useDeleteJob,
  getListJobsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JobDialog } from "@/components/recruitment/job-dialog";
import {
  ACTIVE_STAGES,
  ALL_STAGES,
  STAGE_LABELS,
  STAGE_TONE,
  formatSalaryRange,
  initials,
  type Stage,
} from "@/lib/recruitment";

function StatTile({
  label,
  value,
  icon: Icon,
  tone = "navy",
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "navy" | "gold";
}) {
  return (
    <Card className="p-5 bg-white border-[#000033]/10">
      <div className="flex items-center gap-4">
        <div
          className={`w-11 h-11 rounded-lg flex items-center justify-center ${
            tone === "gold" ? "bg-[#C5A059]/15 text-[#C5A059]" : "bg-[#000033]/5 text-[#000033]"
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-serif text-[#000033]">{value}</p>
          <p className="text-xs text-[#000033]/60 uppercase tracking-wider">{label}</p>
        </div>
      </div>
    </Card>
  );
}

function PipelineView({ candidates, jobs }: { candidates: Candidate[]; jobs: Job[] }) {
  const grouped = useMemo(() => {
    const map: Record<Stage, Candidate[]> = {} as Record<Stage, Candidate[]>;
    for (const s of ALL_STAGES) map[s] = [];
    for (const c of candidates) {
      const s = c.currentStage as Stage;
      if (map[s]) map[s].push(c);
    }
    return map;
  }, [candidates]);

  const visibleStages = ACTIVE_STAGES;
  const jobMap = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {visibleStages.map((stage) => {
          const list = grouped[stage] ?? [];
          return (
            <div key={stage} className="w-72 flex-shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <h3 className="text-xs font-semibold text-[#000033] uppercase tracking-wider">
                  {STAGE_LABELS[stage]}
                </h3>
                <span className="text-xs text-[#000033]/50 font-medium">{list.length}</span>
              </div>
              <div className="bg-[#000033]/[0.03] rounded-lg p-2 min-h-[200px] space-y-2">
                {list.length === 0 ? (
                  <div className="text-center text-xs text-[#000033]/40 py-8">No candidates</div>
                ) : (
                  list.map((c) => {
                    const job = c.jobId ? jobMap.get(c.jobId) : null;
                    return (
                      <Link key={c.id} href={`/candidates/${c.id}`}>
                        <motion.div
                          layout
                          whileHover={{ y: -1 }}
                          className="bg-white rounded-md border border-[#000033]/10 p-3 cursor-pointer hover:border-[#C5A059]/40 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <Avatar className="h-7 w-7 bg-[#000033] text-white text-xs">
                              <AvatarFallback className="bg-[#000033] text-white text-[10px]">
                                {initials(c.firstName, c.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#000033] truncate">
                                {c.firstName} {c.lastName}
                              </p>
                              <p className="text-[11px] text-[#000033]/60 truncate">
                                {job?.title ?? c.jobTitle ?? c.currentRole ?? "Unassigned"}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-[10px] text-[#000033]/50">
                              {formatDistanceToNow(new Date(c.appliedAt), { addSuffix: true })}
                            </span>
                            {c.yearsExperience != null && (
                              <span className="text-[10px] text-[#000033]/60 font-medium">
                                {c.yearsExperience}y exp
                              </span>
                            )}
                          </div>
                        </motion.div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CandidatesList({
  candidates,
  search,
  setSearch,
  stage,
  setStage,
}: {
  candidates: Candidate[];
  search: string;
  setSearch: (s: string) => void;
  stage: string;
  setStage: (s: string) => void;
}) {
  return (
    <Card className="bg-white border-[#000033]/10">
      <div className="p-4 flex items-center gap-3 border-b border-[#000033]/10">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#000033]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, company"
            className="pl-9"
          />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {ALL_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="divide-y divide-[#000033]/5">
        {candidates.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#000033]/50">No candidates match your filters.</div>
        ) : (
          candidates.map((c) => (
            <Link key={c.id} href={`/candidates/${c.id}`}>
              <div className="px-5 py-4 flex items-center gap-4 hover:bg-[#F8F7F4] cursor-pointer">
                <Avatar className="h-10 w-10 bg-[#000033] text-white">
                  <AvatarFallback className="bg-[#000033] text-white text-sm">
                    {initials(c.firstName, c.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                  <div>
                    <p className="text-sm font-medium text-[#000033] truncate">
                      {c.firstName} {c.lastName}
                    </p>
                    <p className="text-xs text-[#000033]/60 truncate">{c.email}</p>
                  </div>
                  <div className="hidden md:block">
                    <p className="text-sm text-[#000033] truncate">{c.jobTitle ?? "Unassigned"}</p>
                    <p className="text-xs text-[#000033]/60 truncate">
                      {c.currentCompany ?? "—"}
                    </p>
                  </div>
                  <div className="hidden md:block">
                    <Badge variant="outline" className={STAGE_TONE[c.currentStage as Stage]}>
                      {STAGE_LABELS[c.currentStage as Stage]}
                    </Badge>
                  </div>
                  <div className="hidden md:block text-xs text-[#000033]/60">
                    Applied {format(new Date(c.appliedAt), "d MMM yyyy")}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}

function JobsView({
  jobs,
  onEdit,
  onNew,
}: {
  jobs: Job[];
  onEdit: (j: Job) => void;
  onNew: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const del = useDeleteJob({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListJobsQueryKey() });
        toast({ title: "Job removed" });
      },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#000033]/60">
          {jobs.length} role{jobs.length === 1 ? "" : "s"} live on your pipeline
        </p>
        <Button onClick={onNew} className="bg-[#000033] text-white hover:bg-[#000033]/90">
          <Plus className="w-4 h-4 mr-2" />
          Post a role
        </Button>
      </div>
      {jobs.length === 0 ? (
        <Card className="p-12 text-center bg-white border-dashed border-[#000033]/20">
          <Briefcase className="w-10 h-10 mx-auto text-[#000033]/20 mb-3" />
          <p className="text-sm text-[#000033]/60 mb-4">No live roles yet.</p>
          <Button onClick={onNew} className="bg-[#000033] text-white hover:bg-[#000033]/90">
            Post your first role
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {jobs.map((j) => (
            <Card key={j.id} className="p-5 bg-white border-[#000033]/10 hover:border-[#C5A059]/40 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <Badge
                    variant="outline"
                    className={
                      j.status === "open"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : j.status === "draft"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                    }
                  >
                    {j.status === "open" ? "Open" : j.status === "draft" ? "Draft" : "Closed"}
                  </Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(j)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-700"
                      onClick={() => {
                        if (confirm(`Remove "${j.title}"?`)) del.mutate({ id: j.id });
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <h3 className="font-serif text-lg text-[#000033] leading-snug mb-1">{j.title}</h3>
              <p className="text-xs text-[#000033]/60 mb-3">
                {j.department} · {j.location}
              </p>
              {j.description && (
                <p className="text-sm text-[#000033]/70 line-clamp-3 mb-4">{j.description}</p>
              )}
              <div className="text-sm font-medium text-[#000033] mb-4">
                {formatSalaryRange(j.salaryMin, j.salaryMax, j.currency)}
              </div>
              <div className="flex items-center justify-between text-xs text-[#000033]/60 pt-3 border-t border-[#000033]/10">
                <span>{j.candidateCount} candidate{j.candidateCount === 1 ? "" : "s"}</span>
                <span>{j.hiredCount} hired</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function Recruitment() {
  const [tab, setTab] = useState("pipeline");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const { toast } = useToast();

  const { data: stats } = useGetRecruitmentStats();
  const { data: jobs, isLoading: jobsLoading } = useListJobs();
  const { data: candidates, isLoading: candidatesLoading } = useListCandidates({
    search: search || undefined,
    stage: stageFilter === "all" ? undefined : stageFilter,
  });

  const applyUrl = `${window.location.origin}${import.meta.env.BASE_URL}apply`;

  function copyApplyLink() {
    void navigator.clipboard.writeText(applyUrl).then(() => {
      toast({ title: "Link copied", description: "Public application URL copied to your clipboard." });
    });
  }

  return (
    <div className="flex-1 bg-[#F8F7F4] min-h-[calc(100vh-theme(spacing.16))]">
      <div className="px-6 lg:px-8 py-8 max-w-[1600px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
            <div>
              <h1 className="font-serif text-3xl text-[#000033]">Recruitment</h1>
              <p className="text-sm text-[#000033]/60 mt-1">
                Move candidates through your pipeline, schedule interviews, and convert hires into
                Amiga colleagues.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={copyApplyLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy public link
              </Button>
              <a href={applyUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open /apply
                </Button>
              </a>
              <Button
                onClick={() => {
                  setEditingJob(null);
                  setJobDialogOpen(true);
                }}
                className="bg-[#000033] text-white hover:bg-[#000033]/90"
              >
                <Plus className="w-4 h-4 mr-2" />
                Post a role
              </Button>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <StatTile label="Open roles" value={stats?.openJobs ?? "—"} icon={Briefcase} />
          <StatTile label="Active candidates" value={stats?.activeCandidates ?? "—"} icon={Users} />
          <StatTile label="Interviews this week" value={stats?.interviewsThisWeek ?? "—"} icon={CalendarClock} />
          <StatTile label="Pending offers" value={stats?.pendingOffers ?? "—"} icon={FileSignature} tone="gold" />
          <StatTile label="Hired this month" value={stats?.hiredThisMonth ?? "—"} icon={Users} tone="gold" />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-white border border-[#000033]/10">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="candidates">Candidates</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="mt-4">
            {candidatesLoading || jobsLoading ? (
              <div className="grid grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 w-full" />
                ))}
              </div>
            ) : (
              <PipelineView candidates={candidates ?? []} jobs={jobs ?? []} />
            )}
          </TabsContent>

          <TabsContent value="candidates" className="mt-4">
            {candidatesLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <CandidatesList
                candidates={candidates ?? []}
                search={search}
                setSearch={setSearch}
                stage={stageFilter}
                setStage={setStageFilter}
              />
            )}
          </TabsContent>

          <TabsContent value="jobs" className="mt-4">
            {jobsLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <JobsView
                jobs={jobs ?? []}
                onEdit={(j) => {
                  setEditingJob(j);
                  setJobDialogOpen(true);
                }}
                onNew={() => {
                  setEditingJob(null);
                  setJobDialogOpen(true);
                }}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <JobDialog open={jobDialogOpen} onOpenChange={setJobDialogOpen} job={editingJob} />
    </div>
  );
}

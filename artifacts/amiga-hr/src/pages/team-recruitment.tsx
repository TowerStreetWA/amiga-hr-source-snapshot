import { useMemo } from "react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { UserPlus, Briefcase } from "lucide-react";
import {
  useListCandidates,
  getListCandidatesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STAGE_LABEL: Record<string, string> = {
  new: "New",
  cv_review: "CV review",
  shortlisted: "Shortlisted",
  phone_screen: "Phone screen",
  interview_1: "Interview 1",
  interview_2: "Interview 2",
  interview_3: "Interview 3",
  assessment: "Assessment",
  offer_pending: "Offer pending",
  offered: "Offered",
  hired: "Hired",
  rejected: "Rejected",
};

function stageBadge(stage: string) {
  if (stage === "hired") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Hired</Badge>;
  if (stage === "rejected") return <Badge className="bg-rose-100 text-rose-700 border-rose-200">Rejected</Badge>;
  if (stage === "offered" || stage === "offer_pending")
    return <Badge className="bg-[#C5A059]/15 text-[#8a6d2f] border-[#C5A059]/30">{STAGE_LABEL[stage]}</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 border-blue-200">{STAGE_LABEL[stage] ?? stage}</Badge>;
}

export function TeamRecruitment() {
  const { data, isLoading } = useListCandidates(
    {},
    { query: { queryKey: getListCandidatesQueryKey() } },
  );

  const rows = data ?? [];
  const activeCount = useMemo(
    () => rows.filter((c) => c.currentStage !== "hired" && c.currentStage !== "rejected").length,
    [rows],
  );

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full space-y-6">
        <header className="shrink-0">
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <UserPlus className="h-4 w-4 text-[#C5A059]" /> My team
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Team recruitment</h1>
          <p className="text-[#000033]/60 mt-1">
            Candidates applying for the roles you own.
          </p>
        </header>

        <Card className="border-[#000033]/10 shrink-0 max-w-xs">
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">Active candidates</p>
            <p className="text-3xl font-serif mt-1 text-[#000033]" data-testid="text-team-active-candidates">{activeCount}</p>
          </CardContent>
        </Card>

        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : rows.length === 0 ? (
            <Card className="border-[#000033]/10">
              <CardContent className="py-16 text-center text-[#000033]/50">
                No candidates on your roles yet. Roles are assigned to you by HR.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-[#000033]/10">
              <CardContent className="p-0 divide-y divide-[#000033]/5">
                {rows.map((c) => (
                  <Link
                    key={c.id}
                    href={`/candidates/${c.id}`}
                    className="px-4 py-3 flex items-start gap-3 hover:bg-[#000033]/[0.02] transition-colors"
                    data-testid={`row-team-candidate-${c.id}`}
                  >
                    <div className="mt-1 w-8 h-8 rounded-full bg-[#000033]/5 flex items-center justify-center shrink-0">
                      <Briefcase className="h-4 w-4 text-[#C5A059]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-[#000033]">{c.firstName} {c.lastName}</p>
                        {stageBadge(c.currentStage)}
                      </div>
                      <p className="text-xs text-[#000033]/60 mt-1">
                        {c.jobTitle ?? "Unassigned role"}
                        {c.currentCompany ? ` · ${c.currentCompany}` : ""}
                      </p>
                      <p className="text-xs text-[#000033]/50 mt-1 tabular-nums">
                        Applied {format(parseISO(c.appliedAt), "d MMM yyyy")}
                      </p>
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

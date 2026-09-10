import { useMemo, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Mail,
  Phone,
  Linkedin,
  Briefcase,
  CalendarDays,
  ChevronRight,
  CalendarPlus,
  FileSignature,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Award,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCandidate,
  useUpdateInterview,
  useUpdateOffer,
  getGetCandidateQueryKey,
  getListCandidatesQueryKey,
  getGetRecruitmentStatsQueryKey,
} from "@workspace/api-client-react";
// Re-imported intentionally to keep stats in sync after interview updates.
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { StageDialog } from "@/components/recruitment/stage-dialog";
import { InterviewDialog } from "@/components/recruitment/interview-dialog";
import { OfferDialog } from "@/components/recruitment/offer-dialog";
import { ConvertDialog } from "@/components/recruitment/convert-dialog";
import {
  ACTIVE_STAGES,
  STAGE_LABELS,
  STAGE_TONE,
  formatCurrency,
  initials,
  type Stage,
} from "@/lib/recruitment";

function ProgressBar({ stage }: { stage: Stage }) {
  if (stage === "rejected") {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600">
        <XCircle className="w-4 h-4" />
        <span>Closed — not progressing</span>
      </div>
    );
  }
  if (stage === "hired") {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="w-4 h-4" />
        <span>Hired — converted to employee</span>
      </div>
    );
  }
  const idx = ACTIVE_STAGES.indexOf(stage);
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {ACTIVE_STAGES.map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full ${
              i <= idx ? "bg-[#C5A059]" : "bg-[#000033]/10"
            }`}
            title={STAGE_LABELS[s]}
          />
        ))}
      </div>
      <p className="text-xs text-[#000033]/60">
        Step {idx + 1} of {ACTIVE_STAGES.length} · {STAGE_LABELS[stage]}
      </p>
    </div>
  );
}

const RTW_LABELS: Record<string, string> = {
  uk_citizen: "UK citizen",
  settled: "Settled status",
  work_visa: "Work visa",
  sponsorship_required: "Sponsorship required",
  unknown: "Not stated",
};

type InterviewLike = {
  id: number;
  type: string;
  scheduledFor: string;
  durationMinutes: number;
  location?: string | null;
  interviewerName: string;
  status: string;
  outcome?: "advance" | "hold" | "reject" | null;
  score?: number | null;
  feedback?: string | null;
};

function InterviewRow({
  interview,
  onUpdate,
}: {
  interview: InterviewLike;
  onUpdate: (
    id: number,
    data: {
      status?: "scheduled" | "completed" | "cancelled" | "no_show";
      outcome?: "advance" | "hold" | "reject";
      score?: number;
      feedback?: string;
    },
  ) => void;
}) {
  const [feedback] = useState(interview.feedback ?? "");
  const [outcome, setOutcome] = useState<"advance" | "hold" | "reject" | "">(interview.outcome ?? "");
  const [score, setScore] = useState<string>(interview.score ? String(interview.score) : "");
  const isCompleted = interview.status === "completed";

  return (
    <div className="border border-[#000033]/10 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <p className="text-sm font-medium text-[#000033] capitalize">
            {interview.type.replace("_", " ")} interview
          </p>
          <p className="text-xs text-[#000033]/60">
            {format(new Date(interview.scheduledFor), "EEE d MMM yyyy 'at' HH:mm")} · {interview.durationMinutes}m
            {interview.location ? ` · ${interview.location}` : ""}
          </p>
          <p className="text-xs text-[#000033]/60 mt-1">
            With <span className="text-[#000033]">{interview.interviewerName}</span>
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            interview.status === "completed"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : interview.status === "cancelled" || interview.status === "no_show"
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-blue-50 text-blue-700 border-blue-200"
          }
        >
          {interview.status.replace("_", " ")}
        </Badge>
      </div>
      {!isCompleted && (
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[#000033]/5">
          <Select value={outcome} onValueChange={(v) => setOutcome(v as typeof outcome)}>
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue placeholder="Outcome" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="advance">Advance</SelectItem>
              <SelectItem value="hold">Hold</SelectItem>
              <SelectItem value="reject">Reject</SelectItem>
            </SelectContent>
          </Select>
          <Select value={score} onValueChange={setScore}>
            <SelectTrigger className="w-[110px] h-9">
              <SelectValue placeholder="Score" />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / 5
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={!outcome}
            onClick={() =>
              onUpdate(interview.id, {
                status: "completed",
                outcome: outcome || undefined,
                score: score ? Number(score) : undefined,
                feedback: feedback || undefined,
              })
            }
          >
            Mark complete
          </Button>
        </div>
      )}
      {isCompleted && (
        <div className="mt-3 pt-3 border-t border-[#000033]/5 text-sm text-[#000033]/80">
          {interview.outcome && (
            <p>
              Outcome: <span className="font-medium capitalize">{interview.outcome}</span>
              {interview.score ? ` · ${interview.score}/5` : ""}
            </p>
          )}
          {interview.feedback && (
            <p className="mt-1 text-[#000033]/70 leading-relaxed">{interview.feedback}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ReferenceSummary({
  label,
  name,
  company,
  jobTitle,
  email,
  phone,
}: {
  label: string;
  name?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  if (!name && !company && !jobTitle && !email && !phone) return null;
  return (
    <div className="rounded-lg border border-[#000033]/10 bg-[#000033]/[0.02] p-4">
      <p className="text-xs uppercase tracking-wider text-[#000033]/50">{label}</p>
      <p className="mt-2 font-medium text-[#000033]">{name || "—"}</p>
      <p className="mt-1 text-sm text-[#000033]/70">
        {[jobTitle, company].filter(Boolean).join(" · ") || "—"}
      </p>
      {email && (
        <a className="mt-2 block text-sm text-[#000033] underline-offset-2 hover:underline" href={`mailto:${email}`}>
          {email}
        </a>
      )}
      {phone && <p className="mt-1 text-sm text-[#000033]/70">{phone}</p>}
    </div>
  );
}

export function CandidateDetail() {
  const [, params] = useRoute("/candidates/:id");
  const id = params ? Number(params.id) : NaN;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [interviewDialogOpen, setInterviewDialogOpen] = useState(false);
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);

  const { data: candidate, isLoading } = useGetCandidate(id);

  const updateInterview = useUpdateInterview({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCandidateQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetRecruitmentStatsQueryKey() });
        toast({ title: "Interview updated" });
      },
    },
  });

  const updateOffer = useUpdateOffer({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCandidateQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRecruitmentStatsQueryKey() });
        toast({ title: "Offer updated" });
      },
    },
  });

  const sortedHistory = useMemo(() => {
    if (!candidate) return [];
    return [...candidate.stageHistory].sort(
      (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
    );
  }, [candidate]);

  if (!Number.isFinite(id)) {
    return <div className="p-8 text-sm text-[#000033]/60">Invalid candidate id.</div>;
  }

  if (isLoading || !candidate) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const stage = candidate.currentStage as Stage;
  const acceptedOffer = candidate.offers.find((o) => o.status === "accepted");
  const canConvert = !candidate.hiredEmployeeId && (stage === "offered" || stage === "offer_pending" || acceptedOffer);

  return (
    <div className="flex-1 bg-[#F8F7F4] min-h-[calc(100vh-theme(spacing.16))]">
      <div className="px-6 lg:px-8 py-8 max-w-[1400px] mx-auto">
        <Link href="/recruitment">
          <Button variant="ghost" size="sm" className="text-[#000033]/60 hover:text-[#000033] mb-4 -ml-3">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to recruitment
          </Button>
        </Link>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-6 bg-white border-[#000033]/10 mb-6">
            <div className="flex items-start gap-5 flex-wrap">
              <Avatar className="h-16 w-16 bg-[#000033] text-white">
                <AvatarFallback className="bg-[#000033] text-white text-lg">
                  {initials(candidate.firstName, candidate.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="font-serif text-2xl text-[#000033]">
                    {candidate.firstName} {candidate.lastName}
                  </h1>
                  <Badge variant="outline" className={STAGE_TONE[stage]}>
                    {STAGE_LABELS[stage]}
                  </Badge>
                </div>
                <p className="text-sm text-[#000033]/60 mt-1">
                  {candidate.jobTitle ?? "Unassigned to a role"}
                  {candidate.currentCompany ? ` · currently at ${candidate.currentCompany}` : ""}
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-[#000033]/70">
                  <a href={`mailto:${candidate.email}`} className="flex items-center gap-1.5 hover:text-[#000033]">
                    <Mail className="w-3.5 h-3.5" />
                    {candidate.email}
                  </a>
                  {candidate.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      {candidate.phone}
                    </span>
                  )}
                  {candidate.linkedinUrl && (
                    <a
                      href={candidate.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 hover:text-[#000033]"
                    >
                      <Linkedin className="w-3.5 h-3.5" />
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 items-end">
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setStageDialogOpen(true)}
                  >
                    <ArrowRightLeft className="w-4 h-4 mr-2" />
                    Move stage
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setInterviewDialogOpen(true)}
                  >
                    <CalendarPlus className="w-4 h-4 mr-2" />
                    Schedule interview
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setOfferDialogOpen(true)}
                  >
                    <FileSignature className="w-4 h-4 mr-2" />
                    Create offer
                  </Button>
                  {canConvert && (
                    <Button
                      onClick={() => setConvertDialogOpen(true)}
                      className="bg-[#C5A059] text-[#000033] hover:bg-[#B89048]"
                    >
                      <Award className="w-4 h-4 mr-2" />
                      Convert to employee
                    </Button>
                  )}
                  {candidate.hiredEmployeeId && (
                    <Button
                      onClick={() => navigate(`/employees/${candidate.hiredEmployeeId}`)}
                      className="bg-[#000033] text-white hover:bg-[#000033]/90"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View employee record
                    </Button>
                  )}
                </div>
                <p className="text-xs text-[#000033]/50">
                  Applied {formatDistanceToNow(new Date(candidate.appliedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
            <Separator className="my-5 bg-[#000033]/10" />
            <ProgressBar stage={stage} />
          </Card>
        </motion.div>

        <Tabs defaultValue="overview">
          <TabsList className="bg-white border border-[#000033]/10">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="documents">Documents ({candidate.documents.length})</TabsTrigger>
            <TabsTrigger value="interviews">Interviews ({candidate.interviews.length})</TabsTrigger>
            <TabsTrigger value="offers">Offers ({candidate.offers.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-5 bg-white border-[#000033]/10 lg:col-span-2">
                <h2 className="font-serif text-lg text-[#000033] mb-4">Background</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Source</dt>
                    <dd className="text-[#000033] mt-0.5 capitalize">{candidate.source.replace("_", " ")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Right to work</dt>
                    <dd className="text-[#000033] mt-0.5">
                      {candidate.rightToWorkStatus
                        ? RTW_LABELS[candidate.rightToWorkStatus] ?? candidate.rightToWorkStatus
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Years experience</dt>
                    <dd className="text-[#000033] mt-0.5">
                      {candidate.yearsExperience != null ? `${candidate.yearsExperience} years` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Expected salary</dt>
                    <dd className="text-[#000033] mt-0.5">
                      {formatCurrency(candidate.expectedSalary, candidate.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Current role</dt>
                    <dd className="text-[#000033] mt-0.5">{candidate.currentRole ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Current company</dt>
                    <dd className="text-[#000033] mt-0.5">{candidate.currentCompany ?? "—"}</dd>
                  </div>
                </dl>
                {candidate.coverLetter && (
                  <>
                    <Separator className="my-4 bg-[#000033]/10" />
                    <h3 className="text-xs text-[#000033]/50 uppercase tracking-wider mb-2">Cover letter</h3>
                    <p className="text-sm text-[#000033]/80 leading-relaxed whitespace-pre-wrap">
                      {candidate.coverLetter}
                    </p>
                  </>
                )}
                {candidate.notes && (
                  <>
                    <Separator className="my-4 bg-[#000033]/10" />
                    <h3 className="text-xs text-[#000033]/50 uppercase tracking-wider mb-2">Internal notes</h3>
                    <p className="text-sm text-[#000033]/80 leading-relaxed whitespace-pre-wrap">{candidate.notes}</p>
                  </>
                )}
                {stage === "rejected" && candidate.rejectedReason && (
                  <>
                    <Separator className="my-4 bg-[#000033]/10" />
                    <h3 className="text-xs text-red-600 uppercase tracking-wider mb-2">Rejection reason</h3>
                    <p className="text-sm text-[#000033]/80 leading-relaxed">{candidate.rejectedReason}</p>
                  </>
                )}
              </Card>

              <Card className="p-5 bg-white border-[#000033]/10 lg:col-span-2">
                <h2 className="font-serif text-lg text-[#000033] mb-4">Compensation &amp; references</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Current salary</dt>
                    <dd className="text-[#000033] mt-0.5">{formatCurrency(candidate.currentSalary, candidate.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Expected salary</dt>
                    <dd className="text-[#000033] mt-0.5">{formatCurrency(candidate.expectedSalary, candidate.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Notice period</dt>
                    <dd className="text-[#000033] mt-0.5">{candidate.noticePeriod || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Last bonus</dt>
                    <dd className="text-[#000033] mt-0.5">
                      {candidate.lastBonusAmount != null
                        ? formatCurrency(candidate.lastBonusAmount, candidate.currency)
                        : candidate.lastBonusPercentage != null
                          ? `${candidate.lastBonusPercentage}%`
                          : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Bonus percentage</dt>
                    <dd className="text-[#000033] mt-0.5">
                      {candidate.lastBonusPercentage != null ? `${candidate.lastBonusPercentage}%` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#000033]/50 uppercase tracking-wider">Current pension</dt>
                    <dd className="text-[#000033] mt-0.5">
                      {candidate.currentPensionPercentage != null ? `${candidate.currentPensionPercentage}%` : "—"}
                    </dd>
                  </div>
                </dl>
                {(candidate.referenceOneName || candidate.referenceTwoName) && (
                  <>
                    <Separator className="my-5 bg-[#000033]/10" />
                    <h3 className="text-xs text-[#000033]/50 uppercase tracking-wider mb-3">Business references</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ReferenceSummary
                        label="Reference 1"
                        name={candidate.referenceOneName}
                        company={candidate.referenceOneCompany}
                        jobTitle={candidate.referenceOneJobTitle}
                        email={candidate.referenceOneEmail}
                        phone={candidate.referenceOnePhone}
                      />
                      <ReferenceSummary
                        label="Reference 2"
                        name={candidate.referenceTwoName}
                        company={candidate.referenceTwoCompany}
                        jobTitle={candidate.referenceTwoJobTitle}
                        email={candidate.referenceTwoEmail}
                        phone={candidate.referenceTwoPhone}
                      />
                    </div>
                  </>
                )}
              </Card>

              <Card className="p-5 bg-white border-[#000033]/10">
                <h2 className="font-serif text-lg text-[#000033] mb-4">Activity</h2>
                {sortedHistory.length === 0 ? (
                  <p className="text-sm text-[#000033]/50">No history yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {sortedHistory.slice(0, 6).map((h) => (
                      <li key={h.id} className="flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-[#C5A059] mt-1.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#000033]">
                            Moved to <span className="font-medium">{STAGE_LABELS[h.toStage as Stage] ?? h.toStage}</span>
                          </p>
                          {h.note && <p className="text-xs text-[#000033]/60 mt-0.5">{h.note}</p>}
                          <p className="text-[10px] text-[#000033]/40 mt-1">
                            {format(new Date(h.changedAt), "d MMM yyyy 'at' HH:mm")} · {h.changedBy}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <Card className="p-5 bg-white border-[#000033]/10">
              <h2 className="font-serif text-lg text-[#000033] mb-4">Documents</h2>
              {candidate.documents.length === 0 ? (
                <p className="text-sm text-[#000033]/50">No documents uploaded.</p>
              ) : (
                <div className="divide-y divide-[#000033]/5">
                  {candidate.documents.map((d) => (
                    <div key={d.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[#000033]">{d.name}</p>
                        <p className="text-xs text-[#000033]/60 capitalize">
                          {d.category.replace("_", " ")} ·{" "}
                          {format(new Date(d.uploadedAt), "d MMM yyyy")}
                        </p>
                      </div>
                      <a href={`${import.meta.env.BASE_URL}api/storage${d.objectPath}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="w-3.5 h-3.5 mr-2" />
                          Open
                        </Button>
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="interviews" className="mt-4">
            <div className="space-y-3">
              {candidate.interviews.length === 0 ? (
                <Card className="p-12 text-center bg-white border-dashed border-[#000033]/20">
                  <CalendarDays className="w-10 h-10 mx-auto text-[#000033]/20 mb-3" />
                  <p className="text-sm text-[#000033]/60 mb-4">No interviews scheduled yet.</p>
                  <Button
                    onClick={() => setInterviewDialogOpen(true)}
                    className="bg-[#000033] text-white hover:bg-[#000033]/90"
                  >
                    <CalendarPlus className="w-4 h-4 mr-2" />
                    Schedule the first one
                  </Button>
                </Card>
              ) : (
                candidate.interviews.map((iv) => (
                  <InterviewRow
                    key={iv.id}
                    interview={iv}
                    onUpdate={(id, data) => updateInterview.mutate({ id, data })}
                  />
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="offers" className="mt-4">
            <div className="space-y-3">
              {candidate.offers.length === 0 ? (
                <Card className="p-12 text-center bg-white border-dashed border-[#000033]/20">
                  <FileSignature className="w-10 h-10 mx-auto text-[#000033]/20 mb-3" />
                  <p className="text-sm text-[#000033]/60 mb-4">No offers yet.</p>
                  <Button
                    onClick={() => setOfferDialogOpen(true)}
                    className="bg-[#000033] text-white hover:bg-[#000033]/90"
                  >
                    <FileSignature className="w-4 h-4 mr-2" />
                    Create the first offer
                  </Button>
                </Card>
              ) : (
                candidate.offers.map((o) => (
                  <Card key={o.id} className="p-5 bg-white border-[#000033]/10">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-serif text-xl text-[#000033]">
                            {formatCurrency(o.salary, o.currency)}
                            <span className="text-sm font-sans text-[#000033]/60 font-normal"> / year</span>
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              o.status === "accepted"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : o.status === "declined"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : o.status === "sent"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-slate-100 text-slate-600 border-slate-200"
                            }
                          >
                            {o.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-[#000033]/70 capitalize">
                          {o.employmentType.replace("_", " ")} · {o.contractType.replace("_", " ")} · starts{" "}
                          {format(new Date(o.startDate), "d MMM yyyy")}
                        </p>
                        {o.benefitsNote && (
                          <p className="text-sm text-[#000033]/60 mt-2 leading-relaxed">{o.benefitsNote}</p>
                        )}
                        <p className="text-xs text-[#000033]/50 mt-2 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {o.sentAt
                            ? `Sent ${format(new Date(o.sentAt), "d MMM yyyy")}`
                            : `Created ${format(new Date(o.createdAt), "d MMM yyyy")}`}
                          {o.respondedAt && ` · Responded ${format(new Date(o.respondedAt), "d MMM yyyy")}`}
                        </p>
                      </div>
                      {(o.status === "sent" || o.status === "draft") && (
                        <div className="flex flex-col gap-2 min-w-[140px]">
                          {o.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateOffer.mutate({ id: o.id, data: { status: "sent" } })}
                            >
                              Mark as sent
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => updateOffer.mutate({ id: o.id, data: { status: "accepted" } })}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Accepted
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => {
                              const reason = prompt("Reason for declining?") ?? undefined;
                              updateOffer.mutate({
                                id: o.id,
                                data: { status: "declined", declinedReason: reason },
                              });
                            }}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1.5" />
                            Declined
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <Card className="p-5 bg-white border-[#000033]/10">
              <h2 className="font-serif text-lg text-[#000033] mb-4">Full timeline</h2>
              {sortedHistory.length === 0 ? (
                <p className="text-sm text-[#000033]/50">No history yet.</p>
              ) : (
                <ul className="space-y-4">
                  {sortedHistory.map((h) => (
                    <li key={h.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#C5A059]" />
                        <div className="w-px flex-1 bg-[#000033]/10 mt-1" />
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-sm text-[#000033]">
                          {h.fromStage ? (
                            <>
                              <span className="text-[#000033]/60">{STAGE_LABELS[h.fromStage as Stage] ?? h.fromStage}</span>
                              <ChevronRight className="w-3 h-3 inline mx-1 text-[#000033]/40" />
                            </>
                          ) : null}
                          <span className="font-medium">{STAGE_LABELS[h.toStage as Stage] ?? h.toStage}</span>
                        </p>
                        {h.note && <p className="text-xs text-[#000033]/60 mt-0.5">{h.note}</p>}
                        <p className="text-[10px] text-[#000033]/40 mt-1">
                          {format(new Date(h.changedAt), "d MMM yyyy 'at' HH:mm")} · {h.changedBy}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <StageDialog
        open={stageDialogOpen}
        onOpenChange={setStageDialogOpen}
        candidateId={candidate.id}
        currentStage={stage}
        candidateName={`${candidate.firstName} ${candidate.lastName}`}
      />
      <InterviewDialog
        open={interviewDialogOpen}
        onOpenChange={setInterviewDialogOpen}
        candidateId={candidate.id}
      />
      <OfferDialog
        open={offerDialogOpen}
        onOpenChange={setOfferDialogOpen}
        candidateId={candidate.id}
        defaultSalary={candidate.expectedSalary}
      />
      <ConvertDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        candidate={candidate}
      />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileUp,
  Loader2,
  Briefcase,
  MapPin,
  X,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import {
  type Job,
  useListPublicJobs,
  useSubmitApplication,
} from "@workspace/api-client-react";
import amigaLogo from "@/assets/amiga-logo.png";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatSalaryRange } from "@/lib/recruitment";
import { trackEvent } from "@/lib/analytics";

type DocCategory = "cv" | "cover_letter" | "passport" | "right_to_work" | "qualification" | "reference" | "other";
type RTW = "uk_citizen" | "settled" | "work_visa" | "sponsorship_required" | "unknown";

type UploadedDoc = {
  name: string;
  category: DocCategory;
  objectPath: string;
  fileSize: number;
  mimeType: string;
};

const CATEGORY_LABELS: Record<DocCategory, string> = {
  cv: "CV / Resume",
  cover_letter: "Cover letter",
  passport: "Passport / ID",
  right_to_work: "Right-to-work proof",
  qualification: "Qualification",
  reference: "Reference",
  other: "Other",
};

const CATEGORY_HINTS: Record<DocCategory, string> = {
  cv: "Required",
  cover_letter: "Optional",
  passport: "Optional now, needed if shortlisted",
  right_to_work: "Optional now, needed if shortlisted",
  qualification: "Optional",
  reference: "Optional",
  other: "",
};

const STEPS = ["About you", "Role & experience", "Documents"] as const;

function useQueryParam(name: string): string | null {
  const [value] = useState(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get(name);
  });
  return value;
}

async function uploadFile(file: File): Promise<{ objectPath: string }> {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}api/public/amiga/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    }),
  });
  if (!res.ok) throw new Error(`Failed to request upload URL: ${res.status}`);
  const { uploadURL, objectPath } = await res.json();
  const put = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
  return { objectPath };
}

function JobChip({ job }: { job: Job }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[#000033]/70 flex-wrap">
      <span className="flex items-center gap-1">
        <Briefcase className="w-3 h-3" />
        {job.department}
      </span>
      <span className="flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        {job.location}
      </span>
      <span>·</span>
      <span className="capitalize">{job.employmentType.replace("_", " ")}</span>
      <span>·</span>
      <span>{formatSalaryRange(job.salaryMin, job.salaryMax, job.currency)}</span>
    </div>
  );
}

export function Apply() {
  const { toast } = useToast();
  const preselectedJob = useQueryParam("job");
  const {
    data: jobs,
    isLoading: jobsLoading,
    isError: jobsFailed,
    isRefetching: jobsRefetching,
    refetch: refetchJobs,
  } = useListPublicJobs();

  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  const [jobId, setJobId] = useState<string>("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [yearsExperience, setYearsExperience] = useState<string>("");
  const [expectedSalary, setExpectedSalary] = useState<string>("");
  const [rightToWorkStatus, setRightToWorkStatus] = useState<RTW>("uk_citizen");
  const [coverLetter, setCoverLetter] = useState("");

  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionStartedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingCategory, setPendingCategory] = useState<DocCategory>("cv");

  useEffect(() => {
    if (preselectedJob) setJobId(preselectedJob);
  }, [preselectedJob]);

  useEffect(() => {
    // Do not submit an unverified job from a shared link if the roles request
    // failed before the applicant could see the current open-role list.
    if (jobsFailed && !jobs) setJobId("");
  }, [jobsFailed, jobs]);

  const selectedJob = useMemo(
    () => (jobId ? jobs?.find((j) => j.id === Number(jobId)) ?? null : null),
    [jobId, jobs],
  );

  const submit = useSubmitApplication({
    mutation: {
      onSuccess: () => {
        submissionStartedRef.current = false;
        setIsSubmitting(false);
        setSubmitted(true);
      },
      onError: () => {
        submissionStartedRef.current = false;
        setIsSubmitting(false);
        toast({
          title: "Submission failed",
          description: "Please check your details and try again.",
          variant: "destructive",
        });
      },
    },
  });

  function canAdvance(): boolean {
    if (step === 0) return Boolean(firstName && lastName && email);
    if (step === 1) return true;
    return true;
  }

  function next() {
    if (canAdvance() && step < STEPS.length - 1) setStep(step + 1);
  }
  function back() {
    if (step > 0) setStep(step - 1);
  }

  function handleJobsRetry() {
    trackEvent("jobs_load_retry", { page_context: "application_form" });

    void refetchJobs()
      .then(({ data: recoveredJobs, isSuccess }) => {
        if (!isSuccess) return;

        trackEvent("jobs_load_recovered", {
          page_context: "application_form",
          jobs_state: recoveredJobs?.length ? "populated" : "empty",
        });
      })
      .catch(() => {
        // The query state already exposes the failed retry to the applicant.
      });
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const { objectPath } = await uploadFile(file);
      setDocs((d) => [
        ...d,
        {
          name: file.name,
          category: pendingCategory,
          objectPath,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
        },
      ]);
      toast({ title: "Uploaded", description: file.name });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function send() {
    if (submissionStartedRef.current || submit.isPending) return;
    submissionStartedRef.current = true;
    setIsSubmitting(true);
    submit.mutate({
      data: {
        firstName,
        lastName,
        email,
        phone: phone || null,
        jobId: jobId ? Number(jobId) : null,
        linkedinUrl: linkedinUrl || null,
        currentCompany: currentCompany || null,
        currentRole: currentRole || null,
        yearsExperience: yearsExperience ? Number(yearsExperience) : null,
        expectedSalary: expectedSalary ? Number(expectedSalary) : null,
        rightToWorkStatus,
        coverLetter: coverLetter || null,
        documents: docs.length > 0 ? docs : undefined,
      },
    });
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg w-full"
        >
          <Card className="p-10 bg-white border-[#000033]/10 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h1 className="font-serif text-3xl text-[#000033] mb-3">Thank you</h1>
            <p className="text-[#000033]/70 leading-relaxed mb-8">
              Your application has been received. Our team reviews every applicant personally and will
              be in touch within five working days.
            </p>
            <p className="text-xs text-[#000033]/40">Amiga Specialty HR · Tower Bridge, London</p>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      <header className="border-b border-[#000033]/10 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={amigaLogo} alt="Amiga" className="h-9" />
            <div>
              <p className="font-serif text-base text-[#000033] leading-none">Amiga Specialty HR</p>
              <p className="text-[10px] text-[#000033]/50 mt-1 uppercase tracking-wider">Careers</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-[#C5A059]/10 text-[#7a5e1c] border-[#C5A059]/30">
            <Sparkles className="w-3 h-3 mr-1" />
            We&rsquo;re hiring
          </Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="font-serif text-4xl text-[#000033] leading-tight mb-3">
            Apply to join Amiga
          </h1>
          <p className="text-[#000033]/70 leading-relaxed">
            Three quick steps. We read every application personally — no algorithmic filtering, no
            chasing recruiters. Tell us about yourself and we&rsquo;ll be in touch within five
            working days.
          </p>
        </motion.div>

        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={`w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center ${
                  i <= step
                    ? "bg-[#000033] text-white"
                    : "bg-[#000033]/10 text-[#000033]/50"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-xs uppercase tracking-wider ${
                  i <= step ? "text-[#000033]" : "text-[#000033]/40"
                }`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px ${i < step ? "bg-[#000033]" : "bg-[#000033]/10"}`} />
              )}
            </div>
          ))}
        </div>

        <Card className="p-6 sm:p-8 bg-white border-[#000033]/10">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="grid gap-5"
              >
                <h2 className="font-serif text-xl text-[#000033]">About you</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>First name *</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Last name *</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Phone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>LinkedIn</Label>
                    <Input
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="grid gap-5"
              >
                <h2 className="font-serif text-xl text-[#000033]">Role &amp; experience</h2>
                <div className="grid gap-2">
                  <Label>Which role are you applying for?</Label>
                  <Select value={jobId || "none"} onValueChange={(v) => setJobId(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="application-job-select">
                      <SelectValue placeholder="General application" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">General application</SelectItem>
                      {(jobs ?? []).map((j) => (
                        <SelectItem key={j.id} value={String(j.id)}>
                          {j.title} — {j.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {jobsLoading && (
                    <p
                      className="text-xs text-[#000033]/50"
                      aria-live="polite"
                      data-testid="application-jobs-loading"
                    >
                      Loading open roles…
                    </p>
                  )}
                  {jobsFailed && (
                    <div
                      className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                      role="alert"
                      data-testid="application-jobs-error"
                    >
                      <p className="font-medium">We couldn&rsquo;t load the open roles.</p>
                      <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                        The roles service may be temporarily unavailable. Try again, or continue with
                        a general application and we&rsquo;ll keep it on file.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                        onClick={handleJobsRetry}
                        disabled={jobsRefetching}
                        data-testid="application-jobs-retry"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${jobsRefetching ? "animate-spin" : ""}`} />
                        {jobsRefetching ? "Trying again…" : "Try again"}
                      </Button>
                    </div>
                  )}
                  {!jobsLoading && !jobsFailed && jobs?.length === 0 && (
                    <p
                      className="mt-2 text-xs leading-relaxed text-[#000033]/60"
                      data-testid="application-jobs-empty"
                    >
                      There are no open roles right now, but you can still submit a general application.
                    </p>
                  )}
                  {selectedJob && (
                    <div
                      className="mt-2 p-3 rounded-md bg-[#000033]/[0.03] border border-[#000033]/10"
                      data-testid="application-selected-job"
                    >
                      <p
                        className="text-sm font-medium text-[#000033] mb-1"
                        data-testid="application-selected-job-title"
                      >
                        {selectedJob.title}
                      </p>
                      <JobChip job={selectedJob} />
                      {selectedJob.description && (
                        <p className="text-xs text-[#000033]/70 mt-2 leading-relaxed">
                          {selectedJob.description}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Current company</Label>
                    <Input
                      value={currentCompany}
                      onChange={(e) => setCurrentCompany(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Current role</Label>
                    <Input value={currentRole} onChange={(e) => setCurrentRole(e.target.value)} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Years of experience</Label>
                    <Input
                      type="number"
                      value={yearsExperience}
                      onChange={(e) => setYearsExperience(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Expected salary (£)</Label>
                    <Input
                      type="number"
                      value={expectedSalary}
                      onChange={(e) => setExpectedSalary(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Right to work in the UK</Label>
                  <Select value={rightToWorkStatus} onValueChange={(v) => setRightToWorkStatus(v as RTW)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uk_citizen">UK citizen</SelectItem>
                      <SelectItem value="settled">Settled status</SelectItem>
                      <SelectItem value="work_visa">Work visa</SelectItem>
                      <SelectItem value="sponsorship_required">I would need sponsorship</SelectItem>
                      <SelectItem value="unknown">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Why Amiga? (optional cover letter)</Label>
                  <Textarea
                    rows={5}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Tell us a little about why this role and Amiga interest you."
                  />
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                className="grid gap-5"
              >
                <h2 className="font-serif text-xl text-[#000033]">Documents</h2>
                <p className="text-sm text-[#000033]/70">
                  Attach your CV. You can also add a cover letter, ID, or qualifications now if
                  you&rsquo;d like to speed things up.
                </p>

                <div className="border-2 border-dashed border-[#000033]/20 rounded-lg p-6 bg-[#F8F7F4]">
                  <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                    <div className="grid gap-2">
                      <Label>Document type</Label>
                      <Select
                        value={pendingCategory}
                        onValueChange={(v) => setPendingCategory(v as DocCategory)}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(CATEGORY_LABELS) as DocCategory[]).map((c) => (
                            <SelectItem key={c} value={c}>
                              {CATEGORY_LABELS[c]}
                              {CATEGORY_HINTS[c] ? ` — ${CATEGORY_HINTS[c]}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleFile(f);
                        }}
                      />
                      <Button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="bg-[#000033] text-white hover:bg-[#000033]/90 w-full sm:w-auto"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Uploading…
                          </>
                        ) : (
                          <>
                            <FileUp className="w-4 h-4 mr-2" />
                            Upload file
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#000033]/50 mt-3">PDF, DOC, DOCX, PNG, JPG accepted.</p>
                </div>

                {docs.length > 0 && (
                  <div className="space-y-2">
                    <Label>Uploaded</Label>
                    {docs.map((d, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-white border border-[#000033]/10 rounded-md px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-[#000033] truncate">{d.name}</p>
                            <p className="text-[11px] text-[#000033]/50">{CATEGORY_LABELS[d.category]}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setDocs((arr) => arr.filter((_, j) => j !== i))}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#000033]/10">
            <Button variant="ghost" onClick={back} disabled={step === 0}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                onClick={next}
                disabled={!canAdvance()}
                className="bg-[#000033] text-white hover:bg-[#000033]/90"
              >
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={send}
                disabled={isSubmitting || submit.isPending}
                className="bg-[#C5A059] text-[#000033] hover:bg-[#B89048]"
              >
                {isSubmitting || submit.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    Submit application
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </Card>

        <p className="text-center text-[10px] text-[#000033]/40 mt-8">
          Amiga Specialty HR · A licensed product of Tower Street Web &amp; Apps
        </p>
      </main>
    </div>
  );
}

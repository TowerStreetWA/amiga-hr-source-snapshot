import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  FileCheck2,
  FileUp,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import {
  type Job,
  useListPublicJobs,
  useSubmitApplication,
} from "@workspace/api-client-react";
import amigaLogo from "@/assets/amiga-logo.png";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Step = "profile" | "experience" | "references" | "documents";
type DocumentCategory = "cv" | "passport";

type UploadedDocument = {
  name: string;
  category: DocumentCategory;
  objectPath: string;
  fileSize: number;
  mimeType: string;
};

type Reference = {
  name: string;
  company: string;
  jobTitle: string;
  email: string;
  phone: string;
};

const STEPS: { id: Step; label: string; shortLabel: string }[] = [
  { id: "profile", label: "About you", shortLabel: "You" },
  { id: "experience", label: "Your experience", shortLabel: "Experience" },
  { id: "references", label: "References", shortLabel: "References" },
  { id: "documents", label: "Documents", shortLabel: "Documents" },
];

const EMPTY_REFERENCE: Reference = {
  name: "",
  company: "",
  jobTitle: "",
  email: "",
  phone: "",
};

function cleanNumber(value: string): number | null {
  const number = Number(value);
  return value.trim() === "" || Number.isNaN(number) ? null : number;
}

function jobMeta(job: Job): string {
  const employment = job.employmentType.replace("_", " ");
  return [job.department, job.location, employment]
    .filter(Boolean)
    .join(" · ");
}

async function uploadDocument(file: File): Promise<{ objectPath: string }> {
  const base = import.meta.env.BASE_URL;
  const response = await fetch(`${base}api/public/amiga/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    }),
  });

  if (!response.ok) {
    throw new Error("We could not prepare that upload. Please try again.");
  }

  const { uploadURL, objectPath } = await response.json();
  const upload = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });

  if (!upload.ok) {
    throw new Error("That file could not be uploaded. Please try again.");
  }

  return { objectPath };
}

function Field({
  id,
  label,
  required,
  hint,
  children,
}: {
  id?: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-[#111936]">
        {label}
        {required ? <span className="ml-1 text-[#a16d35]">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-[#263552]/55">{hint}</p> : null}
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a16d35]">
        {eyebrow}
      </p>
      <h2 className="font-serif text-2xl leading-tight text-[#111936] sm:text-[28px]">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#263552]/65">{children}</p>
    </div>
  );
}

function ReferenceFields({
  index,
  reference,
  onChange,
}: {
  index: number;
  reference: Reference;
  onChange: (key: keyof Reference, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#d8d6cf] bg-[#fbfaf7] p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e8eee9] text-xs font-semibold text-[#31584e]">
          {index}
        </span>
        <div>
          <h3 className="font-medium text-[#111936]">Business reference {index}</h3>
          <p className="text-xs text-[#263552]/55">Someone who can speak about your work.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`reference-${index}-name`} label="Name" required>
          <Input
            id={`reference-${index}-name`}
            value={reference.name}
            onChange={(event) => onChange("name", event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field id={`reference-${index}-company`} label="Company" required>
          <Input
            id={`reference-${index}-company`}
            value={reference.company}
            onChange={(event) => onChange("company", event.target.value)}
            autoComplete="organization"
          />
        </Field>
        <Field id={`reference-${index}-job-title`} label="Job title" required>
          <Input
            id={`reference-${index}-job-title`}
            value={reference.jobTitle}
            onChange={(event) => onChange("jobTitle", event.target.value)}
            autoComplete="organization-title"
          />
        </Field>
        <Field id={`reference-${index}-email`} label="Email" required>
          <Input
            id={`reference-${index}-email`}
            type="email"
            value={reference.email}
            onChange={(event) => onChange("email", event.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field id={`reference-${index}-phone`} label="Phone" required>
          <Input
            id={`reference-${index}-phone`}
            type="tel"
            value={reference.phone}
            onChange={(event) => onChange("phone", event.target.value)}
            autoComplete="tel"
          />
        </Field>
      </div>
    </div>
  );
}

export function CandidateOnboarding() {
  const {
    data: jobs,
    isLoading: jobsLoading,
    isError: jobsFailed,
    isRefetching: jobsRefetching,
    refetch: refetchJobs,
  } = useListPublicJobs();
  const submit = useSubmitApplication();

  const [step, setStep] = useState<Step>("profile");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadingCategory, setUploadingCategory] = useState<DocumentCategory | null>(null);
  const [consent, setConsent] = useState(false);
  const submissionStartedRef = useRef(false);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const passportInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobId, setJobId] = useState("");
  const [currentCompany, setCurrentCompany] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [currentSalary, setCurrentSalary] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [lastBonusAmount, setLastBonusAmount] = useState("");
  const [lastBonusPercentage, setLastBonusPercentage] = useState("");
  const [currentPensionPercentage, setCurrentPensionPercentage] = useState("");
  const [referenceOne, setReferenceOne] = useState<Reference>({ ...EMPTY_REFERENCE });
  const [referenceTwo, setReferenceTwo] = useState<Reference>({ ...EMPTY_REFERENCE });
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);

  const openJobs = useMemo(() => (jobs ?? []).filter((job) => job.status === "open"), [jobs]);
  const selectedJob = useMemo(
    () => openJobs.find((job) => String(job.id) === jobId) ?? null,
    [jobId, openJobs],
  );
  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const cv = documents.find((document) => document.category === "cv");
  const passport = documents.find((document) => document.category === "passport");
  const busy = uploadingCategory !== null || submit.isPending;

  function updateReference(
    which: "one" | "two",
    key: keyof Reference,
    value: string,
  ) {
    const setter = which === "one" ? setReferenceOne : setReferenceTwo;
    setter((current) => ({ ...current, [key]: value }));
  }

  function stepIsComplete(currentStep: Step): boolean {
    if (currentStep === "profile") {
      return Boolean(firstName.trim() && lastName.trim() && email.trim() && phone.trim() && jobId);
    }
    if (currentStep === "experience") {
      return Boolean(currentCompany.trim() && currentRole.trim() && currentSalary.trim() && noticePeriod.trim() && expectedSalary.trim());
    }
    if (currentStep === "references") {
      return Object.values(referenceOne).every(Boolean) && Object.values(referenceTwo).every(Boolean);
    }
    return Boolean(cv && passport && consent);
  }

  function validateStep(currentStep: Step): boolean {
    if (stepIsComplete(currentStep)) {
      setValidationError("");
      return true;
    }

    const message =
      currentStep === "profile"
        ? "Please add your name, email, phone number and choose a role."
        : currentStep === "experience"
          ? "Please complete the current role, salary, notice period and expectations."
          : currentStep === "references"
            ? "Please complete both business references before continuing."
            : "Please upload both documents and confirm the privacy statement.";
    setValidationError(message);
    return false;
  }

  function nextStep() {
    if (!validateStep(step)) return;
    const next = STEPS[stepIndex + 1];
    if (next) {
      setStep(next.id);
      setValidationError("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function previousStep() {
    const previous = STEPS[stepIndex - 1];
    if (previous) {
      setStep(previous.id);
      setValidationError("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleFile(file: File, category: DocumentCategory) {
    setUploadError("");
    setUploadingCategory(category);
    try {
      const { objectPath } = await uploadDocument(file);
      const uploaded: UploadedDocument = {
        name: file.name,
        category,
        objectPath,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
      };
      setDocuments((current) => [
        ...current.filter((document) => document.category !== category),
        uploaded,
      ]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "That file could not be uploaded.");
    } finally {
      setUploadingCategory(null);
      if (category === "cv" && cvInputRef.current) cvInputRef.current.value = "";
      if (category === "passport" && passportInputRef.current) passportInputRef.current.value = "";
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionStartedRef.current || submit.isPending) return;
    if (!validateStep("documents")) return;

    submissionStartedRef.current = true;
    setSubmitError("");
    submit.mutate(
      {
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          jobId: Number(jobId),
          currentCompany: currentCompany.trim(),
          currentRole: currentRole.trim(),
          currentSalary: cleanNumber(currentSalary),
          noticePeriod: noticePeriod.trim(),
          expectedSalary: cleanNumber(expectedSalary),
          lastBonusAmount: cleanNumber(lastBonusAmount),
          lastBonusPercentage: cleanNumber(lastBonusPercentage),
          currentPensionPercentage: cleanNumber(currentPensionPercentage),
          referenceOneName: referenceOne.name.trim(),
          referenceOneCompany: referenceOne.company.trim(),
          referenceOneJobTitle: referenceOne.jobTitle.trim(),
          referenceOneEmail: referenceOne.email.trim(),
          referenceOnePhone: referenceOne.phone.trim(),
          referenceTwoName: referenceTwo.name.trim(),
          referenceTwoCompany: referenceTwo.company.trim(),
          referenceTwoJobTitle: referenceTwo.jobTitle.trim(),
          referenceTwoEmail: referenceTwo.email.trim(),
          referenceTwoPhone: referenceTwo.phone.trim(),
          documents: documents.map(({ name, category, objectPath, fileSize, mimeType }) => ({
            name,
            category,
            objectPath,
            fileSize,
            mimeType,
          })),
        },
      },
      {
        onSuccess: () => {
          submissionStartedRef.current = false;
          setSubmitted(true);
        },
        onError: () => {
          submissionStartedRef.current = false;
          setSubmitError("We could not send your details just now. Please check your connection and try again.");
        },
      },
    );
  }

  if (submitted) {
    return (
      <div className="min-h-[100dvh] bg-[#f5f4ef] px-5 py-8 text-[#111936] sm:px-8 sm:py-12">
        <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-xl items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            <Card className="overflow-hidden border-[#d8d6cf] bg-[#fffdfa] shadow-[0_20px_60px_rgba(22,32,62,0.08)]">
              <div className="h-2 bg-[#31584e]" />
              <div className="px-6 py-10 text-center sm:px-12 sm:py-14">
                <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-[#e8eee9]">
                  <CheckCircle2 className="h-8 w-8 text-[#31584e]" />
                </div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a16d35]">
                  Application received
                </p>
                <h1 className="font-serif text-4xl leading-tight text-[#111936]">Thank you, {firstName}.</h1>
                <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#263552]/70">
                  Your details are safely with our team. We will review them personally and be in touch
                  when there is a good next step to discuss.
                </p>
                <div className="mx-auto mt-8 flex max-w-sm items-start gap-3 border-t border-[#e3e1da] pt-5 text-left">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#31584e]" />
                  <p className="text-xs leading-relaxed text-[#263552]/60">
                    Your information will only be used for recruitment and handled with care.
                  </p>
                </div>
              </div>
              <div className="border-t border-[#e3e1da] bg-[#fbfaf7] px-6 py-4 text-center text-[11px] text-[#263552]/50">
                Amiga Specialty HR · London
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f5f4ef] text-[#111936]">
      <header className="border-b border-[#d8d6cf] bg-[#fffdfa]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <img src={amigaLogo} alt="Amiga Specialty HR" className="h-9 w-auto" />
            <div className="hidden border-l border-[#d8d6cf] pl-3 sm:block">
              <p className="font-serif text-base leading-none text-[#111936]">Amiga Specialty HR</p>
              <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-[#263552]/50">
                Candidate intake
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#263552]/60">
            <LockKeyhole className="h-3.5 w-3.5 text-[#31584e]" />
            <span className="hidden sm:inline">Private and secure</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(220px,0.72fr)_minmax(0,1.6fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="max-w-xl">
            <Badge className="border border-[#d8d6cf] bg-[#e8eee9] font-medium text-[#31584e] hover:bg-[#e8eee9]">
              A considered first step
            </Badge>
            <h1 className="mt-5 font-serif text-[clamp(2.4rem,5vw,4.3rem)] leading-[0.98] tracking-[-0.03em] text-[#111936]">
              Let&apos;s get to know your work.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-[#263552]/70">
              A few details help us understand where you are now and what might be right next.
              There is no need to make this sound like a cover letter.
            </p>
            <div className="mt-8 hidden border-t border-[#d8d6cf] pt-5 lg:block">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#31584e]" />
                <p className="text-xs leading-relaxed text-[#263552]/60">
                  We treat candidate information with discretion and only use it for recruitment
                  conversations.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-7">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-[#263552]/60">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
              <p className="text-xs text-[#263552]/50">{STEPS[stepIndex].label}</p>
            </div>
            <div className="flex gap-1.5">
              {STEPS.map((item, index) => (
                <div
                  key={item.id}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    index <= stepIndex ? "bg-[#31584e]" : "bg-[#d8d6cf]"
                  }`}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-4 text-[10px] uppercase tracking-[0.12em] text-[#263552]/45">
              {STEPS.map((item, index) => (
                <span key={item.id} className={index === stepIndex ? "font-semibold text-[#31584e]" : ""}>
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.shortLabel}</span>
                </span>
              ))}
            </div>
          </div>

          <Card className="border-[#d8d6cf] bg-[#fffdfa] shadow-[0_16px_45px_rgba(22,32,62,0.06)]">
            <form onSubmit={handleSubmit}>
              <div className="p-5 sm:p-8">
                <AnimatePresence mode="wait" initial={false}>
                  {step === "profile" && (
                    <motion.div
                      key="profile"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      className="grid gap-5"
                    >
                      <SectionIntro eyebrow="About you" title="Start with the essentials">
                        Tell us how to reach you and which opportunity has caught your eye.
                      </SectionIntro>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="first-name" label="First name" required>
                          <Input id="first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
                        </Field>
                        <Field id="last-name" label="Last name" required>
                          <Input id="last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
                        </Field>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="email" label="Email address" required>
                          <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" />
                        </Field>
                        <Field id="phone" label="Phone number" required>
                          <Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+44" />
                        </Field>
                      </div>
                      <Field id="job" label="Position you are interested in" required hint="Choose from our current open roles.">
                        <Select value={jobId} onValueChange={setJobId}>
                          <SelectTrigger id="job" className="h-10 bg-[#fffdfa]">
                            <SelectValue placeholder={jobsLoading ? "Loading open roles…" : "Select an open role"} />
                          </SelectTrigger>
                          <SelectContent>
                            {openJobs.map((job) => (
                              <SelectItem key={job.id} value={String(job.id)}>
                                {job.title} · {job.department}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      {jobsLoading && (
                        <div className="flex items-center gap-2 rounded-lg bg-[#f5f4ef] px-3 py-2 text-xs text-[#263552]/60">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading current open roles
                        </div>
                      )}
                      {jobsFailed && (
                        <div className="rounded-lg border border-[#d8c8a7] bg-[#fbf6e9] p-4 text-sm text-[#644c26]" role="alert">
                          <p className="font-medium">Open roles are temporarily unavailable.</p>
                          <p className="mt-1 text-xs leading-relaxed text-[#644c26]/75">
                            Please try again so you can choose a live position.
                          </p>
                          <Button type="button" variant="outline" size="sm" className="mt-3 border-[#cbb98f] bg-transparent text-[#644c26]" onClick={() => void refetchJobs()} disabled={jobsRefetching}>
                            <RefreshCw className={`h-3.5 w-3.5 ${jobsRefetching ? "animate-spin" : ""}`} />
                            {jobsRefetching ? "Trying again" : "Try again"}
                          </Button>
                        </div>
                      )}
                      {!jobsLoading && !jobsFailed && openJobs.length === 0 && (
                        <p className="rounded-lg bg-[#f5f4ef] p-3 text-xs leading-relaxed text-[#263552]/60">
                          There are no open roles available at the moment. Please return when a suitable opportunity is live.
                        </p>
                      )}
                      {selectedJob && (
                        <div className="rounded-xl border border-[#d8d6cf] bg-[#f5f4ef] p-4">
                          <div className="flex items-start gap-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e8eee9] text-[#31584e]">
                              <BriefcaseBusiness className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-[#111936]">{selectedJob.title}</p>
                              <p className="mt-1 flex items-center gap-1 text-xs text-[#263552]/60">
                                <MapPin className="h-3 w-3" /> {jobMeta(selectedJob)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {step === "experience" && (
                    <motion.div
                      key="experience"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      className="grid gap-5"
                    >
                      <SectionIntro eyebrow="Your experience" title="A little context helps">
                        We ask about your current package so we can be thoughtful about the right
                        conversations. All salary figures are in GBP.
                      </SectionIntro>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="current-company" label="Current company" required>
                          <Input id="current-company" value={currentCompany} onChange={(event) => setCurrentCompany(event.target.value)} autoComplete="organization" />
                        </Field>
                        <Field id="current-role" label="Current role" required>
                          <Input id="current-role" value={currentRole} onChange={(event) => setCurrentRole(event.target.value)} autoComplete="organization-title" />
                        </Field>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="current-salary" label="Current salary (GBP)" required>
                          <Input id="current-salary" type="number" min="0" inputMode="numeric" value={currentSalary} onChange={(event) => setCurrentSalary(event.target.value)} placeholder="e.g. 65000" />
                        </Field>
                        <Field id="notice-period" label="Notice period" required>
                          <Input id="notice-period" value={noticePeriod} onChange={(event) => setNoticePeriod(event.target.value)} placeholder="e.g. 3 months" />
                        </Field>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="expected-salary" label="Expected salary (GBP)" required>
                          <Input id="expected-salary" type="number" min="0" inputMode="numeric" value={expectedSalary} onChange={(event) => setExpectedSalary(event.target.value)} placeholder="e.g. 72000" />
                        </Field>
                        <Field id="current-pension" label="Current pension percentage" hint="Optional — enter a percentage, such as 5.5.">
                          <Input id="current-pension" type="number" min="0" max="100" step="0.1" inputMode="decimal" value={currentPensionPercentage} onChange={(event) => setCurrentPensionPercentage(event.target.value)} placeholder="%" />
                        </Field>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="last-bonus-amount" label="Last bonus amount (GBP)" hint="Optional">
                          <Input id="last-bonus-amount" type="number" min="0" inputMode="numeric" value={lastBonusAmount} onChange={(event) => setLastBonusAmount(event.target.value)} placeholder="e.g. 8000" />
                        </Field>
                        <Field id="last-bonus-percentage" label="Last bonus percentage" hint="Optional">
                          <Input id="last-bonus-percentage" type="number" min="0" max="100" step="0.1" inputMode="decimal" value={lastBonusPercentage} onChange={(event) => setLastBonusPercentage(event.target.value)} placeholder="%" />
                        </Field>
                      </div>
                    </motion.div>
                  )}

                  {step === "references" && (
                    <motion.div
                      key="references"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      className="grid gap-5"
                    >
                      <SectionIntro eyebrow="References" title="Who can vouch for your work?">
                        Please provide two business references. We will always speak with you before
                        contacting anyone.
                      </SectionIntro>
                      <ReferenceFields index={1} reference={referenceOne} onChange={(key, value) => updateReference("one", key, value)} />
                      <ReferenceFields index={2} reference={referenceTwo} onChange={(key, value) => updateReference("two", key, value)} />
                    </motion.div>
                  )}

                  {step === "documents" && (
                    <motion.div
                      key="documents"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      className="grid gap-5"
                    >
                      <SectionIntro eyebrow="Documents" title="Finish with two essentials">
                        Upload your CV and passport. We use these only to understand your experience
                        and progress your application appropriately.
                      </SectionIntro>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {([
                          { category: "cv" as const, label: "CV", detail: "PDF, DOC or DOCX", input: cvInputRef, document: cv },
                          { category: "passport" as const, label: "Passport", detail: "PDF, PNG or JPG", input: passportInputRef, document: passport },
                        ]).map((item) => (
                          <div key={item.category} className="rounded-xl border border-[#d8d6cf] bg-[#fbfaf7] p-4">
                            <div className="mb-4 flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e8eee9] text-[#31584e]">
                                  {item.category === "cv" ? <FileCheck2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                                </div>
                                <div>
                                  <p className="font-medium text-[#111936]">{item.label}</p>
                                  <p className="mt-0.5 text-[11px] text-[#263552]/55">{item.detail}</p>
                                </div>
                              </div>
                              {item.document ? <CheckCircle2 className="h-4 w-4 text-[#31584e]" /> : null}
                            </div>
                            {item.document ? (
                              <div className="flex items-center justify-between gap-2 rounded-lg border border-[#d8d6cf] bg-[#fffdfa] px-3 py-2">
                                <p className="min-w-0 truncate text-xs text-[#263552]/70">{item.document.name}</p>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setDocuments((current) => current.filter((document) => document.category !== item.category))} aria-label={`Remove ${item.label.toLowerCase()}`}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <input
                                  ref={item.input}
                                  type="file"
                                  className="hidden"
                                  accept={item.category === "cv" ? ".pdf,.doc,.docx" : ".pdf,.png,.jpg,.jpeg"}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) void handleFile(file, item.category);
                                  }}
                                />
                                <Button type="button" variant="outline" className="w-full border-[#c8c6be] bg-[#fffdfa] text-[#31584e]" onClick={() => item.input.current?.click()} disabled={busy}>
                                  {uploadingCategory === item.category ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                                  {uploadingCategory === item.category ? "Uploading" : "Choose file"}
                                </Button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      {uploadError ? (
                        <div className="rounded-lg border border-[#e4b9ae] bg-[#fdf1ed] p-3 text-xs leading-relaxed text-[#8d4338]" role="alert">
                          {uploadError}
                        </div>
                      ) : null}
                      <div className="flex items-start gap-3 rounded-xl border border-[#d8d6cf] bg-[#f5f4ef] p-4">
                        <Checkbox id="consent" checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-0.5 border-[#31584e] data-[state=checked]:bg-[#31584e]" />
                        <Label htmlFor="consent" className="cursor-pointer text-xs font-normal leading-relaxed text-[#263552]/75">
                          I confirm that the information I have provided is accurate and I consent to
                          Amiga Specialty HR using it to assess my application and contact me about
                          relevant opportunities.
                        </Label>
                      </div>
                      <div className="flex items-start gap-2 text-xs leading-relaxed text-[#263552]/55">
                        <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#31584e]" />
                        <p>Your documents are transferred securely and are only visible to the recruitment team.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {validationError ? (
                  <p className="mt-5 rounded-lg border border-[#e4b9ae] bg-[#fdf1ed] px-3 py-2.5 text-xs leading-relaxed text-[#8d4338]" role="alert">
                    {validationError}
                  </p>
                ) : null}
                {submitError ? (
                  <div className="mt-5 flex items-start gap-2 rounded-lg border border-[#e4b9ae] bg-[#fdf1ed] px-3 py-2.5 text-xs leading-relaxed text-[#8d4338]" role="alert">
                    <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-[#e3e1da] bg-[#fbfaf7] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <Button type="button" variant="ghost" onClick={previousStep} disabled={stepIndex === 0 || busy} className="justify-center text-[#263552]/70 sm:justify-start">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                {step !== "documents" ? (
                  <Button type="button" onClick={nextStep} disabled={busy} className="bg-[#111936] text-[#fffdfa] hover:bg-[#263052]">
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={busy || !consent || !cv || !passport} className="bg-[#a16d35] text-[#fffdfa] hover:bg-[#8e5d2c]">
                    {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {submit.isPending ? "Sending details" : "Submit securely"}
                  </Button>
                )}
              </div>
            </form>
          </Card>
          <p className="mt-5 text-center text-[10px] leading-relaxed text-[#263552]/45">
            Amiga Specialty HR · We take your privacy seriously
          </p>
        </section>
      </main>
    </div>
  );
}

export default CandidateOnboarding;
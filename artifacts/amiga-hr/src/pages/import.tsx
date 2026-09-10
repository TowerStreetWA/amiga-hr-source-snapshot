import { useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowLeft,
  Loader2,
  Mail,
  Users,
} from "lucide-react";
import {
  usePreviewImport,
  useCommitImport,
  getListEmployeesQueryKey,
  type ImportRowError,
  type ImportCommitResultEmployee,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Step = 1 | 2 | 3;

const TEMPLATE_URL = `${import.meta.env.BASE_URL}api/import/template`;

function rowField(row: ImportRowError, key: string): string {
  const v = row.data?.[key];
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

export function ImportPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{
    summary: { total: number; valid: number; invalid: number };
    rows: ImportRowError[];
  } | null>(null);
  const [sendWelcomeEmails, setSendWelcomeEmails] = useState(true);
  const [tempPassword, setTempPassword] = useState("Amiga2026!");
  const [commitResult, setCommitResult] = useState<{
    imported: number;
    skipped: number;
    emailsSent: number;
    employees: ImportCommitResultEmployee[];
  } | null>(null);

  const previewMut = usePreviewImport({
    mutation: {
      onSuccess: (data) => {
        setPreview(data);
        setStep(2);
      },
      onError: async (err: unknown) => {
        let msg = "We couldn't read that file. Try the template format.";
        if (err && typeof err === "object" && "message" in err) {
          msg = String((err as { message?: string }).message ?? msg);
        }
        toast({ title: "Could not parse file", description: msg, variant: "destructive" });
      },
    },
  });

  const commitMut = useCommitImport({
    mutation: {
      onSuccess: (data) => {
        setCommitResult(data);
        setStep(3);
        qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      },
      onError: () => {
        toast({
          title: "Import failed",
          description: "Something went wrong saving these employees. Please try again.",
          variant: "destructive",
        });
      },
    },
  });

  const onFile = (f: File) => {
    setFile(f);
    previewMut.mutate({ data: { file: f } });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCommitResult(null);
    setStep(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const commit = () => {
    if (!preview) return;
    const validRows = preview.rows
      .filter((r) => r.status === "ok")
      .map((r) => r.data as Record<string, unknown>);
    commitMut.mutate({
      data: {
        rows: validRows,
        sendWelcomeEmails,
        temporaryPassword: tempPassword.trim() || null,
      },
    });
  };

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <header>
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <UploadCloud className="h-4 w-4 text-[#C5A059]" /> People Operations
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Bulk employee import</h1>
          <p className="text-[#000033]/60 mt-1">
            Upload an Excel or CSV file to add multiple employees at once. Welcome emails are optional.
          </p>
        </header>

        <div className="flex items-center gap-3 text-sm">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center font-semibold ${
                  step === n
                    ? "bg-[#000033] text-white"
                    : step > n
                    ? "bg-[#C5A059] text-white"
                    : "bg-[#000033]/10 text-[#000033]/50"
                }`}
                data-testid={`step-indicator-${n}`}
              >
                {step > n ? <CheckCircle2 className="h-4 w-4" /> : n}
              </div>
              <span className={step >= n ? "text-[#000033] font-medium" : "text-[#000033]/40"}>
                {n === 1 ? "Upload file" : n === 2 ? "Review & confirm" : "Done"}
              </span>
              {n < 3 && <div className="w-8 h-px bg-[#000033]/20" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <Card className="border-[#000033]/10">
            <CardContent className="p-8 space-y-6">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div>
                  <h2 className="text-xl font-serif text-[#000033]">1. Choose your file</h2>
                  <p className="text-[#000033]/60 text-sm mt-1">
                    Drag &amp; drop an .xlsx, .xls or .csv file, or click to browse.
                  </p>
                </div>
                <a href={TEMPLATE_URL} download data-testid="link-download-template">
                  <Button
                    variant="outline"
                    className="border-[#C5A059] text-[#000033] hover:bg-[#C5A059]/10"
                  >
                    <Download className="h-4 w-4 mr-2" /> Download template
                  </Button>
                </a>
              </div>

              <div
                role="button"
                tabIndex={0}
                aria-label="Upload an Excel or CSV file of employees. Press Enter to browse or drop a file here."
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C5A059] ${
                  dragOver
                    ? "border-[#C5A059] bg-[#C5A059]/5"
                    : "border-[#000033]/20 hover:border-[#C5A059] hover:bg-[#C5A059]/5"
                }`}
                data-testid="dropzone-import"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                  data-testid="input-import-file"
                />
                {previewMut.isPending ? (
                  <div className="flex flex-col items-center gap-3 text-[#000033]/70">
                    <Loader2 className="h-10 w-10 animate-spin text-[#C5A059]" />
                    <p>Reading {file?.name}…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-[#000033]/70">
                    <FileSpreadsheet className="h-12 w-12 text-[#C5A059]" />
                    <p className="font-medium text-[#000033]">Drop your file here</p>
                    <p className="text-sm">or click anywhere in this box to browse</p>
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-[#000033]/5 p-4 text-sm text-[#000033]/70">
                <p className="font-medium text-[#000033] mb-1">Required columns</p>
                <p>
                  First Name, Last Name, Email, Job Title, Department, Start Date. Optional: Phone,
                  Status, Employment Type, Salary, Currency, Date of Birth, City, Postcode, Country.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && preview && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-[#000033]/10">
                <CardContent className="py-5">
                  <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">
                    Total rows
                  </p>
                  <p className="text-3xl font-serif text-[#000033] mt-1" data-testid="text-summary-total">
                    {preview.summary.total}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-[#000033]/10">
                <CardContent className="py-5">
                  <p className="text-xs uppercase tracking-wider text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Ready to import
                  </p>
                  <p
                    className="text-3xl font-serif text-emerald-700 mt-1"
                    data-testid="text-summary-valid"
                  >
                    {preview.summary.valid}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-[#000033]/10">
                <CardContent className="py-5">
                  <p className="text-xs uppercase tracking-wider text-rose-700 font-semibold flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> Will be skipped
                  </p>
                  <p
                    className="text-3xl font-serif text-rose-700 mt-1"
                    data-testid="text-summary-invalid"
                  >
                    {preview.summary.invalid}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-[#000033]/10">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#000033]/5 text-[#000033]/70 uppercase text-xs tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-3">Row</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Name</th>
                        <th className="text-left px-4 py-3">Email</th>
                        <th className="text-left px-4 py-3">Department</th>
                        <th className="text-left px-4 py-3">Start date</th>
                        <th className="text-left px-4 py-3">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r) => (
                        <tr
                          key={r.rowNumber}
                          className="border-t border-[#000033]/5"
                          data-testid={`row-preview-${r.rowNumber}`}
                        >
                          <td className="px-4 py-3 text-[#000033]/60">{r.rowNumber}</td>
                          <td className="px-4 py-3">
                            {r.status === "ok" ? (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                                Valid
                              </Badge>
                            ) : (
                              <Badge className="bg-rose-100 text-rose-700 border-rose-200">
                                Error
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[#000033]">
                            {rowField(r, "firstName")} {rowField(r, "lastName")}
                          </td>
                          <td className="px-4 py-3 text-[#000033]/80">{rowField(r, "email")}</td>
                          <td className="px-4 py-3 text-[#000033]/80">
                            {rowField(r, "department")}
                          </td>
                          <td className="px-4 py-3 text-[#000033]/80">
                            {rowField(r, "startDate")}
                          </td>
                          <td className="px-4 py-3">
                            {r.errors.length === 0 ? (
                              <span className="text-[#000033]/30">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {r.errors.map((e, i) => (
                                  <span
                                    key={i}
                                    className="inline-block bg-rose-50 text-rose-700 text-xs px-2 py-1 rounded border border-rose-200"
                                  >
                                    {e}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-[#000033]/10">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="send-welcome"
                    checked={sendWelcomeEmails}
                    onCheckedChange={(v) => setSendWelcomeEmails(v === true)}
                    data-testid="checkbox-send-welcome"
                  />
                  <div className="flex-1">
                    <Label htmlFor="send-welcome" className="text-[#000033] font-medium">
                      Send welcome emails to new employees
                    </Label>
                    <p className="text-sm text-[#000033]/60 mt-1">
                      Each new employee receives a branded welcome with their temporary password.
                      Emails are only sent if SMTP is configured under Settings.
                    </p>
                  </div>
                </div>

                {sendWelcomeEmails && (
                  <div className="pl-7 max-w-sm">
                    <Label htmlFor="temp-password" className="text-sm text-[#000033]">
                      Temporary password <span className="text-rose-600">*</span>
                    </Label>
                    <Input
                      id="temp-password"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      className="mt-1"
                      data-testid="input-temp-password"
                    />
                    <p className="text-xs text-[#000033]/60 mt-1">
                      Sent to each new employee in their welcome email. They'll be asked to change
                      it on first sign-in.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={reset}
                className="border-[#000033]/20 text-[#000033]"
                data-testid="button-back-to-upload"
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
              <Button
                onClick={commit}
                disabled={
                  preview.summary.valid === 0 ||
                  commitMut.isPending ||
                  (sendWelcomeEmails && !tempPassword.trim())
                }
                className="bg-[#C5A059] hover:bg-[#B08F4F] text-white"
                data-testid="button-commit-import"
              >
                {commitMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Import {preview.summary.valid} employee{preview.summary.valid === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && commitResult && (
          <Card className="border-[#000033]/10">
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-emerald-700" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif text-[#000033]">Import complete</h2>
                  <p className="text-[#000033]/60 mt-1" data-testid="text-import-summary">
                    Added {commitResult.imported} new employee
                    {commitResult.imported === 1 ? "" : "s"}
                    {commitResult.emailsSent > 0
                      ? ` and sent ${commitResult.emailsSent} welcome email${
                          commitResult.emailsSent === 1 ? "" : "s"
                        }.`
                      : "."}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-[#000033]/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#000033]/5 text-[#000033]/70 uppercase text-xs tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-3">Employee #</th>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Email</th>
                      <th className="text-left px-4 py-3">Welcome email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commitResult.employees.map((emp) => (
                      <tr
                        key={emp.id}
                        className="border-t border-[#000033]/5"
                        data-testid={`row-imported-${emp.employeeNumber}`}
                      >
                        <td className="px-4 py-3 font-mono text-[#000033]/80">
                          {emp.employeeNumber}
                        </td>
                        <td className="px-4 py-3 text-[#000033]">
                          {emp.firstName} {emp.lastName}
                        </td>
                        <td className="px-4 py-3 text-[#000033]/80">{emp.email}</td>
                        <td className="px-4 py-3">
                          {emp.emailSent ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                              <Mail className="h-3 w-3 mr-1" /> Sent
                            </Badge>
                          ) : (
                            <Badge className="bg-[#000033]/5 text-[#000033]/60 border-[#000033]/10">
                              Skipped
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <Link href="/employees">
                  <Button
                    className="bg-[#000033] hover:bg-[#000033]/90 text-white"
                    data-testid="button-go-employees"
                  >
                    <Users className="h-4 w-4 mr-2" /> Go to Employees
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={reset}
                  className="border-[#000033]/20 text-[#000033]"
                  data-testid="button-import-another"
                >
                  Import another file
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  Settings as SettingsIcon,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  KeyRound,
  Server,
} from "lucide-react";
import {
  useGetEmailSettings,
  useSendTestEmail,
  getGetEmailSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const SECRET_INSTRUCTIONS: Record<string, string> = {
  SMTP_HOST: "Your SMTP server hostname (e.g. smtp.gmail.com or smtp.sendgrid.net)",
  SMTP_PORT: "Optional. Defaults to 587 (STARTTLS) or 465 (TLS).",
  SMTP_USER: "The username for authenticating to SMTP.",
  SMTP_PASS: "The password or API key for SMTP.",
  SMTP_FROM: 'The "From" address, e.g. "Amiga HR <hr@amigaspecialty.com>"',
  HR_NOTIFICATION_EMAIL: "Optional. Address that receives leave-request notifications.",
};

export function Settings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testTo, setTestTo] = useState("");

  const { data: settings, isLoading } = useGetEmailSettings({
    query: { queryKey: getGetEmailSettingsQueryKey() },
  });

  const testMut = useSendTestEmail({
    mutation: {
      onSuccess: (res) => {
        if (res.sent) {
          toast({
            title: "Test email sent",
            description: `A test email was delivered to ${testTo}.`,
          });
        } else {
          toast({
            title: "Send failed",
            description: res.error ?? "SMTP rejected the message.",
            variant: "destructive",
          });
        }
        qc.invalidateQueries({ queryKey: getGetEmailSettingsQueryKey() });
      },
      onError: () => {
        toast({
          title: "Could not send",
          description: "The server didn't accept the request.",
          variant: "destructive",
        });
      },
    },
  });

  const sendTest = () => {
    if (!testTo.trim()) return;
    testMut.mutate({ data: { to: testTo.trim() } });
  };

  return (
    <div className="flex-1 p-8 bg-[#F8F7F4] flex flex-col h-full overflow-auto">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <header>
          <div className="flex items-center gap-2 text-[#000033]/50 text-sm uppercase tracking-wider font-semibold">
            <SettingsIcon className="h-4 w-4 text-[#C5A059]" /> Administration
          </div>
          <h1 className="text-3xl font-serif text-[#000033] mt-1">Settings</h1>
          <p className="text-[#000033]/60 mt-1">
            Configure how Amiga HR talks to the rest of your stack.
          </p>
        </header>

        <Card className="border-[#000033]/10">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#C5A059]/10 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-[#C5A059]" />
                </div>
                <div>
                  <h2 className="text-xl font-serif text-[#000033]">Email notifications</h2>
                  <p className="text-sm text-[#000033]/60 mt-1 max-w-xl">
                    SMTP credentials power welcome emails, leave decisions, candidate updates and
                    more. Without them the app still works — emails are quietly skipped.
                  </p>
                </div>
              </div>
              {isLoading ? (
                <Skeleton className="h-7 w-28" />
              ) : settings?.configured ? (
                <Badge
                  className="bg-emerald-100 text-emerald-700 border-emerald-200"
                  data-testid="badge-email-configured"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Configured
                </Badge>
              ) : (
                <Badge
                  className="bg-amber-100 text-amber-800 border-amber-200"
                  data-testid="badge-email-not-configured"
                >
                  <AlertTriangle className="h-3 w-3 mr-1" /> Not configured
                </Badge>
              )}
            </div>

            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : settings?.configured ? (
              <div className="rounded-lg bg-[#000033]/5 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-[#000033]/50" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">
                      Host
                    </p>
                    <p className="text-[#000033]" data-testid="text-smtp-host">
                      {settings.host || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#000033]/50" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">
                      From address
                    </p>
                    <p className="text-[#000033]" data-testid="text-smtp-from">
                      {settings.from || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <KeyRound className="h-4 w-4 text-[#000033]/50" />
                  <div>
                    <p className="text-xs uppercase tracking-wider text-[#000033]/50 font-semibold">
                      App URL (used in email links)
                    </p>
                    <p className="text-[#000033] break-all">{settings.appUrl || "—"}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm text-amber-900 font-medium">
                  To turn on email, add the following secrets to this project:
                </p>
                <ul className="space-y-2 text-sm">
                  {(settings?.missing ?? Object.keys(SECRET_INSTRUCTIONS).filter((k) => k !== "HR_NOTIFICATION_EMAIL")).map((k) => (
                    <li
                      key={k}
                      className="flex items-start gap-2"
                      data-testid={`secret-row-${k}`}
                    >
                      <code className="bg-white border border-amber-200 rounded px-2 py-0.5 text-amber-900 font-mono text-xs">
                        {k}
                      </code>
                      <span className="text-amber-900/80">
                        {SECRET_INSTRUCTIONS[k] ?? "Required for SMTP authentication."}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-900/70">
                  Open the Secrets pane in your Replit workspace, add each value, and restart the
                  API server.
                </p>
              </div>
            )}

            <div className="border-t border-[#000033]/10 pt-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-[#000033] uppercase tracking-wider">
                  Send a test email
                </h3>
                <p className="text-sm text-[#000033]/60 mt-1">
                  Confirms the credentials are correct and your mailbox is receiving from Amiga HR.
                </p>
              </div>
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[260px]">
                  <Label htmlFor="test-email" className="text-sm text-[#000033]">
                    Send to
                  </Label>
                  <Input
                    id="test-email"
                    type="email"
                    placeholder="you@example.com"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    className="mt-1"
                    data-testid="input-test-email"
                  />
                </div>
                <Button
                  onClick={sendTest}
                  disabled={!testTo.trim() || testMut.isPending}
                  className="bg-[#C5A059] hover:bg-[#B08F4F] text-white"
                  data-testid="button-send-test-email"
                >
                  {testMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send test
                </Button>
              </div>
              {!settings?.configured && (
                <p className="text-xs text-[#000033]/50">
                  You can still try this — the request will return a clear error explaining what's
                  missing.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#000033]/10">
          <CardContent className="p-6">
            <h2 className="text-xl font-serif text-[#000033]">Triggered emails</h2>
            <p className="text-sm text-[#000033]/60 mt-1">
              When SMTP is configured, Amiga HR sends emails for these events automatically.
            </p>
            <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-[#000033]/80">
              {[
                "Welcome email when an employee is imported",
                "Leave request — notification to HR",
                "Leave decision — to the requesting employee",
                "Application confirmation — to candidates",
                "Offer letter — when an offer is sent",
                "Interview invitation — to candidates",
                "Candidate stage change — to candidates",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#C5A059] mt-0.5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

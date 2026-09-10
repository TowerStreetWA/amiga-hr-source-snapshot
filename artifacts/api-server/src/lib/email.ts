import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const NAVY = "#000033";
const GOLD = "#C5A059";
const BG = "#F8F7F4";

let cachedTransporter: Transporter | null = null;
let cachedKey = "";

function envSnapshot() {
  return {
    host: process.env.SMTP_HOST?.trim() ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER?.trim() ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM?.trim() ?? process.env.SMTP_USER?.trim() ?? "",
    appUrl: process.env.APP_URL?.trim() ?? "",
  };
}

export function emailConfigStatus(): {
  configured: boolean;
  host: string;
  from: string;
  appUrl: string;
  missing: string[];
} {
  const env = envSnapshot();
  const missing: string[] = [];
  if (!env.host) missing.push("SMTP_HOST");
  if (!env.user) missing.push("SMTP_USER");
  if (!env.pass) missing.push("SMTP_PASS");
  if (!env.from) missing.push("SMTP_FROM");
  return {
    configured: missing.length === 0,
    host: env.host,
    from: env.from,
    appUrl: env.appUrl,
    missing,
  };
}

export function isEmailConfigured(): boolean {
  return emailConfigStatus().configured;
}

function getTransporter(): Transporter | null {
  const env = envSnapshot();
  if (!env.host || !env.user || !env.pass) return null;
  const key = `${env.host}|${env.port}|${env.user}`;
  if (cachedTransporter && key === cachedKey) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.port === 465,
    auth: { user: env.user, pass: env.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  cachedKey = key;
  return cachedTransporter;
}

export async function sendMail(
  args: SendArgs,
): Promise<{ sent: boolean; error?: string }> {
  const env = envSnapshot();
  const transporter = getTransporter();
  if (!transporter || !env.from) {
    logger.warn(
      { to: args.to, subject: args.subject },
      "email skipped — SMTP not configured",
    );
    return { sent: false, error: "SMTP not configured" };
  }
  try {
    await transporter.sendMail({
      from: env.from,
      to: args.to,
      subject: safeSubject(args.subject),
      html: args.html,
      text: args.text ?? args.html.replace(/<[^>]*>/g, ""),
    });
    logger.info({ to: args.to, subject: args.subject }, "email sent");
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: args.to, subject: args.subject }, "email send failed");
    return { sent: false, error: msg };
  }
}

function appUrl(path = ""): string {
  const base =
    envSnapshot().appUrl ||
    (process.env.REPLIT_DOMAINS?.split(",")[0]
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "");
  if (!base) return path || "/";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escAttr(s: unknown): string {
  return esc(s);
}

function safeSubject(s: string): string {
  return s.replace(/[\r\n]+/g, " ").slice(0, 200);
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG};font-family:Inter,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e0d6;border-radius:8px;overflow:hidden;">
        <tr><td style="background:${NAVY};padding:24px 32px;">
          <div style="font-family:Georgia,'Times New Roman',serif;color:#ffffff;font-size:22px;letter-spacing:0.3px;">Amiga Specialty HR</div>
          <div style="height:3px;width:48px;background:${GOLD};margin-top:10px;"></div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:${NAVY};font-weight:600;">${esc(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#f3efe6;padding:16px 32px;font-size:12px;color:#7a7568;">
          Amiga Specialty HR · London Market MGA · Automated message
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function btn(label: string, href: string): string {
  return `<a href="${escAttr(href)}" style="display:inline-block;background:${GOLD};color:${NAVY};text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px;margin-top:8px;">${esc(label)}</a>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#2d2d44;">${text}</p>`;
}

export async function sendWelcomeEmail(args: {
  to: string;
  firstName: string;
  employeeNumber: string;
  temporaryPassword: string;
}) {
  const url = appUrl("/");
  const html = shell(
    `Welcome to Amiga, ${args.firstName}`,
    [
      p(`Your account on Amiga Specialty HR has been created. You can sign in to view your profile, request leave, and see your total reward statement.`),
      p(`<strong>Employee number:</strong> ${esc(args.employeeNumber)}<br/><strong>Email:</strong> ${esc(args.to)}<br/><strong>Temporary password:</strong> ${esc(args.temporaryPassword)}`),
      p(btn("Sign in", url)),
      p(`If you have any questions, contact your HR team.`),
    ].join(""),
  );
  return sendMail({ to: args.to, subject: "Welcome to Amiga Specialty HR", html });
}

export async function sendLeaveRequestNotification(args: {
  to: string;
  hrName?: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
}) {
  const url = appUrl("/leave");
  const html = shell(
    "New leave request",
    [
      p(`${esc(args.employeeName)} has submitted a new <strong>${esc(args.leaveType)}</strong> request.`),
      p(`<strong>${esc(args.startDate)} → ${esc(args.endDate)}</strong> · ${args.days} day${args.days === 1 ? "" : "s"}`),
      args.reason ? p(`<em>"${esc(args.reason)}"</em>`) : "",
      p(btn("Review request", url)),
    ].join(""),
  );
  return sendMail({
    to: args.to,
    subject: `Leave request — ${args.employeeName}`,
    html,
  });
}

export async function sendLeaveDecisionNotification(args: {
  to: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  decision: "approved" | "declined";
  reviewerName?: string;
  comments?: string | null;
}) {
  const url = appUrl("/leave");
  const colour = args.decision === "approved" ? "#0f7a3a" : "#a02323";
  const html = shell(
    args.decision === "approved" ? "Your leave was approved" : "Your leave was declined",
    [
      p(`Hello ${esc(args.employeeName)},`),
      p(`Your <strong>${esc(args.leaveType)}</strong> request for <strong>${esc(args.startDate)} → ${esc(args.endDate)}</strong> has been <strong style="color:${colour};">${esc(args.decision)}</strong>${args.reviewerName ? ` by ${esc(args.reviewerName)}` : ""}.`),
      args.comments ? p(`<em>Comments: ${esc(args.comments)}</em>`) : "",
      p(btn("Open Amiga HR", url)),
    ].join(""),
  );
  return sendMail({
    to: args.to,
    subject: `Leave ${args.decision} — ${args.startDate} to ${args.endDate}`,
    html,
  });
}

export async function sendApplicationConfirmation(args: {
  to: string;
  candidateName: string;
  jobTitle: string;
}) {
  const html = shell(
    "Application received",
    [
      p(`Hello ${esc(args.candidateName)},`),
      p(`Thank you for applying for the <strong>${esc(args.jobTitle)}</strong> role at Amiga Specialty. We've received your application and our team will be in touch shortly.`),
      p(`We appreciate your interest and the time you've taken to apply.`),
    ].join(""),
  );
  return sendMail({
    to: args.to,
    subject: `Application received — ${args.jobTitle}`,
    html,
  });
}

export async function sendOfferLetterNotification(args: {
  to: string;
  candidateName: string;
  jobTitle: string;
  salary: number;
  currency: string;
  startDate: string;
}) {
  const fmt = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: args.currency || "GBP",
    maximumFractionDigits: 0,
  });
  const html = shell(
    "Your offer from Amiga Specialty",
    [
      p(`Dear ${esc(args.candidateName)},`),
      p(`We're delighted to extend an offer for the position of <strong>${esc(args.jobTitle)}</strong>.`),
      p(`<strong>Salary:</strong> ${esc(fmt.format(args.salary))}<br/><strong>Proposed start date:</strong> ${esc(args.startDate)}`),
      p(`Your full offer letter will follow separately. We look forward to hearing from you.`),
    ].join(""),
  );
  return sendMail({
    to: args.to,
    subject: `Offer of employment — ${args.jobTitle}`,
    html,
  });
}

export async function sendInterviewInvitation(args: {
  to: string;
  candidateName: string;
  jobTitle: string;
  scheduledAt: string;
  durationMinutes: number;
  format: string;
  location?: string | null;
}) {
  const html = shell(
    "Interview invitation",
    [
      p(`Hello ${esc(args.candidateName)},`),
      p(`We'd like to invite you to interview for the <strong>${esc(args.jobTitle)}</strong> role.`),
      p(`<strong>When:</strong> ${esc(args.scheduledAt)}<br/><strong>Duration:</strong> ${args.durationMinutes} minutes<br/><strong>Format:</strong> ${esc(args.format)}${args.location ? `<br/><strong>Where:</strong> ${esc(args.location)}` : ""}`),
      p(`Please reply to confirm your attendance.`),
    ].join(""),
  );
  return sendMail({
    to: args.to,
    subject: `Interview invitation — ${args.jobTitle}`,
    html,
  });
}

export async function sendCandidateStageChange(args: {
  to: string;
  candidateName: string;
  jobTitle: string;
  newStage: string;
}) {
  const html = shell(
    "Application update",
    [
      p(`Hello ${esc(args.candidateName)},`),
      p(`Your application for <strong>${esc(args.jobTitle)}</strong> has moved to the <strong>${esc(args.newStage)}</strong> stage.`),
      p(`We'll be in touch with the next steps shortly.`),
    ].join(""),
  );
  return sendMail({
    to: args.to,
    subject: `Application update — ${args.jobTitle}`,
    html,
  });
}

export async function sendTestEmail(to: string) {
  const html = shell(
    "Email test successful",
    [
      p(`This is a test email from your Amiga Specialty HR installation.`),
      p(`If you're reading this, your SMTP settings are working correctly and the system can send notifications.`),
    ].join(""),
  );
  return sendMail({
    to,
    subject: "Amiga Specialty HR — Email test",
    html,
  });
}

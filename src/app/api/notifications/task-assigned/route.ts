import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getGmailCredentials() {
  const user =
    process.env.GMAIL_USER ||
    process.env.EMAIL_USER ||
    process.env.MAIL_USER ||
    process.env.SMTP_USER;

  const pass =
    process.env.GMAIL_APP_PASSWORD ||
    process.env.GMAIL_PASS ||
    process.env.EMAIL_APP_PASSWORD ||
    process.env.EMAIL_PASS ||
    process.env.MAIL_PASS ||
    process.env.SMTP_PASS;

  return { user, pass };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      toEmail,
      toName,
      taskTitle,
      description,
      workingGroupName,
      deadline,
      expectedOutput,
      priority,
      assignedBy,
    } = body || {};

    if (!toEmail || !taskTitle) {
      return NextResponse.json(
        { error: "Missing recipient email or task title." },
        { status: 400 }
      );
    }

    const { user, pass } = getGmailCredentials();
    if (!user || !pass) {
      return NextResponse.json(
        {
          error:
            "Missing Gmail credentials in environment variables (check your Gmail user and app password names in .env.local).",
        },
        { status: 500 }
      );
    }

    const safeName = escapeHtml(toName || "ICEP Member");
    const safeTitle = escapeHtml(taskTitle);
    const safeDesc = escapeHtml(description || "No description provided.");
    const safeWg = escapeHtml(workingGroupName || "General");
    const safeDeadline = escapeHtml(deadline || "No deadline");
    const safeOutput = escapeHtml(expectedOutput || "Not specified");
    const safePriority = escapeHtml(priority || "medium");
    const safeAssignedBy = escapeHtml(assignedBy || "ICEP Hub");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user,
        pass,
      },
    });

    await transporter.sendMail({
      from: `"ICEP Hub" <${user}>`,
      to: toEmail,
      subject: `New Task Assigned: ${taskTitle} — ICEP Hub`,
      text: [
        `Hi ${toName || "ICEP Member"},`,
        "",
        `${assignedBy || "ICEP Hub"} assigned you a new task in ICEP Hub:`,
        `• Task: ${taskTitle}`,
        `• Working Group: ${workingGroupName || "General"}`,
        `• Priority: ${priority || "medium"}`,
        `• Deadline: ${deadline || "No deadline"}`,
        `• Expected Output: ${expectedOutput || "Not specified"}`,
        "",
        "Description:",
        description || "No description provided.",
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #0f172a;">
          <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
            <div style="background: #004aad; padding: 18px 24px; color: #ffffff;">
              <h2 style="margin: 0; font-size: 18px;">New Task Assigned — ICEP Hub</h2>
            </div>
            <div style="padding: 24px; font-size: 14px; line-height: 1.6;">
              <p style="margin-top: 0;">Hi <strong>${safeName}</strong>,</p>
              <p><strong>${safeAssignedBy}</strong> assigned you a new task:</p>
              <table cellpadding="6" cellspacing="0" style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
                <tr><td style="color: #64748b; width: 140px;"><strong>Task:</strong></td><td style="color: #0f172a; font-weight: 600;">${safeTitle}</td></tr>
                <tr><td style="color: #64748b;"><strong>Working Group:</strong></td><td style="color: #0f172a;">${safeWg}</td></tr>
                <tr><td style="color: #64748b;"><strong>Priority:</strong></td><td style="color: #0f172a; text-transform: capitalize;">${safePriority}</td></tr>
                <tr><td style="color: #64748b;"><strong>Deadline:</strong></td><td style="color: #0f172a;">${safeDeadline}</td></tr>
                <tr><td style="color: #64748b;"><strong>Expected Output:</strong></td><td style="color: #0f172a;">${safeOutput}</td></tr>
              </table>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
                <div style="font-size: 12px; font-weight: 700; color: #004aad; margin-bottom: 6px;">Description</div>
                <div style="white-space: pre-line; color: #334155;">${safeDesc}</div>
              </div>
            </div>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error in /api/notifications/task-assigned:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to send task email.",
      },
      { status: 500 }
    );
  }
}
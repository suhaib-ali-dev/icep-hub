import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
  try {
    const { to, subject, message, actionUrl } = await request.json();

    if (!to || !subject || !message) {
      return NextResponse.json(
        { success: false, error: "Missing required email fields" },
        { status: 400 }
      );
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.log(`[ICEP Email Mock] To: ${to} | Subject: ${subject}`);
      return NextResponse.json({ success: true, mocked: true });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #004aad; margin-top: 0;">ICEP — Membership Agreement Update</h2>
        <p style="line-height: 1.6; white-space: pre-line;">${message}</p>
        ${
          actionUrl
            ? `<div style="margin-top: 24px;">
                <a href="${actionUrl}" style="background-color: #004aad; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                  View Agreement in Hub
                </a>
              </div>`
            : ""
        }
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #64748b; margin: 0;">
          International Commission for Equity and Peace (ICEP)
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"ICEP Hub" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text: `${message}${actionUrl ? `\n\nView Agreement: ${actionUrl}` : ""}`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email route error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to dispatch email" },
      { status: 500 }
    );
  }
}
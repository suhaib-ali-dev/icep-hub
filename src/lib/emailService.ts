// src/lib/emailService.ts
export async function sendAgreementEmail({
  to,
  subject,
  message,
  actionUrl,
}: {
  to: string;
  subject: string;
  message: string;
  actionUrl?: string;
}) {
  try {
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, message, actionUrl }),
    });
    return await response.json();
  } catch (error) {
    console.error("Failed to send email notification:", error);
    return { success: false };
  }
}
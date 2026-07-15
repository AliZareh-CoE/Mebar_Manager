import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Email is optional: the reset-password email flow activates only when all
 * SMTP_* env vars are set. Without them, password resets go through a
 * coordinator on the People page.
 */
export const smtpConfigured = Boolean(
  process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM
);

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: "Reset your password",
    text: `Someone (hopefully you) requested a password reset.\n\nReset it here: ${url}\n\nThe link expires in an hour. If you didn't ask for this, ignore this email.`,
  });
}

/** Plain-text mail to a list of watchers (project notifications). */
export async function sendWatcherEmail(
  to: string[],
  subject: string,
  text: string
): Promise<void> {
  if (to.length === 0) return;
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM,
    // BCC so external watchers don't see each other's addresses.
    bcc: to,
    subject,
    text,
  });
}

import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Golf Challenge <noreply@golf-challenge.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  if (!resend) {
    console.log(`[DEV] Password reset for ${to}: ${resetUrl}`);
    return true;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Reset your Golf Challenge password',
      html: `
        <h2>Reset Your Password</h2>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        <p><a href="${resetUrl}" style="background:#2d5a27;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Reset Password</a></p>
        <p style="color:#666;font-size:12px;">If you didn't request this, ignore this email.</p>
      `,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendPickReminderEmail(to: string, username: string, tournament: string, deadline: string): Promise<boolean> {
  if (!resend) {
    console.log(`[DEV] Pick reminder for ${to}: ${tournament} by ${deadline}`);
    return true;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Pick reminder: ${tournament}`,
      html: `
        <h2>It's your turn, ${username}!</h2>
        <p>The <strong>${tournament}</strong> starts soon. Make your pick before <strong>${deadline}</strong>.</p>
        <p><a href="${APP_URL}/dashboard" style="background:#2d5a27;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Make Your Pick</a></p>
      `,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendWeeklyRecapEmail(to: string, username: string, recap: string): Promise<boolean> {
  if (!resend) {
    console.log(`[DEV] Weekly recap for ${to}`);
    return true;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Golf Challenge Weekly Recap',
      html: `
        <h2>Weekly Recap for ${username}</h2>
        ${recap}
        <p><a href="${APP_URL}/dashboard" style="background:#2d5a27;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">View Standings</a></p>
      `,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Transactional email utility for auth flows.
 * Uses org SMTP config or system SMTP for transactional emails.
 */

import { getSmtpConfig } from './org-config';
import * as net from 'net';
import * as tls from 'tls';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  orgId?: number;
}

interface SmtpConnection {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/**
 * Get SMTP config for sending — tries org-level first, then system env vars.
 */
async function getSmtp(orgId?: number): Promise<SmtpConnection> {
  if (orgId) {
    const orgSmtp = await getSmtpConfig(orgId);
    if (orgSmtp.host && orgSmtp.user) return orgSmtp;
  }

  return {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  };
}

/**
 * Send a transactional email via SMTP.
 * Uses raw socket SMTP for zero extra dependencies.
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const smtp = await getSmtp(options.orgId);

  if (!smtp.host || !smtp.user) {
    console.warn('[email] SMTP not configured, skipping email to:', options.to);
    return false;
  }

  const fromEmail = smtp.user;
  const boundary = `boundary-${Date.now()}`;

  const message = [
    `From: SalesHub <${fromEmail}>`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    options.text || options.subject,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    options.html,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  return new Promise((resolve) => {
    try {
      const socket = smtp.port === 465
        ? tls.connect(smtp.port, smtp.host, { rejectUnauthorized: false })
        : net.createConnection(smtp.port, smtp.host);

      let step = 0;
      let buffer = '';
      let upgraded = false;

      const send = (data: string) => {
        const target = upgraded ? (socket as tls.TLSSocket) : socket;
        target.write(data + '\r\n');
      };

      const handleLine = (line: string) => {
        const code = parseInt(line.slice(0, 3));

        switch (step) {
          case 0: // greeting
            if (code === 220) { step = 1; send(`EHLO localhost`); }
            break;
          case 1: // EHLO response
            if (line.startsWith('250 ') || (code === 250 && !line.startsWith('250-'))) {
              if (smtp.port !== 465 && !upgraded) {
                step = 2; send('STARTTLS');
              } else {
                step = 3;
                const credentials = Buffer.from(`\0${smtp.user}\0${smtp.pass}`).toString('base64');
                send(`AUTH PLAIN ${credentials}`);
              }
            }
            break;
          case 2: // STARTTLS
            if (code === 220) {
              const tlsSocket = tls.connect({
                socket: socket as net.Socket,
                host: smtp.host,
                rejectUnauthorized: false,
              }, () => {
                upgraded = true;
                step = 3;
                const credentials = Buffer.from(`\0${smtp.user}\0${smtp.pass}`).toString('base64');
                tlsSocket.write(`AUTH PLAIN ${credentials}\r\n`);
              });
              tlsSocket.on('data', (data) => handleData(data.toString()));
              tlsSocket.on('error', () => resolve(false));
            }
            break;
          case 3: // AUTH
            if (code === 235) { step = 4; send(`MAIL FROM:<${fromEmail}>`); }
            else { resolve(false); socket.destroy(); }
            break;
          case 4: // MAIL FROM
            if (code === 250) { step = 5; send(`RCPT TO:<${options.to}>`); }
            break;
          case 5: // RCPT TO
            if (code === 250) { step = 6; send('DATA'); }
            break;
          case 6: // DATA
            if (code === 354) { step = 7; send(message + '\r\n.'); }
            break;
          case 7: // Message sent
            if (code === 250) { step = 8; send('QUIT'); resolve(true); }
            break;
        }
      };

      const handleData = (data: string) => {
        buffer += data;
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) handleLine(line);
        }
      };

      socket.on('data', (data) => handleData(data.toString()));
      socket.on('error', (err) => {
        console.error('[email] SMTP error:', err.message);
        resolve(false);
      });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      (socket as net.Socket).setTimeout?.(15000);
    } catch (err) {
      console.error('[email] Send failed:', err);
      resolve(false);
    }
  });
}

/**
 * Send email verification email.
 */
export async function sendVerificationEmail(
  to: string,
  token: string,
  baseUrl: string,
  orgId?: number
): Promise<boolean> {
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
  return sendEmail({
    to,
    subject: 'Verify your email - SalesHub',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Verify your email address</h2>
        <p style="color: #475569;">Click the button below to verify your email address and activate your SalesHub account.</p>
        <a href="${verifyUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Verify Email</a>
        <p style="color: #94a3b8; font-size: 14px;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
      </div>
    `,
    text: `Verify your email: ${verifyUrl}`,
    orgId,
  });
}

/**
 * Send password reset email.
 */
export async function sendPasswordResetEmail(
  to: string,
  token: string,
  baseUrl: string,
  orgId?: number
): Promise<boolean> {
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;
  return sendEmail({
    to,
    subject: 'Reset your password - SalesHub',
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Reset your password</h2>
        <p style="color: #475569;">Click the button below to set a new password for your SalesHub account.</p>
        <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Reset Password</a>
        <p style="color: #94a3b8; font-size: 14px;">This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
      </div>
    `,
    text: `Reset your password: ${resetUrl}`,
    orgId,
  });
}

/**
 * Send team invitation email.
 */
export async function sendInvitationEmail(
  to: string,
  token: string,
  orgName: string,
  inviterName: string,
  baseUrl: string,
  orgId?: number
): Promise<boolean> {
  const inviteUrl = `${baseUrl}/signup?invite=${token}`;
  return sendEmail({
    to,
    subject: `You're invited to join ${orgName} on SalesHub`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e293b;">You're invited!</h2>
        <p style="color: #475569;">${inviterName} has invited you to join <strong>${orgName}</strong> on SalesHub.</p>
        <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0;">Accept Invitation</a>
        <p style="color: #94a3b8; font-size: 14px;">This invitation expires in 7 days.</p>
      </div>
    `,
    text: `You're invited to join ${orgName} on SalesHub: ${inviteUrl}`,
    orgId,
  });
}

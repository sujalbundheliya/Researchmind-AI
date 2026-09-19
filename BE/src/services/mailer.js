/**
 * Outbound email.
 *
 * Delivery is deliberately best-effort: the caller's DB write is the source of
 * truth, and `send()` resolves to `false` rather than throwing when SMTP is
 * unconfigured or the provider rejects the message. A contact-form submission
 * must never fail because mail is down.
 *
 * Configure via BE/.env — with SMTP_HOST unset the transport stays null and
 * every send is a logged no-op, so the feature works with zero credentials:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=researchmind.ai.team@gmail.com
 *   SMTP_PASS=<16-char Gmail App Password — NOT the account password>
 */
const nodemailer = require('nodemailer');

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'researchmind.ai.team@gmail.com';

let transporter = null;
let transportReady = false;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 is implicit TLS; 587 upgrades via STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  transportReady = true;
  console.log(`[mailer] SMTP configured (${process.env.SMTP_HOST}:${port}) — contact mail → ${CONTACT_EMAIL}`);
} else {
  console.log('[mailer] SMTP not configured — contact messages will be stored in the DB only.');
}

/** Whether a real transport is wired up (surfaced on the admin System tab). */
function isConfigured() {
  return transportReady;
}

/** HTML-escape untrusted values before interpolating them into an email body. */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send a message. Returns true only on confirmed delivery; never throws.
 */
async function send({ to, subject, text, html, replyTo }) {
  if (!transportReady) return false;
  try {
    await transporter.sendMail({
      from: `"ResearchMind AI" <${process.env.SMTP_USER}>`,
      to: to || CONTACT_EMAIL,
      subject,
      text,
      html,
      replyTo,
    });
    return true;
  } catch (err) {
    console.error('[mailer] send failed:', err.message);
    return false;
  }
}

/**
 * Deliver a contact-form submission to the support inbox. `replyTo` is set to
 * the sender so replying from the inbox reaches them directly.
 */
async function sendContactMessage({ name, email, subject, message }) {
  const safe = {
    name: escapeHtml(name),
    email: escapeHtml(email),
    subject: escapeHtml(subject),
    message: escapeHtml(message).replace(/\n/g, '<br>'),
  };

  return send({
    to: CONTACT_EMAIL,
    replyTo: email,
    subject: `[ResearchMind Contact] ${subject}`,
    text: `New contact message\n\nFrom: ${name} <${email}>\nSubject: ${subject}\n\n${message}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px">
        <h2 style="margin:0 0 16px;color:#1a1a1a">New contact message</h2>
        <table style="border-collapse:collapse;margin-bottom:16px">
          <tr><td style="padding:4px 12px 4px 0;color:#666">From</td><td><strong>${safe.name}</strong> &lt;${safe.email}&gt;</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">Subject</td><td>${safe.subject}</td></tr>
        </table>
        <div style="padding:16px;background:#f6f6f4;border-radius:8px;line-height:1.6">${safe.message}</div>
      </div>`,
  });
}

const ROLE_BLURB = {
  editor: 'Editor — can upload documents and chat',
  viewer: 'Viewer — can chat with documents',
};

/**
 * Email a workspace invitation. Best-effort like every send() — the invite row
 * and shareable link are already persisted by the caller, so a mail failure
 * never blocks the invite. Returns true only on confirmed delivery.
 */
async function sendWorkspaceInvite({ to, inviterName, workspaceName, role, inviteLink }) {
  const safe = {
    inviter: escapeHtml(inviterName || 'A colleague'),
    workspace: escapeHtml(workspaceName || 'a workspace'),
    role: escapeHtml(ROLE_BLURB[role] || role),
    link: escapeHtml(inviteLink),
  };

  return send({
    to,
    subject: `${inviterName || 'A colleague'} invited you to “${workspaceName || 'a workspace'}” on ResearchMind`,
    text:
      `${inviterName || 'A colleague'} invited you to collaborate on the workspace ` +
      `"${workspaceName || 'a workspace'}" on ResearchMind AI as ${ROLE_BLURB[role] || role}.\n\n` +
      `Accept the invite: ${inviteLink}\n\n` +
      `This link expires in 7 days and can only be used once. ` +
      `You'll need to sign in (or create a free account) with this email address to join.`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#2B2622">
        <h2 style="margin:0 0 8px;color:#1a1a1a">You're invited to collaborate</h2>
        <p style="margin:0 0 16px;line-height:1.6;color:#555">
          <strong>${safe.inviter}</strong> invited you to join the workspace
          <strong>“${safe.workspace}”</strong> on ResearchMind AI.
        </p>
        <table style="border-collapse:collapse;margin-bottom:20px">
          <tr><td style="padding:4px 12px 4px 0;color:#888">Your role</td><td>${safe.role}</td></tr>
        </table>
        <a href="${safe.link}"
           style="display:inline-block;padding:11px 22px;background:#CD5D3F;color:#fff;
                  text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
          Accept invitation
        </a>
        <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#888">
          Or paste this link into your browser:<br>
          <span style="word-break:break-all;color:#B85A3E">${safe.link}</span>
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#aaa;line-height:1.6">
          This link expires in 7 days and can only be used once. Sign in (or create a free
          account) with this email address to join. If you weren't expecting this, you can ignore it.
        </p>
      </div>`,
  });
}

module.exports = { send, sendContactMessage, sendWorkspaceInvite, isConfigured, CONTACT_EMAIL };

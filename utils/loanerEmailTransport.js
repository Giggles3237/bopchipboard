const nodemailer = require('nodemailer');
const { buildEmailConfig } = require('./getReadyEmail');
function loanerEmailReadiness(env = process.env) {
  if (env.LOANER_EMAIL_ENABLED !== 'true') return { ready: false, code: 'EMAIL_DISABLED', message: 'Email sending is disabled. Set LOANER_EMAIL_ENABLED to true in the backend configuration.' };
  if (env.EMAIL_USER !== 'chipboard.bot@gmail.com') return { ready: false, code: 'SENDER_MISMATCH', message: 'The configured sender does not match chipboard.bot@gmail.com. Verify EMAIL_USER in the backend configuration.' };
  if (!env.EMAIL_PASSWORD) return { ready: false, code: 'PASSWORD_MISSING', message: 'The backend EMAIL_PASSWORD setting is missing. Restore the existing SMTP credential privately; do not paste it here.' };
  return { ready: true, code: 'CONFIGURED', message: 'Email settings are present. SMTP authentication and mailbox delivery are not yet verified.' };
}
function loanerEmailReady() { return loanerEmailReadiness().ready; }
function createLoanerEmailSender(createTransport = nodemailer.createTransport, ready = loanerEmailReady) {
  return async function sendLoanerEmail(payload) {
    if (!ready()) return { ok: false, message: 'Loaner SMTP sending is not enabled.' };
    const transport = createTransport({ ...buildEmailConfig(), connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    try {
      const info = await transport.sendMail({
        from: { name: 'Chipboard', address: 'chipboard.bot@gmail.com' },
        to: payload.emailTo, cc: [], bcc: [], subject: payload.emailSubject,
        text: payload.emailBody, html: payload.emailHtml,
        messageId: `<loaner-${payload.requestId}@chipboard.gmail.com>`
      });
      // Partial acceptance must not invite a retry to recipients already accepted.
      return { ok: !info.rejected?.length && info.accepted?.length === payload.emailTo.length };
    } finally { transport.close?.(); }
  };
}
module.exports = { loanerEmailReadiness, loanerEmailReady, createLoanerEmailSender, sendLoanerEmail: createLoanerEmailSender() };

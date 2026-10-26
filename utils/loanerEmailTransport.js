const nodemailer = require('nodemailer');
const { buildEmailConfig, buildEmailFrom } = require('./getReadyEmail');
const addressParser = require('nodemailer/lib/addressparser');
function validSender(from) {
  if (typeof from !== 'string' || /[\r\n\0]/.test(from)) return false;
  const addresses = addressParser(from);
  return addresses.length === 1 && !addresses[0].group &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(addresses[0].address || '');
}
function loanerEmailReadiness(env = process.env) {
  if (env.LOANER_EMAIL_ENABLED !== 'true') return { ready: false, code: 'EMAIL_DISABLED', message: 'Email sending is disabled. Set LOANER_EMAIL_ENABLED to true in the backend configuration.' };
  if (!env.EMAIL_USER?.trim()) return { ready: false, code: 'USER_MISSING', message: 'The backend EMAIL_USER setting is missing. Verify the existing SMTP configuration privately.' };
  if (!env.EMAIL_PASSWORD) return { ready: false, code: 'PASSWORD_MISSING', message: 'The backend EMAIL_PASSWORD setting is missing. Restore the existing SMTP credential privately; do not paste it here.' };
  if (!validSender(buildEmailFrom(env))) return { ready: false, code: 'SENDER_INVALID', message: 'The configured email sender must be one valid mailbox. Verify EMAIL_FROM, or EMAIL_USER when no override is set, in the backend configuration.' };
  return { ready: true, code: 'CONFIGURED', message: 'Email settings are present. SMTP authentication and mailbox delivery are not yet verified.' };
}
function loanerEmailReady() { return loanerEmailReadiness().ready; }
function createLoanerEmailSender(createTransport = nodemailer.createTransport, ready = loanerEmailReady, getEnv = () => process.env) {
  return async function sendLoanerEmail(payload) {
    const env = { ...getEnv() };
    if (!ready() || !loanerEmailReadiness(env).ready) return { ok: false, retryable: true, message: 'Loaner SMTP sending is not ready.' };
    const transport = createTransport({ ...buildEmailConfig(env), connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
    try {
      const info = await transport.sendMail({
        from: buildEmailFrom(env),
        to: payload.emailTo, cc: payload.emailCc || [], bcc: [], subject: payload.emailSubject,
        text: payload.emailBody, html: payload.emailHtml,
        messageId: `<loaner-${payload.requestId}@chipboard.gmail.com>`
      });
      // Partial acceptance must not invite a retry to recipients already accepted.
      return { ok: !info.rejected?.length && info.accepted?.length === payload.emailTo.length + (payload.emailCc || []).length,
        retryable: Array.isArray(info.accepted) && info.accepted.length === 0 && Boolean(info.rejected?.length) };
    } catch (error) {
      // Only failures proven to precede DATA can safely be retried. Timeouts,
      // partial acceptance and lost responses remain uncertain.
      const retryable = (error.code === 'EAUTH' && /^AUTH/.test(error.command || '')) ||
        (error.code === 'ECONNECTION' && error.command === 'CONN') ||
        (error.code === 'EENVELOPE' && error.command === 'RCPT TO' && error.rejected?.length > 0 && !error.accepted?.length);
      return { ok: false, retryable };
    } finally { transport.close?.(); }
  };
}
module.exports = { loanerEmailReadiness, loanerEmailReady, createLoanerEmailSender, sendLoanerEmail: createLoanerEmailSender() };

const nodemailer = require('nodemailer');
const { buildEmailConfig } = require('./getReadyEmail');
function loanerEmailReady() {
  return process.env.LOANER_EMAIL_ENABLED === 'true' &&
    process.env.EMAIL_USER === 'chipboard.bot@gmail.com' && Boolean(process.env.EMAIL_PASSWORD);
}
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
module.exports = { loanerEmailReady, createLoanerEmailSender, sendLoanerEmail: createLoanerEmailSender() };

const LOANER_DISTRIBUTION = 'loanerdistribution@pandwforeigncars.com';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function buildLoanerRecipients(requesterEmail) {
  const email = typeof requesterEmail === 'string' ? requesterEmail.trim() : '';
  // One verified mailbox, not a display-name/address list or header fragment.
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(email) || /[\r\n]/.test(requesterEmail)) {
    throw Object.assign(new Error('A valid stored requester email is required.'), { status: 400 });
  }
  return email.toLowerCase() === LOANER_DISTRIBUTION ? [LOANER_DISTRIBUTION] : [LOANER_DISTRIBUTION, email];
}

function buildLoanerRecipientPolicy(requesterEmail, advisorEmail) {
  const to = buildLoanerRecipients(requesterEmail);
  // Reuse single-mailbox validation, but never silently omit a missing advisor.
  let advisor;
  try { buildLoanerRecipients(advisorEmail); advisor = advisorEmail.trim(); }
  catch (_) { throw Object.assign(new Error('A valid client advisor email is required before sending.'), { status: 400 }); }
  const cc = to.some(email => email.toLowerCase() === advisor.toLowerCase()) ? [] : [advisor];
  return { to, cc, bcc: [] };
}

function displayDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

function buildDeclineRecipients(requesterEmail) {
  buildLoanerRecipients(requesterEmail); // Shared single-mailbox/header validation only.
  return { to: [requesterEmail.trim()], cc: [], bcc: [] };
}

function decisionHtml(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#18283d"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:620px;background:white;border:1px solid #d7e1ec"><tr><td style="padding:24px;background:#12263d;color:white;border-top:5px solid #3f90cd"><p>CHIPBOARD</p><h1 style="font-size:26px">${escapeHtml(title)}</h1></td></tr><tr><td style="padding:24px;font-size:15px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(body).replace(/\n/g, '<br>')}</td></tr></table></td></tr></table></body></html>`;
}

function buildLoanerDeclineEmail(id, request, decision) {
  let recipients;
  try { recipients = buildDeclineRecipients(request.respondersEmail); }
  catch (_) { recipients = { to: [], cc: [], bcc: [] }; } // Save decline; surface recipient blocker.
  const subject = `Loaner request declined | ${request.stockNumber}`.replace(/[\r\n]+/g, ' ');
  const body = ['Your loaner request was declined.', '', `Stock number: ${request.stockNumber}`,
    `Reason: ${decision.reason || 'No reason provided.'}`, `Declined at: ${displayDate(decision.declinedAt)}`,
    `Request ID: ${id}`].join('\n');
  return { ...recipients, subject, body, html: decisionHtml('Loaner request declined', body) };
}

function buildHoldApprovalEmail(id, request, approval) {
  const recipients = buildLoanerRecipientPolicy(request.respondersEmail, request.clientAdvisorEmail);
  const subject = `Loaner hold approved | ${request.stockNumber}`.replace(/[\r\n]+/g, ' ');
  const body = ['Loaner hold request approved', '', `Client: ${request.clientName}`,
    `Request stock number: ${request.stockNumber}`, 'Request type: Hold (not sold)',
    `Pulled vehicle stock number: ${approval.pulledStockNumber}`,
    'Replacement vehicle: Not applicable — Hold request', 'CPO: Not applicable — Hold request; no answer or fee required',
    `Requester: ${request.respondersEmail}`, `Client advisor: ${request.clientAdvisorEmail}`,
    `Approved by: ${approval.approverName || approval.approvedBy}`, `Approved at: ${displayDate(approval.approvedAt)}`,
    '', 'Additional notes:', request.additionalInformation || 'None provided', '', `Request ID: ${id}`].join('\n');
  return { ...recipients, subject, body, html: decisionHtml('Loaner hold approved', body), isHtml: true };
}

function buildLoanerApprovalEmail(requestId, request, approval) {
  if (approval.requestType === 'hold') return buildHoldApprovalEmail(requestId, request, approval);
  const recipients = buildLoanerRecipientPolicy(request.respondersEmail, request.clientAdvisorEmail);
  const cpo = approval.cpo;
  const amount = `$${Number(cpo.cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  const term = cpo.enabled ? '60 months / unlimited miles' : 'Not applicable';
  const approvedBy = [approval.approverName, approval.approverEmail].filter(Boolean).join(' · ') || `User ${approval.approvedBy}`;
  const approvedAt = displayDate(approval.approvedAt);
  const submittedAt = displayDate(request.submittedAt);
  const subject = `Loaner approved | ${request.stockNumber} | ${request.clientName}`.replace(/[\r\n]+/g, ' ');
  const body = [
    'CHIPBOARD', 'Loaner request approved', '',
    `Client: ${request.clientName}`,
    `Request / sale stock number: ${request.stockNumber}`,
    `Sold unit: ${request.soldUnit}`, '',
    `Pulled vehicle stock number: ${approval.pulledStockNumber}`,
    `Replacement vehicle stock number: ${approval.replacementStockNumber}`, '',
    `Pulled vehicle CPO: ${cpo.enabled ? 'Yes' : 'No'}`,
    `CPO model/category: ${cpo.model || 'Not applicable'}`,
    `CPO term: ${term}`,
    `CPO cost: ${amount}${cpo.enabled ? ' (base fee only)' : ' (not applicable)'}`, '',
    `Requester: ${request.respondersEmail}`,
    `Submitted at: ${submittedAt}`,
    `Client advisor: ${request.clientAdvisorEmail}`,
    `Approved by: ${approvedBy} (user ${approval.approvedBy})`,
    `Approved at: ${approvedAt}`, '',
    'Additional notes:', request.additionalInformation || 'None provided', '',
    `Request ID: ${requestId}`,
    `Fee chart: ${cpo.version}`
  ].join('\n');
  const h = escapeHtml;
  const field = (label, value) => `<p style="margin:0 0 5px;font-size:12px;line-height:18px;font-weight:700;color:#526175;">${h(label)}</p><p style="margin:0 0 18px;font-size:15px;line-height:23px;color:#18283d;overflow-wrap:anywhere;word-break:break-word;">${h(value)}</p>`;
  const vehicle = (label, stock, color) => `<tr><td style="padding:18px 22px;border:1px solid #d7e1ec;background-color:${color};">${field(label, stock)}</td></tr>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Loaner request approved</title></head>
<body style="margin:0;padding:0;background-color:#eef2f6;color:#18283d;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#eef2f6;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;background-color:#ffffff;border:1px solid #d7e1ec;">
<tr><td style="padding:25px 26px;background-color:#12263d;border-top:5px solid #3f90cd;">
<p style="margin:0 0 14px;color:#ffffff;font-size:13px;font-weight:700;line-height:18px;letter-spacing:3px;">CHIPBOARD</p>
<h1 style="margin:0;color:#ffffff;font-size:28px;line-height:36px;font-weight:700;">Loaner request approved</h1>
<p style="margin:10px 0 0;color:#d6e5f3;font-size:15px;line-height:23px;">Approved in Chipboard. Vehicle and CPO details below.</p></td></tr>
<tr><td style="padding:24px 26px 8px;">
<p style="margin:0 0 18px;color:#176349;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1px;">STATUS: APPROVED</p>
<h2 style="margin:0 0 6px;font-size:22px;line-height:29px;color:#18283d;">${h(request.clientName)}</h2>
<p style="margin:0 0 22px;font-size:14px;line-height:22px;color:#526175;overflow-wrap:anywhere;">Request / sale stock: <strong style="color:#18283d;">${h(request.stockNumber)}</strong><br>Sold unit: ${h(request.soldUnit)}</p>
<h2 style="margin:0 0 12px;font-size:18px;line-height:25px;color:#18283d;">Vehicle movement</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;">
${vehicle('PULLED VEHICLE · STOCK NUMBER', approval.pulledStockNumber, '#edf4fb')}
<tr><td height="8" style="height:8px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
${vehicle('REPLACEMENT VEHICLE · STOCK NUMBER', approval.replacementStockNumber, '#f8fafc')}
</table></td></tr>
<tr><td style="padding:18px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#edf7f2;border-left:4px solid #237355;"><tr><td style="padding:18px 20px;">
<h2 style="margin:0 0 10px;font-size:18px;line-height:25px;color:#174f3c;">CPO for the pulled vehicle: ${cpo.enabled ? 'Yes' : 'No'}</h2>
<p style="margin:0;font-size:28px;line-height:36px;font-weight:700;color:#174f3c;">${h(amount)}</p>
<p style="margin:8px 0 0;font-size:14px;line-height:22px;color:#174f3c;">${cpo.enabled ? `${h(cpo.model)}<br>${h(term)}<br>Base enrollment fee only` : 'Not applicable — the pulled vehicle will not be CPO.'}</p>
</td></tr></table></td></tr>
<tr><td style="padding:6px 26px 0;">
<h2 style="margin:0 0 16px;font-size:18px;line-height:25px;color:#18283d;">Request &amp; approval</h2>
${field('REQUESTED BY', request.respondersEmail)}${field('SUBMITTED AT', submittedAt)}${field('CLIENT ADVISOR', request.clientAdvisorEmail)}${field('APPROVED BY', `${approvedBy} (user ${approval.approvedBy})`)}${field('APPROVED AT', approvedAt)}
<h2 style="margin:4px 0 10px;font-size:18px;line-height:25px;color:#18283d;">Additional notes</h2>
<p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#18283d;overflow-wrap:anywhere;word-break:break-word;">${h(request.additionalInformation || 'None provided').replace(/\r?\n/g, '<br>')}</p>
</td></tr>
<tr><td style="padding:18px 26px;background-color:#f8fafc;border-top:1px solid #d7e1ec;">
<p style="margin:0;font-size:12px;line-height:19px;color:#526175;overflow-wrap:anywhere;word-break:break-word;">Request ID: ${h(requestId)}<br>Fee chart: ${h(cpo.version)}</p>
<p style="margin:10px 0 0;font-size:12px;line-height:19px;color:#526175;">Chipboard · Dealership operations</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return { subject, body, html, isHtml: true, ...recipients };
}
module.exports = { escapeHtml, buildLoanerRecipients, buildLoanerRecipientPolicy, buildLoanerApprovalEmail, buildDeclineRecipients, buildLoanerDeclineEmail };

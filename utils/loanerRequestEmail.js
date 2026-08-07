function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanValue(value, fallback = '') {
  const cleaned = String(value ?? '').trim();
  return cleaned || fallback;
}

function isSoldRequest(data) {
  return /^yes$/i.test(cleanValue(data.soldUnit));
}

function appendAccountingSuffix(stockNumber) {
  const cleaned = cleanValue(stockNumber, 'Unknown stock');
  return /r$/i.test(cleaned) ? cleaned : `${cleaned}R`;
}

function buildLoanerRequestEmail(data) {
  const stockNumber = cleanValue(data.stockNumber, 'Unknown stock');
  const clientName = cleanValue(data.clientName, 'Unknown client');
  const soldUnit = cleanValue(data.soldUnit, 'N/A');
  const additionalInformation = cleanValue(data.additionalInformation, 'None provided');
  const clientAdvisorEmail = cleanValue(data.clientAdvisorEmail, 'N/A');
  const respondersEmail = cleanValue(data.respondersEmail, 'N/A');
  const submittedAt = new Date().toLocaleString('en-US', {
    timeZone: process.env.TZ || 'America/New_York'
  });
  const markedSold = isSoldRequest(data);
  const accountingStockNumber = markedSold ? appendAccountingSuffix(stockNumber) : stockNumber;
  const accountingNote = markedSold
    ? `Accounting note: This loaner request is for a sold unit. Please add an R to the stock number in accounting (${accountingStockNumber}).`
    : '';

  const subject = `Loaner Request - ${stockNumber} - ${clientName}`;

  const bodyLines = [
    'A loaner request has been submitted.',
    '',
    `Stock Number: ${stockNumber}`,
    `Client Name: ${clientName}`,
    `Sold Unit: ${soldUnit}`,
    `Client Advisor Email: ${clientAdvisorEmail}`,
    `Responder Email: ${respondersEmail}`,
    `Additional Notes: ${additionalInformation}`,
    `Submitted At: ${submittedAt}`
  ];

  if (accountingNote) {
    bodyLines.push('', accountingNote);
  }

  const rows = [
    ['Stock Number', stockNumber],
    ['Client Name', clientName],
    ['Sold Unit', soldUnit],
    ['Client Advisor Email', clientAdvisorEmail],
    ['Responder Email', respondersEmail],
    ['Additional Notes', additionalInformation],
    ['Submitted At', submittedAt]
  ].map(([label, value]) => `
                <tr>
                  <td style="padding: 10px 12px; width: 190px; font-weight: 700; color: #111827; border-bottom: 1px solid #e5e7eb;">${escapeHtml(label)}</td>
                  <td style="padding: 10px 12px; color: #111827; border-bottom: 1px solid #e5e7eb;">${escapeHtml(value)}</td>
                </tr>`).join('');

  const noteHtml = accountingNote
    ? `
              <div style="margin: 18px 0 0; padding: 14px 16px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; color: #7c2d12; font-weight: 700;">
                ${escapeHtml(accountingNote)}
              </div>`
    : '';

  const html = `
<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #f3f4f6; font-family: Arial, Helvetica, sans-serif; color: #111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f3f4f6; padding: 24px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 680px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
            <tr>
              <td style="background: #111827; color: #ffffff; padding: 20px 24px;">
                <div style="font-size: 22px; font-weight: 800;">Loaner Request</div>
                <div style="margin-top: 6px; font-size: 14px;">${escapeHtml(stockNumber)} - ${escapeHtml(clientName)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px;">
                <p style="margin: 0 0 16px; font-size: 15px;">A loaner request has been submitted.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border-top: 1px solid #e5e7eb;">
                  ${rows}
                </table>
                ${noteHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject,
    body: bodyLines.join('\n'),
    html,
    isHtml: true,
    markedSold,
    accountingNote,
    accountingStockNumber
  };
}

module.exports = {
  buildLoanerRequestEmail,
  isSoldRequest
};

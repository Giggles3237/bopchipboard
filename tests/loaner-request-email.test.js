const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLoanerApprovalEmail, buildLoanerRecipients, buildLoanerRecipientPolicy } = require('../utils/loanerRequestEmail');
const request = { stockNumber: 'SALE123', clientName: 'Jane Buyer', soldUnit: 'Yes', additionalInformation: 'Please prepare the replacement.\nThank you.', clientAdvisorEmail: 'advisor@example.com', respondersEmail: 'requester@example.com', submittedAt: '2026-10-21T13:00:00Z' };
const approval = { pulledStockNumber: 'PULL123', replacementStockNumber: 'NEW456', approvedBy: '7', approverName: 'Pat Admin', approverEmail: 'admin@example.com', approvedAt: '2026-10-21T14:15:00Z', cpo: { enabled: true, cost: 1200, model: 'X3', termMonths: 60, version: 'bmw-2024-10-01-60mo-base-only' } };

test('approved email has both complete plain text and table-based branded HTML', () => {
  const email = buildLoanerApprovalEmail('request-1', request, approval);
  assert.equal(email.subject, 'Loaner approved | SALE123 | Jane Buyer');
  assert.equal(email.isHtml, true);
  for (const part of [email.body, email.html]) {
    for (const text of ['SALE123', 'PULL123', 'NEW456', 'Jane Buyer', 'requester@example.com', 'advisor@example.com', 'Pat Admin', 'admin@example.com', '$1,200.00 USD', '60 months / unlimited miles', 'request-1', 'Oct 21, 2026', '10:15 AM EDT']) assert.ok(part.includes(text), text);
  }
  assert.match(email.html, /<html lang="en">/);
  assert.match(email.html, /<h1[^>]*>Loaner request approved<\/h1>/);
  assert.match(email.html, /max-width:620px/);
  assert.match(email.html, /\[if mso\]/);
  assert.match(email.html, /role="presentation"/);
  assert.match(email.html, /replacement\.<br>Thank you\./);
  assert.doesNotMatch(email.html, /<script|<iframe|<img|<a\s|href=|src=|url\(/i);
});
test('recipient policy includes distribution and requester in To and distinct advisor in CC', () => {
  assert.deepEqual(buildLoanerRecipients('requester@example.com'), ['loanerdistribution@pandwforeigncars.com', 'requester@example.com']);
  assert.deepEqual(buildLoanerRecipients(' LoanerDistribution@PANDWFOREIGNCARS.COM '), ['loanerdistribution@pandwforeigncars.com']);
  const email = buildLoanerApprovalEmail('request-1', request, approval);
  assert.deepEqual(email.to, ['loanerdistribution@pandwforeigncars.com', 'requester@example.com']);
  assert.deepEqual(email.cc, [request.clientAdvisorEmail]); assert.deepEqual(email.bcc, []);
  assert.ok(!email.to.includes(request.clientAdvisorEmail)); assert.ok(!email.to.includes(approval.approverEmail));
});
test('recipient rejects missing, malformed, header-injected and multi-address values', () => {
  for (const value of [undefined, '', 'Name <a@example.com>', 'a@example.com,b@example.com', 'a@example.com;b@example.com', 'a@example.com\r\nBcc: x@example.com', 'a@example.com\n', 'missing-at']) {
    assert.throws(() => buildLoanerRecipients(value), { status: 400 });
  }
});
test('all dynamic HTML fields are escaped and never become links or raw markup', () => {
  const attack = '<img src=x onerror="alert(1)"> & \'test\'';
  const email = buildLoanerApprovalEmail(attack, { ...request, stockNumber: attack, clientName: attack, additionalInformation: attack }, { ...approval, pulledStockNumber: attack, replacementStockNumber: attack, approverName: attack, approverEmail: attack, approvedBy: attack, cpo: { ...approval.cpo, model: attack, version: attack } });
  assert.doesNotMatch(email.html, /<img|onerror="alert/);
  assert.match(email.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;test&#39;/);
  assert.ok(email.body.includes(attack)); // Plain text stays text.
  const subject = buildLoanerApprovalEmail('id', { ...request, clientName: 'Buyer\r\nBcc: injected' }, approval).subject;
  assert.doesNotMatch(subject, /[\r\n]/);
});
test('stocks remain exactly as supplied, with no suffix, accounting command or automation flag', () => {
  for (const stock of ['PB1234', 'PB1234R', 'MiXeD-42']) {
    const original = { ...request, stockNumber: stock };
    const email = buildLoanerApprovalEmail('id', original, { ...approval, pulledStockNumber: stock, replacementStockNumber: 'NEW-1' });
    assert.match(email.body, new RegExp(`Request / sale stock number: ${stock}\\n`));
    assert.match(email.body, new RegExp(`Pulled vehicle stock number: ${stock}\\n`));
    assert.equal(original.stockNumber, stock);
    assert.doesNotMatch(email.body + email.html, /accounting|append|suffix|add an R/i);
    assert.equal(email.accountingStockNumber, undefined);
  }
});
test('no CPO explicitly displays No and zero/not applicable in both formats', () => {
  const email = buildLoanerApprovalEmail('id', request, { ...approval, cpo: { ...approval.cpo, enabled: false, cost: 0, model: null, termMonths: null } });
  assert.match(email.body, /Pulled vehicle CPO: No/);
  assert.match(email.body, /CPO cost: \$0.00 USD \(not applicable\)/);
  assert.match(email.html, /CPO for the pulled vehicle: No/);
  assert.match(email.html, /\$0.00 USD/);
  assert.match(email.html, /Not applicable/);
});

test('advisor deduplicates across To and CC case-insensitively', () => {
  for (const advisor of ['REQUESTER@EXAMPLE.COM', ' LoanerDistribution@PANDWFOREIGNCARS.COM ']) {
    assert.deepEqual(buildLoanerRecipientPolicy('requester@example.com', advisor), { to: ['loanerdistribution@pandwforeigncars.com', 'requester@example.com'], cc: [], bcc: [] });
  }
  assert.deepEqual(buildLoanerRecipientPolicy('loanerdistribution@pandwforeigncars.com', 'advisor@example.com'), { to: ['loanerdistribution@pandwforeigncars.com'], cc: ['advisor@example.com'], bcc: [] });
});
test('advisor must be one valid mailbox, never silently omitted', () => {
  for (const advisor of [undefined, '', 'invalid', 'Name <a@example.com>', 'a@example.com,b@example.com', 'a@example.com\r\nBcc: b@example.com']) {
    assert.throws(() => buildLoanerRecipientPolicy('requester@example.com', advisor), { status: 400, message: 'A valid client advisor email is required before sending.' });
  }
});

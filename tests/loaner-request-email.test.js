const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLoanerRequestEmail, isSoldRequest } = require('../utils/loanerRequestEmail');

test('buildLoanerRequestEmail returns HTML and plain text bodies', () => {
  const email = buildLoanerRequestEmail({
    stockNumber: 'PB1234',
    clientName: 'Jane Buyer',
    soldUnit: 'Yes',
    additionalInformation: 'Needs a loaner tomorrow',
    clientAdvisorEmail: 'advisor@example.com',
    respondersEmail: 'responder@example.com'
  });

  assert.equal(email.subject, 'Loaner Request - PB1234 - Jane Buyer');
  assert.equal(email.isHtml, true);
  assert.match(email.body, /Stock Number: PB1234/);
  assert.match(email.html, /<html>/);
  assert.match(email.html, /Loaner Request/);
  assert.equal(email.markedSold, true);
  assert.match(email.accountingNote, /sold unit/);
});

test('buildLoanerRequestEmail escapes HTML values', () => {
  const email = buildLoanerRequestEmail({
    stockNumber: 'PB<1234>',
    clientName: 'Jane & Buyer',
    soldUnit: 'Yes',
    additionalInformation: '<script>alert("x")</script>',
    clientAdvisorEmail: 'advisor@example.com',
    respondersEmail: 'responder@example.com'
  });

  assert.match(email.html, /PB&lt;1234&gt;/);
  assert.match(email.html, /Jane &amp; Buyer/);
  assert.match(email.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(email.html, /<script>alert/);
});

test('sold unit requests include accounting note and R stock number', () => {
  const email = buildLoanerRequestEmail({
    stockNumber: 'PB1234',
    clientName: 'Jane Buyer',
    soldUnit: 'Yes',
    additionalInformation: 'Customer needs vehicle',
    clientAdvisorEmail: 'advisor@example.com',
    respondersEmail: 'responder@example.com'
  });

  assert.equal(email.markedSold, true);
  assert.equal(email.accountingStockNumber, 'PB1234R');
  assert.match(email.accountingNote, /Please add an R to the stock number/);
  assert.match(email.body, /PB1234R/);
  assert.match(email.html, /PB1234R/);
});

test('non-sold unit requests do not include accounting note', () => {
  const email = buildLoanerRequestEmail({
    stockNumber: 'PB1234R',
    clientName: 'Jane Buyer',
    soldUnit: 'No',
    additionalInformation: 'Customer needs vehicle',
    clientAdvisorEmail: 'advisor@example.com',
    respondersEmail: 'responder@example.com'
  });

  assert.equal(isSoldRequest({ soldUnit: 'No' }), false);
  assert.equal(email.markedSold, false);
  assert.equal(email.accountingStockNumber, 'PB1234R');
  assert.equal(email.accountingNote, '');
});

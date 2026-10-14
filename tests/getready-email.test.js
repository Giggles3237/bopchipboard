const test = require('node:test');
const assert = require('node:assert/strict');

const { formatGetReadyEmail, formatEscalationEmail } = require('../utils/getReadyEmail');

test('sold unit Get Ready keeps existing sold-unit wording by default', () => {
  const email = formatGetReadyEmail({
    getReadyId: 'PB1234',
    dueBy: '8/24/2026 at 14:00',
    vehicle: 'X5 Black',
    customerName: 'Test Customer',
    salesperson: 'Advisor',
    submittedBy: 'Manager'
  });

  assert.match(email.subject, /\*SOLD UNIT\* GET READY/);
  assert.match(email.body, /sold unit/i);
  assert.match(email.html, /Sold Unit Get Ready/);
});

test('manager standalone Get Ready is not marked as sold unit', () => {
  const email = formatGetReadyEmail({
    getReadyId: 'PB5678',
    dueBy: '8/24/2026 at 14:00',
    vehicle: 'X3 White',
    customerName: 'Stock Unit',
    salesperson: 'Manager',
    submittedBy: 'Manager',
    soldUnit: false
  });

  assert.equal(email.subject, 'PB5678 GET READY - REPLY ALL FOR STATUS UPDATES');
  assert.doesNotMatch(email.body, /sold unit/i);
  assert.doesNotMatch(email.html, /Sold Unit Get Ready/);
});

test('regular and escalation emails spell out the due date without changing the source data', () => {
  for (const format of [formatGetReadyEmail, formatEscalationEmail]) {
    const data = { getReadyId: 'TEST', dueBy: '10/10/2026 at 14:00' };
    const email = format(data);
    assert.match(email.body, /Due By: October 10, 2026 at 14:00/);
    assert.match(email.html, /October 10, 2026 at 14:00/);
    assert.doesNotMatch(email.body + email.html, /10\/10\/2026/);
    assert.equal(data.dueBy, '10/10/2026 at 14:00');
  }
});

test('email due dates keep their calendar day and existing time wording', () => {
  const email = formatGetReadyEmail({ dueBy: '1/1/2027 at 2:00 PM' });
  assert.match(email.body, /January 1, 2027 at 2:00 PM/);
  assert.match(formatGetReadyEmail({ dueBy: 'Already scheduled' }).body, /Due By: Already scheduled/);
});

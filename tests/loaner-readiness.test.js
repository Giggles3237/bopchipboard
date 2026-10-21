const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoanerReadiness } = require('../middleware/loanerReadiness');
const { createLoanerEmailSender, loanerEmailReady } = require('../utils/loanerEmailTransport');
test('disabled workflow and absent schema block work without writes or sends', async () => {
  let queries = 0, continued = false, status;
  const pool = { execute: async sql => { queries++; assert.match(sql, /^SELECT .* LIMIT 0$/); throw new Error('missing table'); } };
  const res = { status(n) { status=n; return this; }, json() {} };
  await createLoanerReadiness(pool, () => false)({},res,()=>{continued=true;});
  assert.equal(status,503); assert.equal(queries,0);
  await createLoanerReadiness(pool, () => true)({},res,()=>{continued=true;});
  assert.equal(status,503); assert.equal(queries,1); assert.equal(continued,false);
  await createLoanerReadiness({execute:async()=>[[]]},()=>true)({},res,()=>{continued=true;});
  assert.equal(continued,true);
});
test('SMTP uses only snapshotted recipients and both bodies; partial acceptance stays uncertain', async () => {
  const saved = process.env.EMAIL_USER; const password = process.env.EMAIL_PASSWORD;
  process.env.EMAIL_USER='chipboard.bot@gmail.com'; process.env.EMAIL_PASSWORD='mock';
  try {
    let message;
    const send=createLoanerEmailSender(()=>({sendMail:async m=>{message=m;return {accepted:['distribution@example.com'],rejected:['requester@example.com']};}}),()=>true);
    const payload={requestId:'test-id',emailTo:['distribution@example.com','requester@example.com'],emailSubject:'Approved',emailBody:'plain',emailHtml:'<p>Approved</p>'};
    assert.equal((await send(payload)).ok,false);
    assert.deepEqual(message.to,payload.emailTo);assert.deepEqual(message.cc,[]);assert.deepEqual(message.bcc,[]);
    assert.equal(message.from.address,'chipboard.bot@gmail.com');assert.equal(message.text,'plain');assert.equal(message.html,payload.emailHtml);
    assert.equal((await createLoanerEmailSender(()=>{throw Error('must not connect');},()=>false)(payload)).ok,false);
    assert.equal(loanerEmailReady(),false);
  } finally {
    if(saved===undefined) delete process.env.EMAIL_USER;else process.env.EMAIL_USER=saved;
    if(password===undefined) delete process.env.EMAIL_PASSWORD;else process.env.EMAIL_PASSWORD=password;
  }
});

test('admin readiness diagnostics distinguish missing schema from access failures without leaking driver details', async () => {
  for (const [code, expected] of [['ER_NO_SUCH_TABLE', 'table is missing'], ['ER_BAD_FIELD_ERROR', 'incompatible columns'], ['ER_TABLEACCESS_DENIED_ERROR', 'cannot read'], ['ECONNRESET', 'query failed']]) {
    const check = createLoanerReadiness({execute:async()=>{throw Object.assign(new Error('secret connection SQL'),{code});}},()=>true);
    let body; const res={status(){return this;},json(x){body=x;}};
    await check({auth:{role:'Admin'}},res,()=>assert.fail('must block'));
    assert.ok(body.message.includes(expected)); assert.ok(body.message.includes(code));
    assert.ok(!body.message.includes('secret'));
    await check({auth:{role:'Salesperson'}},res,()=>assert.fail('must block'));
    assert.ok(!body.message.includes(code)); assert.ok(!body.message.includes(expected));
  }
});

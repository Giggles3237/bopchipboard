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

test('readiness safely identifies each preflight blocker without returning configured values', () => {
  const { loanerEmailReadiness } = require('../utils/loanerEmailTransport');
  const configured={LOANER_EMAIL_ENABLED:'true',EMAIL_USER:'chipboard.bot@gmail.com',EMAIL_PASSWORD:'private-secret'};
  for(const [env,code] of [[{...configured,LOANER_EMAIL_ENABLED:'false'},'EMAIL_DISABLED'],[{...configured,EMAIL_USER:'private-other@example.com'},'SENDER_MISMATCH'],[{...configured,EMAIL_PASSWORD:''},'PASSWORD_MISSING'],[configured,'CONFIGURED']]) {
    const result=loanerEmailReadiness(env);assert.equal(result.code,code);assert.equal(result.ready,code==='CONFIGURED');
    assert.ok(!JSON.stringify(result).includes('private-secret'));assert.ok(!JSON.stringify(result).includes('private-other'));
  }
});
test('existing request read exposes readiness only to admins and never performs a send', async () => {
  const router=require('../routes/loaners');const {oldPool}=require('../db');const original=oldPool.execute;
  const handler=router.stack.find(x=>x.route?.path==='/requests').route.stack.at(-1).handle;
  const row={id:'id',submitted_by:'1',email_state:'queued',request_json:{},approval_json:{},email_payload:{secret:'private'}};
  try {
    oldPool.execute=async sql=>{assert.match(sql,/^SELECT/);return [sql.startsWith('SELECT id')?[{id:'id'}]:[row]];};
    for(const role of ['Admin','Salesperson']) {
      let result;await handler({auth:{role,userId:1}},{json(x){result=x;},status(){return this;}});
      assert.equal(Boolean(result[0].emailReadiness),role==='Admin');assert.equal(result[0].email_payload,undefined);
    }
  } finally {oldPool.execute=original;}
});

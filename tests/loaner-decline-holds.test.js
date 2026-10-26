const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { createLoanerRequestStore } = require('../lib/loanerRequestStore');
const { createLoanerRequests } = require('../services/loanerRequests');
const requester = { userId: 12, organizationId: '1', role: 'Salesperson', name: 'Test Requestor', email: 'requestor@example.com' };
const admin = { userId: 1, organizationId: '1', role: 'Admin', name: 'Test Admin' };
const input = (soldUnit = 'Yes') => ({ requestId: randomUUID(), stockNumber: 'TEST123', clientName: 'Test Customer', soldUnit, additionalInformation: 'Synthetic notes', clientAdvisorEmail: 'advisor@example.com', respondersEmail: 'spoof@example.com', organizationId: 'spoof' });
const approval = { pulledStockNumber: 'TEST123', replacementStockNumber: 'TEST456', cpo: false };
function setup(options = {}) {
  const db = new DatabaseSync(':memory:');
  db.function('JSON_UNQUOTE', value => value == null ? null : String(value));
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, organization_id TEXT); INSERT INTO users VALUES (12,'1'), (1,'1'), (20,'2'); CREATE TABLE loaner_requests (id TEXT PRIMARY KEY, submitted_by TEXT, request_json JSON, state TEXT DEFAULT 'pending', approval_json JSON, email_payload JSON, email_state TEXT DEFAULT 'not_ready', created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  const pool = { async execute(sql, args) { try { const statement = db.prepare(sql); return /^SELECT/.test(sql) ? [statement.all(...args)] : [{ affectedRows: Number(statement.run(...args).changes) }]; } catch (error) { if (error.message.includes('UNIQUE constraint')) error.code = 'ER_DUP_ENTRY'; throw error; } } };
  const store = createLoanerRequestStore(pool); const sends = [];
  const service = createLoanerRequests({ store, transportReady: () => true, send: async payload => { sends.push(payload); return { ok:true }; }, ...options });
  return { db, store, service, sends };
}
test('decline persists original request, optional reason and actor; notifies verified requestor only', async () => {
  const { service, store, sends } = setup(); const request = input();
  const before = await service.submit(request, requester);
  const row = await service.decline(request.requestId, { reason: 'No capacity <today>', emailTo:['attacker@example.com'] }, admin);
  assert.equal(row.state, 'declined'); assert.equal(row.email_state,'accepted');
  assert.deepEqual(row.request_json, before.request_json); assert.equal(row.approval_json.declinedBy,'1');
  assert.equal(row.approval_json.reason,'No capacity <today>'); assert.ok(row.approval_json.declinedAt);
  assert.deepEqual(sends[0].emailTo, [requester.email]); assert.deepEqual(sends[0].emailCc, []); assert.deepEqual(sends[0].emailBcc, []);
  assert.match(sends[0].emailHtml,/No capacity &lt;today&gt;/);
  assert.doesNotMatch(sends[0].emailBody,/Test Customer|Synthetic notes|advisor@example.com/);
  assert.equal((await store.list(requester))[0].state, 'declined');
  const other = input(); await service.submit(other, requester);
  assert.equal((await service.decline(other.requestId, {}, admin)).approval_json.reason, '');
});
test('roles and organization isolate list, approve, decline and retry; client ownership ignored', async () => {
  const { service, store } = setup({ transportReady: () => false }); const request = input();
  const row = await service.submit(request, requester); assert.equal(row.request_json.organizationId,'1');
  for (const role of ['Salesperson','Manager','Genius']) await assert.rejects(service.decline(request.requestId, {}, {...requester,role}), {status:403});
  const otherAdmin = {...admin,organizationId:'2'};
  assert.deepEqual(await store.list(otherAdmin), []);
  assert.deepEqual(await store.list({...requester,userId:99}), []);
  for (const action of [()=>service.approve(request.requestId,approval,otherAdmin),()=>service.decline(request.requestId,{},otherAdmin),()=>service.retry(request.requestId,otherAdmin)]) await assert.rejects(action(),{status:404});
  await assert.rejects(service.submit(input(), {...requester,organizationId:null}), {status:403});
  const router = require('../routes/loaners');
  assert.deepEqual(router.stack.find(x=>x.route?.path==='/requests/:id/decline').route.stack.slice(0,3).map(x=>x.name),['authenticate','currentLoanerUser','requireAdmin']);
});
test('duplicate decline and response-loss retry do not resend or overwrite reason', async () => {
  const { service, store, sends } = setup(); const request=input(); await service.submit(request,requester);
  await Promise.all([service.decline(request.requestId,{reason:'Capacity'},admin),service.decline(request.requestId,{reason:'Capacity'},admin)]);
  await service.decline(request.requestId,{reason:'Capacity'},admin);
  assert.equal(sends.length,1);
  await assert.rejects(service.decline(request.requestId,{reason:'Changed'},admin),{status:409});
  assert.equal((await store.get(request.requestId)).approval_json.reason,'Capacity');
});
test('concurrent approval and decline have exactly one durable winner and notification', async () => {
  for (const declineFirst of [true,false]) {
    const { service, store, sends }=setup(); const request=input(); await service.submit(request,requester);
    const actions=[()=>service.decline(request.requestId,{},admin),()=>service.approve(request.requestId,approval,admin)];
    if(!declineFirst) actions.reverse();
    const results=await Promise.allSettled(actions.map(action=>action()));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
    assert.equal(sends.length,1); const row=await store.get(request.requestId);
    assert.equal(row.state,declineFirst?'declined':'processed');
  }
});
test('queued and definitely failed decline notifications are retryable; decline never disappears', async () => {
  let ready=false, attempts=0;
  const {service,store}=setup({transportReady:()=>ready,send:async()=>({ok:++attempts>1,retryable:true})});
  const request=input(); await service.submit(request,requester);
  assert.equal((await service.decline(request.requestId,{},admin)).email_state,'queued');
  ready=true; assert.equal((await service.retry(request.requestId,admin)).email_state,'failed');
  assert.equal((await store.get(request.requestId)).state,'declined');
  await Promise.allSettled([service.retry(request.requestId,admin),service.retry(request.requestId,admin)]);
  assert.equal(attempts,2); assert.equal((await store.get(request.requestId)).email_state,'accepted');
});
test('unknown notification outcome is visible and never blindly retried', async () => {
  let attempts=0; const {service,store}=setup({send:async()=>{attempts++;throw Error('response lost');}});
  const request=input(); await service.submit(request,requester);
  assert.equal((await service.decline(request.requestId,{},admin)).email_state,'uncertain');
  await service.decline(request.requestId,{},admin);
  await assert.rejects(service.retry(request.requestId,admin),{status:409});
  assert.equal(attempts,1); assert.equal((await store.get(request.requestId)).state,'declined');
});
test('invalid legacy requestor email retains decline without guessing a recipient or sending', async () => {
  const {service,store,db,sends}=setup();const request=input();await service.submit(request,requester);
  const saved=(await store.get(request.requestId)).request_json;
  db.prepare('UPDATE loaner_requests SET request_json=? WHERE id=?').run(JSON.stringify({...saved,respondersEmail:''}),request.requestId);
  const row=await service.decline(request.requestId,{},admin);
  assert.equal(row.state,'declined');assert.equal(row.email_state,'queued');assert.equal(sends.length,0);
  assert.deepEqual(row.email_payload.emailTo,[]);
});
test('Hold submits and approves without replacement/CPO; no coerced false or zero fee', async () => {
  const {service,store,sends}=setup();const request=input('No');await service.submit(request,requester);
  const row=await service.approve(request.requestId,{pulledStockNumber:'TEST123'},admin);
  assert.equal(row.approval_json.requestType,'hold');assert.equal(row.approval_json.cpo,null);assert.equal(row.approval_json.replacementStockNumber,null);
  assert.match(sends[0].emailBody,/CPO: Not applicable/);assert.doesNotMatch(sends[0].emailBody,/CPO: No\b|\$0/);
  assert.deepEqual(sends[0].emailTo,['loanerdistribution@pandwforeigncars.com',requester.email]);assert.deepEqual(sends[0].emailCc,['advisor@example.com']);
  assert.equal((await store.get(request.requestId)).request_json.soldUnit,'No');
});
test('sold releases still require replacement and explicit CPO; client cannot switch persisted type', async () => {
  const {service}=setup();const request=input('Yes');await service.submit(request,requester);
  for(const data of [{pulledStockNumber:'TEST123'}, {...approval,cpo:undefined}, {...approval,cpo:''}, {...approval,replacementStockNumber:''}, {soldUnit:'No',pulledStockNumber:'TEST123'}]) await assert.rejects(service.approve(request.requestId,data,admin),{status:400});
  await assert.rejects(service.submit({...request,soldUnit:'No'},requester),{status:409});
  assert.equal((await service.approve(request.requestId,approval,admin)).state,'processed');
});
test('unverified legacy ownership stays restricted across submitter organization changes', async () => {
  const {service,store,db,sends}=setup();const request=input();await service.submit(request,requester);
  const saved=(await store.get(request.requestId)).request_json;delete saved.organizationId;
  db.prepare('UPDATE loaner_requests SET request_json=?,state=?,email_state=? WHERE id=?').run(JSON.stringify(saved),'processed','queued',request.requestId);
  const before=await store.get(request.requestId);
  for(const membership of ['1','2']) {
    db.prepare('UPDATE users SET organization_id=? WHERE id=?').run(membership,12);
    for(const organizationId of ['1','2']) {
      const actor={...admin,organizationId};
      assert.deepEqual(await store.list(actor),[]);
      assert.deepEqual(await store.list({...requester,organizationId}),[]);
      await assert.rejects(service.approve(request.requestId,approval,actor),{status:404});
      await assert.rejects(service.decline(request.requestId,{},actor),{status:404});
      await assert.rejects(service.retry(request.requestId,actor),{status:404});
      await assert.rejects(service.submit(request,{...requester,organizationId}),{status:409});
    }
    assert.deepEqual(await store.get(request.requestId),before);
  }
  assert.equal(before.organization_id,null);assert.equal(sends.length,0);
});
test('explicit verified ownership restores only the recorded organization without rewriting history or sending', async () => {
  const {service,store,db,sends}=setup({transportReady:()=>false});const request=input();await service.submit(request,requester);
  await service.approve(request.requestId,approval,admin);
  const saved=await store.get(request.requestId);const legacy={...saved.request_json};delete legacy.organizationId;
  db.prepare('UPDATE loaner_requests SET request_json=? WHERE id=?').run(JSON.stringify(legacy),request.requestId);
  db.prepare('UPDATE users SET organization_id=? WHERE id=?').run('2',12);
  // Simulate an independently reviewed, explicit backfill in this synthetic fixture only.
  db.prepare("UPDATE loaner_requests SET request_json=json_set(request_json,'$.organizationId',?) WHERE id=?").run('1',request.requestId);
  const verified=await store.get(request.requestId);
  assert.deepEqual(verified,saved);
  assert.equal((await store.list(admin)).length,1);assert.deepEqual(await store.list({...admin,organizationId:'2'}),[]);
  assert.equal(sends.length,0);
});
test('new request ownership survives submitter organization changes; unknown legacy owners fail closed', async () => {
 const {service,store,db}=setup();const request=input();await service.submit(request,requester);
 db.prepare('UPDATE users SET organization_id=? WHERE id=?').run('2',12);
 assert.equal((await store.list(admin)).length,1);
 assert.deepEqual(await store.list({...admin,organizationId:'2'}),[]);
 assert.equal((await service.decline(request.requestId,undefined,admin)).state,'declined');
 const legacy=input();const {organizationId,...body}=(await store.get(request.requestId)).request_json;
 db.prepare('INSERT INTO loaner_requests (id,submitted_by,request_json) VALUES (?,?,?)').run(legacy.requestId,'missing',JSON.stringify(body));
 await assert.rejects(service.decline(legacy.requestId,{},admin),{status:404});
});
test('legacy Hold request approval preserves all original fields and ignores irrelevant stale approval values', async () => {
 const {service,store,db}=setup();const request=input('No');await service.submit(request,requester);
 const original={...(await store.get(request.requestId)).request_json,legacyReplacement:'OLD123',legacyCpoAnswer:true};
 db.prepare('UPDATE loaner_requests SET request_json=? WHERE id=?').run(JSON.stringify(original),request.requestId);
 const row=await service.approve(request.requestId,{...approval,make:'MINI',cpo:true},admin);
 assert.deepEqual(row.request_json,original);assert.equal(row.approval_json.cpo,null);
});
test('overlong or malformed decline reason cannot alter pending request', async () => {
 const {service,store}=setup();const request=input();await service.submit(request,requester);
 for(const reason of ['x'.repeat(2001),false,{}]) await assert.rejects(service.decline(request.requestId,{reason},admin),{status:400});
 assert.equal((await store.get(request.requestId)).state,'pending');
});
test('failed decline write sends nothing; lost completion after send cannot repeat notification', async () => {
 const {service,store,sends}=setup();const request=input();await service.submit(request,requester);
 const original=store.decline;store.decline=async()=>{throw Error('write failed');};
 await assert.rejects(service.decline(request.requestId,{},admin));
 assert.equal((await store.get(request.requestId)).state,'pending');assert.equal(sends.length,0);
 store.decline=original;store.finishEmail=async()=>{throw Error('completion lost');};
 await assert.rejects(service.decline(request.requestId,{},admin));
 assert.equal((await store.get(request.requestId)).state,'declined');assert.equal((await store.get(request.requestId)).email_state,'sending');
 await service.decline(request.requestId,{},admin);await assert.rejects(service.retry(request.requestId,admin),{status:409});assert.equal(sends.length,1);
});

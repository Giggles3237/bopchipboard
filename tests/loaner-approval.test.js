const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { createLoanerRequestStore } = require('../lib/loanerRequestStore');
const { createLoanerRequests, approvalSnapshot, buildApprovedPayload } = require('../services/loanerRequests');
const fees = require('../seed/cpo-fees.json');
const user = { userId: 12, name: 'Advisor', email: 'advisor@example.com', role: 'Salesperson' };
const admin = { userId: 1, name: 'Admin <A>', email: 'admin@example.com', role: 'Admin' };
const request = () => ({ requestId: randomUUID(), stockNumber: 'SALE123', clientName: 'Buyer', soldUnit: 'Yes', additionalInformation: 'Pull request', clientAdvisorEmail: user.email });
const approval = { pulledStockNumber: 'PULL123', replacementStockNumber: 'NEW456', cpo: true, make: 'BMW', cpoModel: 'X3', cpoCost: 1200 };
function setup(options = {}) {
  // Execute production store SQL against isolated in-memory tables; no db.js or live DB.
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE loaner_requests (id TEXT PRIMARY KEY, submitted_by TEXT, request_json JSON, state TEXT DEFAULT 'pending', approval_json JSON, email_payload JSON, email_state TEXT DEFAULT 'not_ready', created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  const pool = { async execute(sql, args) {
    try {
      const statement = db.prepare(sql);
      return /^SELECT/.test(sql) ? [statement.all(...args)] : [{ affectedRows: Number(statement.run(...args).changes) }];
    } catch (error) { if (error.message.includes('UNIQUE constraint')) error.code = 'ER_DUP_ENTRY'; throw error; }
  } };
  const store = createLoanerRequestStore(pool);
  const sends = [];
  const service = createLoanerRequests({ store, transportReady: () => true, send: async payload => { sends.push(payload); return { ok: true }; }, ...options });
  return { store, service, sends, db };
}
test('every fee model uses only approved 60-month base fee; no CPO costs zero', () => {
  for (const level of fees.levels) for (const model of level.models) {
    const result = approvalSnapshot({ ...approval, cpoModel: model, cpoCost: level.cost }, admin);
    assert.equal(result.cpo.cost, level.cost); assert.equal(result.cpo.termMonths, 60);
  }
  assert.equal(approvalSnapshot({ ...approval, cpo: false }, admin).cpo.cost, 0);
  for (const input of [{ make: 'MINI' }, { cpoModel: 'M340i' }, { cpoModel: 'X3 M40i' }, { cpoModel: 'M Sport' }, { cpoCost: 1500 }, { cpoCost: 2750 }, { cpo: 'false' }, { replacementStockNumber: 'PULL123' }]) {
    assert.throws(() => approvalSnapshot({ ...approval, ...input }, admin), { status: 400 });
  }
});
test('submission is persistent, idempotent, bound to authenticated submitter and does not email', async () => {
  const { service, store, sends } = setup(); const input = request();
  await service.submit({ ...input, respondersEmail: 'spoof@example.com' }, user);
  await service.submit(input, user);
  assert.equal((await store.list(user)).length, 1);
  assert.equal((await store.get(input.requestId)).request_json.respondersEmail, user.email);
  assert.equal(sends.length, 0);
  await assert.rejects(service.submit({ ...input, clientName: 'Changed' }, user), { status: 409 });
  await assert.rejects(service.submit(input, { ...user, userId: 13 }), { status: 409 });
  assert.equal((await store.list({ ...user, userId: 13 })).length, 0);
});
test('concurrent admins produce one approval and one send; approved snapshot survives fee changes', async () => {
  const { service, store, sends } = setup(); const input = request(); await service.submit(input, user);
  const results = await Promise.allSettled([service.approve(input.requestId, approval, admin), service.approve(input.requestId, approval, { ...admin, userId: 2 })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(sends.length, 1);
  const row = await store.get(input.requestId);
  assert.equal(row.state, 'processed'); assert.equal(row.email_state, 'accepted');
  assert.equal(row.approval_json.cpo.cost, 1200); assert.equal(row.approval_json.approvedBy, '1');
  assert.match(sends[0].emailBody, /Pulled vehicle stock number: PULL123/);
  assert.match(sends[0].emailBody, /Replacement vehicle stock number: NEW456/);
  assert.match(sends[0].emailBody, /1,200.00/);
  assert.match(sends[0].emailHtml, /Admin &lt;A&gt;/);
  assert.equal(sends[0].stockNumber, 'SALE123');
  assert.equal(sends[0].accountingNote, undefined);
  assert.equal(sends[0].accountingStockNumber, undefined);
  assert.deepEqual(sends[0].emailTo, ['loanerdistribution@pandwforeigncars.com', user.email]);
  assert.deepEqual(sends[0].emailCc, []); assert.deepEqual(sends[0].emailBcc, []);
  await assert.rejects(service.retry(input.requestId, admin), { status: 409 });
});
test('queued emails can be retried concurrently without duplicate sends', async () => {
  let ready = false; const { service, store, sends } = setup({ transportReady: () => ready });
  const input = request(); await service.submit(input, user); await service.approve(input.requestId, approval, admin);
  assert.equal((await store.get(input.requestId)).email_state, 'queued'); assert.equal(sends.length, 0);
  ready = true; await Promise.allSettled([service.retry(input.requestId, admin), service.retry(input.requestId, admin)]);
  assert.equal(sends.length, 1); assert.equal((await store.get(input.requestId)).email_state, 'accepted');
});
test('timeout or rejection holds delivery uncertain; no blind resend', async () => {
  for (const send of [async () => { throw new Error('timeout after delivery'); }, async () => ({ ok: false })]) {
    let attempts = 0;
    const { service, store } = setup({ send: async payload => { attempts++; return send(payload); } });
    const input = request(); await service.submit(input, user); await service.approve(input.requestId, approval, admin);
    assert.equal((await store.get(input.requestId)).email_state, 'uncertain');
    await assert.rejects(service.retry(input.requestId, admin), { status: 409 }); assert.equal(attempts, 1);
  }
});
test('crash/failure recording successful send cannot allow duplicate retry', async () => {
  const { service, store, sends } = setup(); const input = request(); await service.submit(input, user);
  store.finishEmail = async () => { throw new Error('database unavailable after accepted email'); };
  await assert.rejects(service.approve(input.requestId, approval, admin));
  assert.equal((await store.get(input.requestId)).email_state, 'sending');
  await assert.rejects(service.retry(input.requestId, admin), { status: 409 }); assert.equal(sends.length, 1);
});
test('all non-admin roles cannot approve or retry; route guards enforce auth', async () => {
  const { service } = setup(); const input = request(); await service.submit(input, user);
  for (const role of ['Manager', 'Salesperson', 'Genius']) {
    await assert.rejects(service.approve(input.requestId, approval, { ...user, role }), { status: 403 });
    await assert.rejects(service.retry(input.requestId, { ...user, role }), { status: 403 });
  }
  const router = require('../routes/loaners');
  for (const path of ['/requests/:id/approve', '/requests/:id/retry-email']) {
    assert.deepEqual(router.stack.find(x => x.route?.path === path).route.stack.slice(0,3).map(x => x.name), ['authenticate', 'currentLoanerUser', 'requireAdmin']);
  }
  assert.equal(router.stack.find(x => x.route?.path === '/request').route.stack[0].name, 'authenticate');
});
test('approved no-CPO email clearly shows zero/not applicable in text and HTML', () => {
  const payload = buildApprovedPayload('id', { ...request(), respondersEmail: user.email }, approvalSnapshot({ ...approval, cpo: false }, admin));
  assert.match(payload.emailBody, /\$0.00 USD \(not applicable\)/);
  for (const body of [payload.emailBody, payload.emailHtml]) {
    assert.match(body, /\$0.00 USD/); assert.match(body, /NEW456/); assert.match(body, /PULL123/);
  }
});

test('current user lookup supports old JWTs without email and rejects inactive/stale admin', async () => {
  const router = require('../routes/loaners');
  const { oldPool } = require('../db'); const original = oldPool.execute;
  const middleware = router.stack.find(x => x.route?.path === '/requests/:id/approve').route.stack[1].handle;
  try {
    oldPool.execute = async () => [[{ id: 1, name: 'Current', email: 'current@example.com', role: 'Salesperson', status: 'active' }]];
    const req = { auth: { userId: 1, role: 'Admin' } }; let next = false;
    await middleware(req, {}, () => { next = true; });
    assert.equal(next, true); assert.equal(req.auth.email, 'current@example.com'); assert.equal(req.auth.role, 'Salesperson');
    oldPool.execute = async () => [[{ id: 1, role: 'Admin', status: 'inactive' }]];
    let status; next = false;
    await middleware(req, { status(code) { status = code; return this; }, json() {} }, () => { next = true; });
    assert.equal(status, 403); assert.equal(next, false);
  } finally { oldPool.execute = original; }
});
test('retry uses immutable saved payload even after fee chart changes', async () => {
  const chart = structuredClone(fees); let ready = false;
  const { service, store, sends } = setup({ feeChart: chart, transportReady: () => ready });
  const input = request(); await service.submit(input, user); await service.approve(input.requestId, approval, admin);
  chart.levels[1].cost = 9999; chart.version = 'future'; ready = true;
  await service.retry(input.requestId, admin);
  assert.equal(sends[0].approval.cpo.cost, 1200);
  assert.equal((await store.get(input.requestId)).approval_json.cpo.version, fees.version);
});

test('missing transport result is uncertain and cannot be resent', async () => {
  const { service, store } = setup({ send: async () => undefined });
  const input = request(); await service.submit(input, user);
  await service.approve(input.requestId, approval, admin);
  assert.equal((await store.get(input.requestId)).email_state, 'uncertain');
  await assert.rejects(service.retry(input.requestId, admin), { status: 409 });
});
test('failed approval write cannot send; loss after durable send claim remains held', async () => {
  const { service, store, sends } = setup(); const input = request(); await service.submit(input, user);
  const originalApprove = store.approve;
  store.approve = async () => { throw new Error('write unavailable'); };
  await assert.rejects(service.approve(input.requestId, approval, admin));
  assert.equal(sends.length, 0); assert.equal((await store.get(input.requestId)).state, 'pending');
  store.approve = originalApprove;
  const originalClaim = store.claimEmail;
  store.claimEmail = async id => { await originalClaim(id); throw new Error('claim response lost'); };
  await assert.rejects(service.approve(input.requestId, approval, admin));
  assert.equal(sends.length, 0); assert.equal((await store.get(input.requestId)).email_state, 'sending');
  await assert.rejects(service.retry(input.requestId, admin), { status: 409 });
});
test('flow adapter preserves requestId and HTML payload and prevents redirect replay', async () => {
  const axios = require('axios'); const originalPost = axios.post;
  const previousUrl = process.env.LOANER_REQUEST_FLOW_URL;
  process.env.LOANER_REQUEST_FLOW_URL = 'https://example.invalid/mock-flow';
  try {
    let calls = 0;
    axios.post = async (url, payload, options) => {
      calls++; assert.equal(url, 'https://example.invalid/mock-flow');
      assert.equal(options.headers['Idempotency-Key'], 'mock-request');
      assert.equal(options.maxRedirects, 0); assert.equal(payload.emailHtml, '<p>Approved</p>');
      return { status: 202, data: {} };
    };
    const { submitToLoanerFlow } = require('../utils/loanerFlow');
    assert.equal((await submitToLoanerFlow({ requestId: 'mock-request', emailHtml: '<p>Approved</p>' })).ok, true);
    assert.equal(calls, 1);
  } finally {
    axios.post = originalPost;
    if (previousUrl === undefined) delete process.env.LOANER_REQUEST_FLOW_URL; else process.env.LOANER_REQUEST_FLOW_URL = previousUrl;
  }
});

test('requester recipients are trusted stored identity, not submitted responder or approval overrides', async () => {
  const { service, store, sends } = setup(); const input = request();
  await service.submit({ ...input, respondersEmail: 'attacker@example.com', emailTo: ['attacker@example.com'] }, user);
  await service.approve(input.requestId, { ...approval, respondersEmail: 'attacker@example.com', emailTo: ['attacker@example.com'], accountingStockNumber: 'ALTERED' }, admin);
  const row = await store.get(input.requestId);
  assert.deepEqual(sends[0].emailTo, ['loanerdistribution@pandwforeigncars.com', user.email]);
  assert.deepEqual(row.email_payload.emailTo, sends[0].emailTo);
  assert.equal(row.email_payload.accountingStockNumber, undefined);
  assert.equal(row.email_payload.stockNumber, input.stockNumber);
});

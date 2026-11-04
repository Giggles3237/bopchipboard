const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGetReadyDate, buildDueDate } = require('../utils/getReadyDate');
const { formatGetReadyEmail, formatEscalationEmail } = require('../utils/getReadyEmail');

test('structured dates override swapped display text in ordinary and escalation emails', () => {
  for (const [getReadyDate, dueBy, expected] of [
    ['2026-11-04', '04/11/2026 at 09:00', 'November 4, 2026 at 14:30'],
    ['2026-04-11', '11/04/2026 at 09:00', 'April 11, 2026 at 14:30'],
    ['2026-11-05', '05/11/2026 at 09:00', 'November 5, 2026 at 14:30'],
    ['2026-05-11', '11/05/2026 at 09:00', 'May 11, 2026 at 14:30'],
    ['2028-02-29', 'Wrong date', 'February 29, 2028 at 14:30'],
    ['2027-01-01', 'Wrong date', 'January 1, 2027 at 14:30']
  ]) {
    const data = { getReadyDate, dueBy, promiseTime: '14:30' };
    for (const format of [formatGetReadyEmail, formatEscalationEmail]) {
      const email = format(data);
      assert.ok(email.body.includes(`Due By: ${expected}`));
      assert.ok(email.html.includes(expected));
    }
    assert.equal(data.dueBy, dueBy);
    assert.equal(buildDueDate(data), new Date(`${getReadyDate}T14:30:00`).toISOString());
  }
});

const invalidSchedules = [
  ...['2026-02-29', '2026-04-31', '2026-11-31', '2026-00-04', '2026-13-04', '2026-11-00', '0000-01-01', '11/04/2026', '2026-1-4', '2026-11-04T00:00:00Z', '', null, 20261104].map(getReadyDate => ({ getReadyDate, promiseTime: '14:00' })),
  ...['24:00', '12:60', '-1:00', '2:00 PM', '2:00', '', null, 1400].map(promiseTime => ({ getReadyDate: '2026-11-04', promiseTime })),
  { getReadyDate: '2026-11-04' }, { promiseTime: '14:00' }
];

test('invalid or incomplete structured values never fall back to dueBy', () => {
  for (const data of invalidSchedules) {
    assert.throws(() => normalizeGetReadyDate({ ...data, dueBy: '11/04/2026 at 14:00' }), { statusCode: 400 });
  }
  for (const promiseTime of ['00:00', '23:59']) {
    assert.equal(normalizeGetReadyDate({ getReadyDate: '2026-12-31', promiseTime }).promiseTime, promiseTime);
  }
});

test('legacy records retain their existing US display interpretation and free text', () => {
  for (const [dueBy, display] of [
    ['11/04/2026 at 2:00 PM', 'November 4, 2026 at 2:00 PM'],
    ['04/11/2026 at 14:00', 'April 11, 2026 at 14:00'],
    ['31/12/2026 at 14:00', '31/12/2026 at 14:00'],
    ['Already scheduled', 'Already scheduled']
  ]) {
    assert.deepEqual(normalizeGetReadyDate({ dueBy }), { dueBy });
    assert.ok(formatGetReadyEmail({ dueBy }).body.includes(`Due By: ${display}`));
  }
});

test('route validates before side effects and uses one schedule for every destination and escalation', async (t) => {
  const axios = require('axios');
  const jwt = require('jsonwebtoken');
  const email = require('../utils/getReadyEmail');
  const webhook = require('../utils/webhook');
  const keys = ['JWT_SECRET', 'GET_READY_API_URL', 'GET_READY_INTEGRATION_KEY', 'GET_READY_EXCEL_FLOW_URL'];
  const previousEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originals = { post: axios.post, email: email.sendGetReadyEmail, escalation: email.sendGetReadyEscalationEmail, webhook: webhook.sendGetReadyWebhook };
  const sent = [], escalations = [], webhooks = [], integrations = [];
  email.sendGetReadyEmail = async data => { sent.push(data); return { to: [] }; };
  email.sendGetReadyEscalationEmail = async data => { escalations.push(data); return { to: [] }; };
  webhook.sendGetReadyWebhook = async data => { webhooks.push(data); };
  axios.post = async (url, data) => { integrations.push({ url, data }); return { status: 200, data: {} }; };
  Object.assign(process.env, { JWT_SECRET: 'test-only-secret', GET_READY_API_URL: 'https://example.com/getready', GET_READY_INTEGRATION_KEY: 'test-key', GET_READY_EXCEL_FLOW_URL: 'https://example.com/excel' });
  delete require.cache[require.resolve('../routes/getready')];
  const router = require('../routes/getready');
  const handler = router.stack.find(layer => layer.route?.path === '/send-email').route.stack.at(-1).handle;
  const escalate = router.stack.find(layer => layer.route?.path === '/escalate' && layer.route.methods.post).route.stack.at(-1).handle;
  t.after(() => {
    axios.post = originals.post;
    email.sendGetReadyEmail = originals.email;
    email.sendGetReadyEscalationEmail = originals.escalation;
    webhook.sendGetReadyWebhook = originals.webhook;
    for (const key of keys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    delete require.cache[require.resolve('../routes/getready')];
  });
  async function submit(schedule) {
    let status = 200, result;
    await handler({ headers: {}, protocol: 'https', get: () => 'example.com',
      auth: { role: 'Manager', userName: 'Test', email: 'test@example.com' },
      body: { getReadyId: 'TEST', vehicle: 'Test Car', customerName: 'Test Customer', dueBy: '04/11/2026 at 09:00', ...schedule }
    }, { status(code) { status = code; return this; }, json(body) { result = body; } });
    return { status, result };
  }
  for (const schedule of invalidSchedules) assert.equal((await submit(schedule)).status, 400);
  assert.deepEqual([sent.length, webhooks.length, integrations.length], [0, 0, 0]);

  for (const date of ['2026-11-04', '2026-04-11', '2026-11-05', '2026-05-11']) {
    const { status, result } = await submit({ getReadyDate: date, promiseTime: '14:00', dueBy: date === '2026-04-11' ? undefined : '04/11/2026 at 09:00' });
    assert.equal(status, 200);
    const expected = normalizeGetReadyDate({ getReadyDate: date, promiseTime: '14:00' });
    for (const data of [result.data, sent.at(-1), webhooks.at(-1), integrations.at(-1).data]) {
      for (const [key, value] of Object.entries(expected)) assert.equal(data[key], value);
    }
    assert.equal(integrations.at(-2).data.due_date, new Date(`${date}T14:00:00`).toISOString());
    const token = new URL(result.data.escalationUrl).searchParams.get('token');
    const tokenData = jwt.verify(token, process.env.JWT_SECRET).getReadyData;
    for (const [key, value] of Object.entries(expected)) assert.equal(tokenData[key], value);
    await escalate({ query: { token }, body: {} }, { status() { return this; }, send() {} });
    for (const [key, value] of Object.entries(expected)) assert.equal(escalations.at(-1)[key], value);
  }
  const legacy = await submit({});
  assert.equal(legacy.status, 200);
  assert.equal(legacy.result.data.dueBy, '04/11/2026 at 09:00');
  assert.equal(legacy.result.data.getReadyDate, undefined);
});

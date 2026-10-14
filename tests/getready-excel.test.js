const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const email = require('../utils/getReadyEmail');
const webhook = require('../utils/webhook');

test('Get Ready Excel delivery preserves data and does not fail successful emails', async (t) => {
  const keys = ['JWT_SECRET', 'GET_READY_EXCEL_FLOW_URL', 'GET_READY_EXCEL_FLOW_KEY', 'GET_READY_INTEGRATION_KEY', 'BOPCHIPBOARD_API_KEY'];
  const previousEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const previousPost = axios.post;
  const previousEmail = email.sendGetReadyEmail;
  const previousWebhook = webhook.sendGetReadyWebhook;
  let emailsSent = 0;
  const calls = [];
  email.sendGetReadyEmail = async () => { emailsSent++; return { to: ['test@example.com'] }; };
  webhook.sendGetReadyWebhook = async () => true;
  process.env.JWT_SECRET = 'test-secret';
  delete process.env.GET_READY_INTEGRATION_KEY;
  delete process.env.BOPCHIPBOARD_API_KEY;
  delete require.cache[require.resolve('../routes/getready')];
  const router = require('../routes/getready');
  const handler = router.stack.find(layer => layer.route?.path === '/send-email').route.stack.at(-1).handle;
  t.after(() => {
    axios.post = previousPost;
    email.sendGetReadyEmail = previousEmail;
    webhook.sendGetReadyWebhook = previousWebhook;
    for (const key of keys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    delete require.cache[require.resolve('../routes/getready')];
  });
  async function submit() {
    let status = 200, body;
    await handler({
      headers: {}, protocol: 'https', get: () => 'example.com',
      auth: { role: 'Manager', userName: 'Manager', email: 'manager@example.com' },
      body: { getReadyId: 'TEST', dueBy: '10/10/2026 at 14:00', vehicle: 'X5 Black',
        customerName: 'Stock Unit', getReadyDate: '2026-10-10', promiseTime: '14:00',
        soldUnit: false, itemsNeeded: ['Fuel', 'PDI'] }
    }, { status(code) { status = code; return this; }, json(value) { body = value; } });
    return { status, body };
  }
  delete process.env.GET_READY_EXCEL_FLOW_URL;
  axios.post = async (...args) => { calls.push(args); return { status: 200, data: {} }; };
  const skipped = await submit();
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.excel.skipped, true);
  assert.equal(calls.length, 0);

  process.env.GET_READY_EXCEL_FLOW_URL = 'https://example.com/excel';
  process.env.GET_READY_EXCEL_FLOW_KEY = 'test-key';
  const success = await submit();
  assert.equal(success.body.excel.ok, true);
  assert.equal(calls[0][0], 'https://example.com/excel');
  assert.equal(calls[0][1].dueBy, '10/10/2026 at 14:00');
  assert.equal(calls[0][1].itemsNeeded, 'Fuel, PDI');
  assert.equal(calls[0][1].soldUnit, 'No');
  assert.equal(calls[0][2].headers['x-chipboard-key'], 'test-key');
  assert.equal(calls[0][2].timeout, 15000);

  axios.post = async () => { throw new Error('Excel unavailable'); };
  const failed = await submit();
  assert.equal(failed.status, 200);
  assert.equal(failed.body.excel.ok, false);
  assert.equal(failed.body.excel.message, 'Excel unavailable');
  assert.equal(emailsSent, 3);
});

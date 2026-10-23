const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cors = require('cors');
const corsOrigin = require('../middleware/cors');
const jwt = require('jsonwebtoken');

test('Get Ready escalation confirmation submits comments without resubmitting the token in the body', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'get-ready-escalation-test-secret';

  const emailModule = require('../utils/getReadyEmail');
  const originalSend = emailModule.sendGetReadyEscalationEmail;
  let sentData;

  emailModule.sendGetReadyEscalationEmail = async (data) => {
    sentData = data;
    return { to: ['test@example.com'], cc: null };
  };

  delete require.cache[require.resolve('../routes/getready')];
  const getReadyRouter = require('../routes/getready');
  const app = express();
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use('/api/getready', getReadyRouter);
  app.use((error, req, res, next) => {
    res.status(500).json({ message: 'Something broke!', detail: error.message });
  });

  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });

  t.after(() => {
    server.close();
    emailModule.sendGetReadyEscalationEmail = originalSend;
    process.env.JWT_SECRET = previousSecret;
    delete require.cache[require.resolve('../routes/getready')];
  });

  const token = jwt.sign({
    type: 'getready_escalation',
    getReadyData: {
      getReadyId: 'TEST-123',
      vehicle: 'Test Vehicle'
    }
  }, process.env.JWT_SECRET);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const confirmationResponse = await fetch(`${baseUrl}/api/getready/escalate?token=${encodeURIComponent(token)}`);
  const confirmationHtml = await confirmationResponse.text();

  assert.equal(confirmationResponse.status, 200);
  assert.match(confirmationHtml, new RegExp(`action="/api/getready/escalate\\?token=${token.replace(/\./g, '\\.')}"`));
  assert.doesNotMatch(confirmationHtml, /name="token"/);

  const submitResponse = await fetch(`${baseUrl}/api/getready/escalate?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://bopchipboard-c66df77a754d.herokuapp.com'
    },
    body: new URLSearchParams({ escalationComments: 'Needs attention & a status update' })
  });
  const submitHtml = await submitResponse.text();

  assert.equal(submitResponse.status, 200);
  assert.equal(submitResponse.headers.get('access-control-allow-origin'), 'https://bopchipboard-c66df77a754d.herokuapp.com');
  assert.match(submitHtml, /Get Ready Escalated/);
  assert.equal(sentData.escalationComments, 'Needs attention & a status update');
});

test('CORS still rejects origins outside the application allowlist', () => {
  for (const origin of [
    'https://untrusted.example',
    'https://bopchipboard-c66df77a754d.herokuapp.com.untrusted.example'
  ]) {
    corsOrigin(origin, (error, allowed) => {
      assert.match(error.message, /Not allowed by CORS/);
      assert.notEqual(allowed, true);
    });
  }
});

test('malformed escalation form data gets a useful response instead of the global error page', async (t) => {
  const getReadyRouter = require('../routes/getready');
  const app = express();
  app.use('/api/getready', getReadyRouter);
  app.use((error, req, res, next) => {
    res.status(500).json({ message: 'Something broke!', detail: error.message });
  });

  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/getready/escalate?token=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ escalationComments: 'x'.repeat(17000) })
  });
  const responseText = await response.text();

  assert.equal(response.status, 400);
  assert.match(responseText, /form could not be read/i);
  assert.doesNotMatch(responseText, /Something broke/i);
});

test('global JSON parser does not intercept Get Ready escalation submissions', async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'get-ready-escalation-test-secret';

  const emailModule = require('../utils/getReadyEmail');
  const originalSend = emailModule.sendGetReadyEscalationEmail;
  let sentData;

  emailModule.sendGetReadyEscalationEmail = async (data) => {
    sentData = data;
    return { to: ['test@example.com'], cc: null };
  };

  delete require.cache[require.resolve('../routes/getready')];
  const getReadyRouter = require('../routes/getready');
  const app = express();
  const jsonParser = express.json();

  app.use((req, res, next) => {
    if (req.path === '/api/getready/escalate') {
      return next();
    }

    return jsonParser(req, res, next);
  });
  app.use('/api/getready', getReadyRouter);
  app.use((error, req, res, next) => {
    res.status(500).json({ message: 'Something broke!', detail: error.message });
  });

  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });

  t.after(() => {
    server.close();
    emailModule.sendGetReadyEscalationEmail = originalSend;
    process.env.JWT_SECRET = previousSecret;
    delete require.cache[require.resolve('../routes/getready')];
  });

  const token = jwt.sign({
    type: 'getready_escalation',
    getReadyData: {
      getReadyId: 'TEST-456',
      vehicle: 'Test Vehicle'
    }
  }, process.env.JWT_SECRET);

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/getready/escalate?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{'
  });
  const responseText = await response.text();

  assert.equal(response.status, 200);
  assert.match(responseText, /Get Ready Escalated/);
  assert.equal(sentData.getReadyId, 'TEST-456');
  assert.doesNotMatch(responseText, /Something broke/i);
});

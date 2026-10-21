const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { oldPool } = require('../db');
const { createLoanerRequestStore } = require('../lib/loanerRequestStore');
const { createLoanerRequests } = require('../services/loanerRequests');
const { sendLoanerEmail, loanerEmailReady, loanerEmailReadiness } = require('../utils/loanerEmailTransport');
const { createLoanerReadiness } = require('../middleware/loanerReadiness');
const rates = require('../seed/cpo-fees.json');
const store = createLoanerRequestStore(oldPool);
const service = createLoanerRequests({ store, send: sendLoanerEmail,
  transportReady: loanerEmailReady });
const router = express.Router();
const loanerReady = createLoanerReadiness(oldPool);
function presentLoaner(row, user) {
  const { email_payload, ...visible } = row;
  if (user.role === 'Admin' && row.email_state === 'queued') visible.emailReadiness = loanerEmailReadiness();
  return visible;
}
const handle = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    console.error('Loaner workflow error:', error.message);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Loaner workflow unavailable. Please retry with the same request ID.' });
  }
};
// Existing login JWTs omit email. Resolve identity/current role from the same users/roles
// tables rather than trusting the request's responder or a stale admin role.
async function currentLoanerUser(req, res, next) {
  try {
    const [users] = await oldPool.execute('SELECT u.id, u.name, u.email, u.status, r.name AS role FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE u.id = ?', [req.auth.userId]);
    const user = users[0];
    if (!user || user.status !== 'active') return res.status(403).json({ message: 'Active user required' });
    req.auth = { ...req.auth, userId: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (_) { res.status(503).json({ message: 'Unable to verify current user.' }); }
}
router.get('/test', (req, res) => res.json({ message: 'Loaner request router is working!' }));
router.get('/cpo-fees', authenticate, (req, res) => res.json(rates));
router.get('/requests', authenticate, currentLoanerUser, loanerReady, handle(async (req, res) => {
  const rows = await store.list(req.auth);
  res.json(rows.map(row => presentLoaner(row, req.auth)));
}));
router.post('/request', authenticate, currentLoanerUser, loanerReady, handle(async (req, res) => {
  const row = await service.submit(req.body, req.auth);
  res.status(200).json({ message: 'Loaner request saved for admin approval', id: row.id, state: row.state });
}));
router.post('/requests/:id/approve', authenticate, currentLoanerUser, requireAdmin, loanerReady, handle(async (req, res) => {
  const row = await service.approve(req.params.id, req.body, req.auth);
  res.json(presentLoaner(row, req.auth));
}));
router.post('/requests/:id/retry-email', authenticate, currentLoanerUser, requireAdmin, loanerReady, handle(async (req, res) => {
  const row = await service.retry(req.params.id, req.auth);
  res.json(presentLoaner(row, req.auth));
}));
module.exports = router;

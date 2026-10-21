const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { oldPool } = require('../db');
const { createLoanerRequestStore } = require('../lib/loanerRequestStore');
const { createLoanerRequests } = require('../services/loanerRequests');
const { submitToLoanerFlow } = require('../utils/loanerFlow');
const rates = require('../seed/cpo-fees.json');
const store = createLoanerRequestStore(oldPool);
const service = createLoanerRequests({ store, send: submitToLoanerFlow,
  transportReady: () => Boolean(process.env.LOANER_REQUEST_FLOW_URL && process.env.LOANER_APPROVAL_FLOW_READY === 'true') });
const router = express.Router();
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
router.get('/requests', authenticate, currentLoanerUser, handle(async (req, res) => {
  const rows = await store.list(req.auth);
  res.json(rows.map(({ email_payload, ...row }) => row));
}));
router.post('/request', authenticate, currentLoanerUser, handle(async (req, res) => {
  const row = await service.submit(req.body, req.auth);
  res.status(200).json({ message: 'Loaner request saved for admin approval', id: row.id, state: row.state });
}));
router.post('/requests/:id/approve', authenticate, currentLoanerUser, requireAdmin, handle(async (req, res) => {
  const { email_payload, ...row } = await service.approve(req.params.id, req.body, req.auth);
  res.json(row);
}));
router.post('/requests/:id/retry-email', authenticate, currentLoanerUser, requireAdmin, handle(async (req, res) => {
  const { email_payload, ...row } = await service.retry(req.params.id, req.auth);
  res.json(row);
}));
module.exports = router;

function createLoanerReadiness(pool, enabled = () => process.env.LOANER_WORKFLOW_ENABLED === 'true') {
  return async function loanerReady(req, res, next) {
    if (!enabled()) return res.status(503).json({ message: 'Loaner approvals are not enabled yet. No request or email was submitted.' });
    try {
      // Check every required column without reading customer records or performing DDL.
      await pool.execute('SELECT id, submitted_by, request_json, state, approval_json, email_payload, email_state, created_at FROM loaner_requests LIMIT 0');
      return next();
    } catch (_) {
      return res.status(503).json({ message: 'Loaner approval storage is not ready. No request or email was submitted.' });
    }
  };
}
module.exports = { createLoanerReadiness };

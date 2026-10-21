function createLoanerReadiness(pool, enabled = () => process.env.LOANER_WORKFLOW_ENABLED === 'true') {
  return async function loanerReady(req, res, next) {
    if (!enabled()) return res.status(503).json({ message: 'Loaner approvals are not enabled yet. No request or email was submitted.' });
    try {
      // Check every required column without reading customer records or performing DDL.
      await pool.execute('SELECT id, submitted_by, request_json, state, approval_json, email_payload, email_state, created_at FROM loaner_requests LIMIT 0');
      return next();
    } catch (error) {
      const reasons = {
        ER_NO_SUCH_TABLE: 'The loaner requests table is missing; its migration is required.',
        ER_BAD_FIELD_ERROR: 'The loaner requests table has incompatible columns.',
        ER_TABLEACCESS_DENIED_ERROR: 'The database account cannot read the loaner requests table.',
        ER_COLUMNACCESS_DENIED_ERROR: 'The database account cannot read required loaner columns.',
        ER_ACCESS_DENIED_ERROR: 'Database authentication failed.',
        ER_DBACCESS_DENIED_ERROR: 'The database account cannot access the configured database.'
      };
      const reason = reasons[error.code] || 'The database readiness query failed; check the application logs.';
      // Never expose SQL, connection details, credentials, or raw driver messages.
      const code = /^[A-Z0-9_]{1,60}$/.test(error.code || '') ? error.code : 'UNKNOWN';
      console.error('Loaner storage readiness failed:', code);
      const detail = req.auth?.role === 'Admin' ? ` ${reason} Diagnostic: ${code}.` : '';
      return res.status(503).json({ message: `Loaner approval storage is not ready.${detail} No request or email was submitted.` });
    }
  };
}
module.exports = { createLoanerReadiness };

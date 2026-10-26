// Conditional updates are cross-process decision/send locks. No in-memory locks.
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
// New requests keep immutable organization ownership in their existing JSON.
// Legacy requests are scoped through their verified submitter; unknown owners fail closed.
const scope = "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(l.request_json, '$.organizationId')), CAST(u.organization_id AS CHAR))";
const source = 'loaner_requests l LEFT JOIN users u ON l.submitted_by = CAST(u.id AS CHAR)';
function createLoanerRequestStore(pool) {
  async function get(id) {
    const [rows] = await pool.execute(`SELECT l.*, ${scope} AS organization_id FROM ${source} WHERE l.id = ?`, [id]);
    const row = rows[0];
    return row && { ...row, request_json: decode(row.request_json), approval_json: decode(row.approval_json), email_payload: decode(row.email_payload) };
  }
  async function decide(id, state, decision, payload) {
    const [result] = await pool.execute("UPDATE loaner_requests SET state = ?, approval_json = ?, email_payload = ?, email_state = 'queued' WHERE id = ? AND state = 'pending'", [state, JSON.stringify(decision), JSON.stringify(payload), id]);
    return result.affectedRows === 1;
  }
  return {
    get,
    async submit(id, userId, request) {
      try {
        await pool.execute('INSERT INTO loaner_requests (id, submitted_by, request_json) VALUES (?, ?, ?)', [id, String(userId), JSON.stringify(request)]);
      } catch (error) { if (error.code !== 'ER_DUP_ENTRY') throw error; }
      return get(id);
    },
    async list(user) {
      if (!user.organizationId) return [];
      const [rows] = await pool.execute(`SELECT l.id FROM ${source} WHERE ${scope} = ? ${user.role === 'Admin' ? '' : 'AND l.submitted_by = ?'} ORDER BY CASE WHEN l.state = 'pending' THEN 0 ELSE 1 END, l.created_at DESC LIMIT 100`, user.role === 'Admin' ? [String(user.organizationId)] : [String(user.organizationId), String(user.userId)]);
      return Promise.all(rows.map(row => get(row.id)));
    },
    approve: (id, approval, payload) => decide(id, 'processed', approval, payload),
    decline: (id, decision, payload) => decide(id, 'declined', decision, payload),
    async claimEmail(id, payload) {
      const [result] = await pool.execute("UPDATE loaner_requests SET email_state = 'sending', email_payload = ? WHERE id = ? AND state IN ('processed', 'declined') AND email_state IN ('queued', 'failed')", [JSON.stringify(payload), id]);
      return result.affectedRows === 1;
    },
    async finishEmail(id, state) {
      await pool.execute("UPDATE loaner_requests SET email_state = ? WHERE id = ? AND email_state = 'sending'", [state, id]);
    }
  };
}
module.exports = { createLoanerRequestStore };

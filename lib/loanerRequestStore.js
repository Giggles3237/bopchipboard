// A conditional UPDATE is the cross-process approval/send lock. No in-memory locks.
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
function createLoanerRequestStore(pool) {
  async function get(id) {
    const [rows] = await pool.execute('SELECT * FROM loaner_requests WHERE id = ?', [id]);
    const row = rows[0];
    return row && { ...row, request_json: decode(row.request_json), approval_json: decode(row.approval_json), email_payload: decode(row.email_payload) };
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
      const [rows] = await pool.execute(`SELECT id FROM loaner_requests ${user.role === 'Admin' ? '' : 'WHERE submitted_by = ?'} ORDER BY CASE WHEN state = 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 100`, user.role === 'Admin' ? [] : [String(user.userId)]);
      return Promise.all(rows.map(row => get(row.id)));
    },
    async approve(id, approval, payload) {
      const [result] = await pool.execute("UPDATE loaner_requests SET state = 'processed', approval_json = ?, email_payload = ?, email_state = 'queued' WHERE id = ? AND state = 'pending'", [JSON.stringify(approval), JSON.stringify(payload), id]);
      return result.affectedRows === 1;
    },
    async claimEmail(id) {
      const [result] = await pool.execute("UPDATE loaner_requests SET email_state = 'sending' WHERE id = ? AND state = 'processed' AND email_state = 'queued'", [id]);
      return result.affectedRows === 1;
    },
    async finishEmail(id, state) {
      await pool.execute("UPDATE loaner_requests SET email_state = ? WHERE id = ? AND email_state = 'sending'", [state, id]);
    }
  };
}
module.exports = { createLoanerRequestStore };

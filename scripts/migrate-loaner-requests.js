const fs = require('node:fs');
const path = require('node:path');

const expectedColumns = [
  ['id', 'char(36)', 'NO', null],
  ['submitted_by', 'varchar(100)', 'NO', null],
  ['request_json', 'json', 'NO', null],
  ['state', 'varchar(20)', 'NO', 'pending'],
  ['approval_json', 'json', 'YES', null],
  ['email_payload', 'json', 'YES', null],
  ['email_state', 'varchar(20)', 'NO', 'not_ready'],
  ['created_at', 'datetime(3)', 'NO', 'current_timestamp(3)']
];
function invalid() { const e = new Error('Loaner schema differs from expected migration'); e.code = 'LOANER_SCHEMA_MISMATCH'; throw e; }
async function inspect(pool) {
  const [tables] = await pool.execute("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='loaner_requests'");
  if (!tables.length) return false;
  if (tables.length !== 1 || tables[0].ENGINE !== 'InnoDB') invalid();
  const [columns] = await pool.execute("SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='loaner_requests' ORDER BY ORDINAL_POSITION");
  if (columns.length !== expectedColumns.length) invalid();
  expectedColumns.forEach(([name, type, nullable, value], i) => {
    const c = columns[i];
    const def = c.COLUMN_DEFAULT === null ? null : String(c.COLUMN_DEFAULT).toLowerCase();
    if (c.COLUMN_NAME !== name || c.COLUMN_TYPE.toLowerCase() !== type || c.IS_NULLABLE !== nullable || def !== value || !['', 'DEFAULT_GENERATED'].includes(c.EXTRA || '')) invalid();
  });
  const [indexes] = await pool.execute("SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='loaner_requests' ORDER BY INDEX_NAME, SEQ_IN_INDEX");
  for (const [name, unique, names] of [['PRIMARY', 0, ['id']], ['loaner_queue', 1, ['state', 'created_at']]]) {
    const rows = indexes.filter(r => r.INDEX_NAME === name);
    if (rows.length !== names.length || rows.some((r, i) => Number(r.NON_UNIQUE) !== unique || Number(r.SEQ_IN_INDEX) !== i + 1 || r.COLUMN_NAME !== names[i] || r.SUB_PART !== null)) invalid();
  }
  await pool.execute('SELECT id, submitted_by, request_json, state, approval_json, email_payload, email_state, created_at FROM loaner_requests LIMIT 0');
  return true;
}
async function migrate(pool) {
  if (await inspect(pool)) return 'LOANER_SCHEMA_ALREADY_READY';
  // Execute only this reviewed, single create-only migration. Never repair an existing table.
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/loaner-requests.sql'), 'utf8');
  await pool.execute(sql);
  if (!await inspect(pool)) invalid();
  return 'LOANER_SCHEMA_READY';
}
async function runRelease({ oldPool, newPool }, log = console.log) {
  try { log(await migrate(oldPool)); return 0; }
  catch (e) {
    const code = /^[A-Z0-9_]{1,60}$/.test(e.code || '') ? e.code : 'UNKNOWN';
    log(`LOANER_MIGRATION_FAILED ${code}`);
    return 1;
  } finally { await Promise.allSettled([oldPool.end(), newPool.end()]); }
}
if (require.main === module) {
  // Same oldPool/MYSQL_* target as routes/loaners.js. No HTTP server or email imports.
  const timeout = setTimeout(() => {
    console.error('LOANER_MIGRATION_TIMEOUT_OUTCOME_UNCERTAIN'); process.exit(1);
  }, 60000);
  runRelease(require('../db')).then(code => { process.exitCode = code; clearTimeout(timeout); });
}
module.exports = { migrate, runRelease, expectedColumns };

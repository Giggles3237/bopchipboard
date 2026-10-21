const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { migrate, runRelease, expectedColumns } = require('../scripts/migrate-loaner-requests');
const exactSql = `CREATE TABLE IF NOT EXISTS loaner_requests (
  id CHAR(36) PRIMARY KEY,
  submitted_by VARCHAR(100) NOT NULL,
  request_json JSON NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending',
  approval_json JSON NULL,
  email_payload JSON NULL,
  email_state VARCHAR(20) NOT NULL DEFAULT 'not_ready',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX loaner_queue (state, created_at)
) ENGINE=InnoDB;`;
function setup(options = {}) {
  let exists = options.exists ?? false, closed = false;
  const calls = [];
  const columns = expectedColumns.map(([COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT]) => ({COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA:''}));
  const indexes = [
    {INDEX_NAME:'PRIMARY',NON_UNIQUE:0,SEQ_IN_INDEX:1,COLUMN_NAME:'id',SUB_PART:null},
    {INDEX_NAME:'loaner_queue',NON_UNIQUE:1,SEQ_IN_INDEX:1,COLUMN_NAME:'state',SUB_PART:null},
    {INDEX_NAME:'loaner_queue',NON_UNIQUE:1,SEQ_IN_INDEX:2,COLUMN_NAME:'created_at',SUB_PART:null}
  ];
  options.change?.(columns,indexes);
  const pool = { async execute(sql) {
    calls.push(sql);
    if(options.failure) throw Object.assign(Error('secret password and SQL'),{code:options.failure});
    if(sql.includes('information_schema.TABLES')) return [exists ? [{ENGINE:options.engine || 'InnoDB'}] : []];
    if(sql.includes('information_schema.COLUMNS')) return [columns];
    if(sql.includes('information_schema.STATISTICS')) return [indexes];
    if(sql.startsWith('SELECT id,')) return [[]];
    assert.equal(sql.replace(/^--.*\n/gm,'').trim(),exactSql);
    if(options.createFailure) throw Object.assign(Error('secret credentials'),{code:'ER_TABLEACCESS_DENIED_ERROR'});
    exists=true; return [{}];
  }, async end(){closed=true;} };
  return {pool,calls,closed:()=>closed};
}
test('migration SQL is exactly the reviewed single create-only table statement; release preserves web command',()=>{
  assert.equal(fs.readFileSync(require.resolve('../migrations/loaner-requests.sql'),'utf8').replace(/^--.*\n/gm,'').trim(),exactSql);
  assert.equal(fs.readFileSync(require.resolve('../Procfile'),'utf8'),'web: node server.js\nrelease: node scripts/migrate-loaner-requests.js\n');
});
test('missing table is created once, validated, and repeat release performs no DDL',async()=>{
  const s=setup(); assert.equal(await migrate(s.pool),'LOANER_SCHEMA_READY');
  assert.equal(await migrate(s.pool),'LOANER_SCHEMA_ALREADY_READY');
  assert.equal(s.calls.filter(sql=>!sql.startsWith('SELECT')).length,1);
  assert.ok(s.calls.filter(sql=>sql.startsWith('SELECT') && !sql.includes('information_schema')).every(sql=>sql.endsWith('LIMIT 0')));
});
test('existing incompatible schema is never modified',async()=>{
  for(const options of [
    {engine:'MyISAM'},
    {change:c=>c.pop()},
    {change:c=>c[0].COLUMN_TYPE='varchar(36)'},
    {change:c=>c[3].COLUMN_DEFAULT='processed'},
    {change:c=>c[0].EXTRA='auto_increment'},
    {change:(_,i)=>i.pop()},
    {change:(_,i)=>i[0].NON_UNIQUE=1},
    {change:(_,i)=>i[2].COLUMN_NAME='id'},
    {change:(_,i)=>i[0].SUB_PART=4}
  ]) {
    const s=setup({exists:true,...options}); await assert.rejects(migrate(s.pool),{code:'LOANER_SCHEMA_MISMATCH'});
    assert.ok(s.calls.every(sql=>sql.startsWith('SELECT')));
  }
});
test('release uses oldPool only, closes both pools and sanitizes failures',async()=>{
  for(const options of [{},{failure:'ER_ACCESS_DENIED_ERROR'},{createFailure:true}]) {
    const s=setup(options);let newClosed=false;const logs=[];
    const result=await runRelease({oldPool:s.pool,newPool:{execute:()=>assert.fail('must not query NEWDB'),end:async()=>{newClosed=true;}}},x=>logs.push(x));
    assert.equal(result,options.failure||options.createFailure?1:0);assert.ok(s.closed());assert.ok(newClosed);
    assert.ok(!logs.join('').includes('secret'));assert.ok(!logs.join('').includes('password'));
  }
});

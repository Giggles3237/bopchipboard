const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { oldPool } = require('../db');
const authRouter = require('../routes/auth');
const loanerRouter = require('../routes/loaners');
const { authenticate } = require('../middleware/auth');
const login = authRouter.stack.find(x => x.route?.path === '/login').route.stack[0].handle;
const currentUser = loanerRouter.stack.find(x => x.route?.path === '/request').route.stack[1].handle;
function response() { return { statusCode:200, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
test('actual login token resolves current database identity, role and organization without trusting stale token fields', async () => {
 const originals={query:oldPool.query,execute:oldPool.execute,compare:bcrypt.compare,secret:process.env.JWT_SECRET};
 try {
  process.env.JWT_SECRET='synthetic-loaner-test-secret';
  oldPool.query=async()=>[[{id:12,name:'Synthetic',email:'synthetic@example.com',password:'mock',role:'Admin',organization_id:1}]];
  bcrypt.compare=async()=>true;
  const logged=response();await login({body:{email:'synthetic@example.com',password:'synthetic'}},logged);
  assert.equal(logged.statusCode,200);const req={headers:{authorization:`Bearer ${logged.body.token}`}};let authenticated=false;
  authenticate(req,response(),()=>{authenticated=true;});assert.equal(authenticated,true);assert.equal(req.auth.userId,12);
  oldPool.execute=async(sql,args)=>{assert.deepEqual(args,[12]);return [[{id:12,name:'Synthetic',email:'synthetic@example.com',role:'Salesperson',status:'active',organization_id:2}]];};
  let next=false;await currentUser(req,response(),()=>{next=true;});assert.equal(next,true);assert.equal(req.auth.role,'Salesperson');assert.equal(req.auth.organizationId,2);assert.equal(req.auth.email,'synthetic@example.com');
 } finally {oldPool.query=originals.query;oldPool.execute=originals.execute;bcrypt.compare=originals.compare;if(originals.secret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=originals.secret;}
});
test('missing, inactive and unassigned accounts return distinct failures and never use JWT organization fallback', async()=>{
 const original=oldPool.execute;
 try{
  for(const [row,status,code] of [[null,401,'LOANER_ACCOUNT_NOT_FOUND'],[{id:12,status:'inactive',organization_id:1},403,'LOANER_ACCOUNT_NOT_ACTIVE'],[{id:12,status:null,organization_id:1},403,'LOANER_ACCOUNT_NOT_ACTIVE'],[{id:12,status:'active',organization_id:null},403,'LOANER_ORGANIZATION_REQUIRED']]){
   oldPool.execute=async()=>[row?[row]:[]];const res=response();let next=false;
   await currentUser({auth:{userId:12,role:'Admin',organizationId:1}},res,()=>{next=true;});assert.equal(next,false);assert.equal(res.statusCode,status);assert.equal(res.body.code,code);
  }
 }finally{oldPool.execute=original;}
});
test('invalid and expired tokens cannot reach account resolution',()=>{
 const original=process.env.JWT_SECRET;process.env.JWT_SECRET='synthetic-loaner-test-secret';
 try{for(const token of ['invalid',jwt.sign({userId:12},process.env.JWT_SECRET,{expiresIn:-1})]){let next=false;const res=response();authenticate({headers:{authorization:`Bearer ${token}`}},res,()=>{next=true;});assert.equal(next,false);assert.equal(res.statusCode,401);}}
 finally{if(original===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=original;}
});

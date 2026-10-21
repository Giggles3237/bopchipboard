const test = require('node:test');
const assert = require('node:assert/strict');
const {buildEmailConfig, buildEmailFrom}=require('../utils/getReadyEmail');
const {loanerEmailReadiness,createLoanerEmailSender}=require('../utils/loanerEmailTransport');
const base={LOANER_EMAIL_ENABLED:'true',EMAIL_USER:'existing@example.com',EMAIL_PASSWORD:'test-only-placeholder'};
const payload={requestId:'test-id',emailTo:['loanerdistribution@pandwforeigncars.com','requester@example.com'],emailCc:['advisor@example.com'],emailBcc:['ignored@example.com'],emailSubject:'Approved',emailBody:'Plain',emailHtml:'<p>Approved</p>'};
test('transport retains Get Ready custom host and explicit SMTP/TLS options',()=>{
 const config=buildEmailConfig({...base,EMAIL_HOST:'smtp.example.com',EMAIL_PORT:'465',EMAIL_SECURE:'true',EMAIL_REQUIRE_TLS:'true',EMAIL_TLS_REJECT_UNAUTHORIZED:'true',EMAIL_SERVICE:'gmail'});
 assert.equal(config.host,'smtp.example.com');assert.equal(config.port,465);assert.equal(config.secure,true);assert.equal(config.requireTLS,true);assert.equal(config.tls.rejectUnauthorized,true);assert.equal(config.service,undefined);assert.equal(config.auth.user,base.EMAIL_USER);
});
test('transport retains explicit service and Gmail default behavior',()=>{
 assert.equal(buildEmailConfig(base).service,'gmail');assert.equal(buildEmailConfig({...base,EMAIL_SERVICE:'Outlook365'}).service,'Outlook365');
});
test('sender uses the exact same EMAIL_FROM override or authenticated-user fallback as Get Ready',async()=>{
 for(const override of [undefined,'sender@example.com','"Dealership Mail" <sender@example.com>']) {
  const env={...base,...(override?{EMAIL_FROM:override}:{})};let message,config,closed=false;
  const send=createLoanerEmailSender(c=>{config=c;return {sendMail:async m=>{message=m;return {accepted:[...payload.emailTo,...payload.emailCc],rejected:[]};},close(){closed=true;}};},()=>true,()=>env);
  assert.equal(loanerEmailReadiness(env).ready,true);assert.equal((await send(payload)).ok,true);
  assert.equal(message.from,buildEmailFrom(env));assert.equal(message.from,override||'"Chipboard System" <existing@example.com>');
  assert.equal(config.auth.user,'existing@example.com');assert.deepEqual(message.to,payload.emailTo);assert.deepEqual(message.cc,payload.emailCc);assert.deepEqual(message.bcc,[]);assert.equal(message.text,payload.emailBody);assert.equal(message.html,payload.emailHtml);assert.ok(closed);
 }
});
test('non-mailbox SMTP login works with a valid configured From override',()=>{
 assert.equal(loanerEmailReadiness({...base,EMAIL_USER:'smtp-login',EMAIL_FROM:'sender@example.com'}).ready,true);
});
test('missing credentials, disabled gate and invalid sender fail before constructing a transport',async()=>{
 const cases=[{EMAIL_USER:''},{EMAIL_PASSWORD:''},{LOANER_EMAIL_ENABLED:'false'},{EMAIL_FROM:'not-an-address'},{EMAIL_FROM:'one@example.com,two@example.com'},{EMAIL_FROM:'Team: one@example.com;'},{EMAIL_FROM:'one@example.com\r\nBcc: hidden@example.com'},{EMAIL_USER:'not-an-address'},{EMAIL_FROM:'bad@example.com\0'}];
 for(const changes of cases) {
  const env={...base,...changes};const status=loanerEmailReadiness(env);assert.equal(status.ready,false);assert.ok(!JSON.stringify(status).includes(base.EMAIL_PASSWORD));
  const send=createLoanerEmailSender(()=>assert.fail('must not connect'),()=>true,()=>env);assert.equal((await send(payload)).ok,false);
 }
});

test('confirmed production login is accepted without introducing a From override',()=>{
 const env={...base,EMAIL_USER:'stanley.lasko.ops.bot@gmail.com'};
 assert.equal(loanerEmailReadiness(env).ready,true);
 assert.equal(buildEmailFrom(env),'"Chipboard System" <stanley.lasko.ops.bot@gmail.com>');
 assert.equal(env.EMAIL_FROM,undefined);
});

test('partial acceptance including rejected or unaccepted advisor is not reported successful', async () => {
 for (const result of [{accepted:payload.emailTo,rejected:payload.emailCc},{accepted:payload.emailTo,rejected:[]}]) {
  const send=createLoanerEmailSender(()=>({sendMail:async()=>result,close(){}}),()=>true,()=>base);
  assert.equal((await send(payload)).ok,false);
 }
});

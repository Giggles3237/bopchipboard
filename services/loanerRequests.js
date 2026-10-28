const rates = require('../seed/cpo-fees.json');
const { buildLoanerApprovalEmail, buildLoanerRecipientPolicy } = require('../utils/loanerRequestEmail');
const { isDeepStrictEqual } = require('node:util');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
function approvalSnapshot(input, user, feeChart = rates, request = {}) {
  // Use the stored request, never a caller-supplied sold flag.
  if (request.soldUnit === 'No') return {
    approvalType: 'hold', pulledStockNumber: null, replacementStockNumber: null,
    cpo: { enabled: false, cost: 0, currency: 'USD', termMonths: null, model: null, version: null },
    approvedBy: String(user.userId), approverName: user.name || '', approverEmail: user.email || '',
    approvedAt: new Date().toISOString()
  };
  const replacementStockNumber = text(input.replacementStockNumber, 'Replacement stock number', 50);
  const pulledStockNumber = text(input.pulledStockNumber, 'Pulled vehicle stock number', 50);
  if (replacementStockNumber.toUpperCase() === pulledStockNumber.toUpperCase()) fail(400, 'Pulled and replacement vehicles must differ.');
  if (typeof input.cpo !== 'boolean') fail(400, 'Choose whether the pulled vehicle will be CPO.');
  let cpo = { enabled: false, cost: 0, currency: 'USD', termMonths: null, model: null, version: feeChart.version };
  if (input.cpo) {
    if (input.make !== 'BMW') fail(400, 'This chart only covers BMW. MINI and other makes require a verified fee chart.');
    const level = feeChart.levels.find(item => item.models.includes(input.cpoModel));
    if (!level) fail(400, 'Confirm a BMW fee-chart model/category; do not infer M from M Sport, M340i or M40i.');
    if (Number(input.cpoCost) !== level.cost || input.cpoCost === null || input.cpoCost === '') fail(400, 'CPO cost must match the 60-month base fee.');
    cpo = { enabled: true, cost: level.cost, currency: feeChart.currency, termMonths: 60, model: input.cpoModel, level: level.level, version: feeChart.version };
  }
  return { pulledStockNumber, replacementStockNumber, cpo, approvedBy: String(user.userId), approverName: user.name || '', approverEmail: user.email || '', approvedAt: new Date().toISOString() };
}
function buildApprovedPayload(id, request, approval) {
  const email = buildLoanerApprovalEmail(id, request, approval);
  return { ...request, requestId: id, approval, approvalStatus: 'approved',
    emailSubject: email.subject, emailBody: email.body, emailHtml: email.html,
    emailIsHtml: true, emailTo: email.to, emailCc: email.cc, emailBcc: email.bcc };
}
function createLoanerRequests({ store, send, transportReady, feeChart = rates }) {
  async function dispatch(id) {
    // Preflight failures are safe to retry. Once claimed, never automatically retry:
    // HTTP failures/timeouts and process crashes may occur after delivery.
    if (!transportReady()) return store.get(id);
    const queued = await store.get(id);
    if (!queued || queued.email_state !== 'queued') return queued;
    const recipients = buildLoanerRecipientPolicy(queued.request_json.respondersEmail, queued.request_json.clientAdvisorEmail);
    // Apply the current recipient policy only while atomically claiming an unattempted email.
    // Preserve the approved body, fee snapshot, and all attempted/sent history.
    const payload = { ...queued.email_payload, emailTo: recipients.to, emailCc: recipients.cc, emailBcc: [], recipientPolicy: 'requester-and-advisor-v2' };
    if (!await store.claimEmail(id, payload)) return store.get(id);
    const row = await store.get(id);
    let result;
    try { result = await send(row.email_payload); }
    catch (_) { result = { ok: false }; }
    await store.finishEmail(id, result?.ok ? 'accepted' : 'uncertain');
    return store.get(id);
  }
  return {
    async submit(input, user) {
      const id = text(input.requestId, 'Request ID');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) fail(400, 'A UUID request ID is required.');
      const request = {
        stockNumber: text(input.stockNumber || input.saleStockNumber, 'Request stock number', 50),
        clientName: text(input.clientName || input.customerName, 'Client name'),
        soldUnit: input.soldUnit,
        additionalInformation: text(input.additionalInformation || input.notes, 'Notes', 4000),
        clientAdvisorEmail: text(input.clientAdvisorEmail || input.advisorEmail, 'Advisor email'),
        respondersEmail: text(user.email, 'Authenticated submitter email')
      };
      buildLoanerRecipientPolicy(request.respondersEmail, request.clientAdvisorEmail);
      if (!['Yes', 'No'].includes(request.soldUnit)) fail(400, 'Sold unit must be Yes or No.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.clientAdvisorEmail)) fail(400, 'Invalid advisor email.');
      const row = await store.submit(id, user.userId, request);
      if (row.submitted_by !== String(user.userId) || !isDeepStrictEqual(row.request_json, request)) fail(409, 'Request ID is already used for different details.');
      return row;
    },
    async approve(id, input, user) {
      if (user.role !== 'Admin') fail(403, 'Admin access required');
      const row = await store.get(id);
      if (!row) fail(404, 'Request not found');
      if (row.state !== 'pending') fail(409, 'Request already processed.');
      const approval = approvalSnapshot(input, user, feeChart, row.request_json);
      if (!await store.approve(id, approval, buildApprovedPayload(id, { ...row.request_json, submittedAt: row.created_at }, approval))) fail(409, 'Another admin already processed this request.');
      return dispatch(id);
    },
    async retry(id, user) {
      if (user.role !== 'Admin') fail(403, 'Admin access required');
      const row = await store.get(id);
      if (!row) fail(404, 'Request not found');
      if (row.email_state !== 'queued') fail(409, 'Only unsent queued email can be retried. Sending/uncertain delivery requires transport reconciliation.');
      return dispatch(id);
    }
  };
}
module.exports = { createLoanerRequests, approvalSnapshot, buildApprovedPayload };

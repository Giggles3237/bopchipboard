import React, { useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config';

const freshApproval = { pulledStockNumber: '', replacementStockNumber: '', cpo: '', make: '', cpoModel: '', cpoCost: '' };
function ApprovalForm({ row, rates, onApprove, busy }) {
  const [value, setValue] = useState(freshApproval);
  const change = e => setValue({ ...value, [e.target.name]: e.target.value });
  const selectModel = e => {
    const cpoModel = e.target.value;
    const level = rates.levels.find(item => item.models.includes(cpoModel));
    setValue({ ...value, cpoModel, cpoCost: level?.cost ?? '' });
  };
  if (row.request_json.soldUnit === 'No') return <form onSubmit={e => { e.preventDefault(); onApprove(row.id, {}); }}>
    <p>Approve a hold for {row.request_json.stockNumber}. Replacement and CPO details are not required.</p>
    <button disabled={busy}>Approve hold</button>
  </form>;
  return <form onSubmit={e => { e.preventDefault(); onApprove(row.id, { ...value, cpo: value.cpo === 'yes' }); }}>
    <p>The original stock is from the request/sale. Explicitly identify the vehicle being pulled and its replacement.</p>
    <label>Pulled vehicle stock number <input required name="pulledStockNumber" value={value.pulledStockNumber} onChange={change} maxLength={50} /></label>{' '}
    <label>Replacement stock number <input required name="replacementStockNumber" value={value.replacementStockNumber} onChange={change} maxLength={50} /></label>{' '}
    <label>CPO the pulled vehicle? <select required name="cpo" value={value.cpo} onChange={change}><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option></select></label>
    {value.cpo === 'yes' && <div>
      <label>Pulled vehicle make <select required name="make" value={value.make} onChange={change}><option value="">Choose</option><option>BMW</option><option>MINI</option><option>Other</option></select></label>
      {value.make && value.make !== 'BMW' && <p role="alert">No verified fee chart is available for this make. Approval with CPO is blocked.</p>}
      <label>Confirmed BMW fee-chart model/category <select required value={value.cpoModel} onChange={selectModel}><option value="">Confirm category</option>{rates.levels.flatMap(level => level.models.map(model => <option key={model} value={model}>{model === 'M' ? 'M (full BMW M; not M Performance / M Sport)' : model} — ${level.cost}</option>))}</select></label>
      <p>Confirm the actual model before choosing. M Sport packages, M340i and M40i do not establish the full M category. If uncertain, leave pending.</p>
      <label>CPO cost (60 months / unlimited miles, base fee only) <input aria-label="CPO cost" readOnly value={value.cpoCost} /></label>
    </div>}
    {value.cpo === 'no' && <p>CPO cost: $0 — not applicable.</p>}
    <button disabled={busy || (value.cpo === 'yes' && value.make !== 'BMW')}>Approve request</button>
  </form>;
}
export default function LoanerRequests() {
  const { auth } = useContext(AuthContext);
  const [rows, setRows] = useState([]);
  const [rates, setRates] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const sendInFlight = useRef(false);
  const [form, setForm] = useState({ stockNumber: '', clientName: '', soldUnit: 'Yes', additionalInformation: '', clientAdvisorEmail: auth?.user?.email || '' });
  const requestId = useRef(null);
  // Persist the exact attempted payload so response loss/page reload can be retried safely.
  const storageKey = `loaner-request-draft:${auth?.user?.userId || auth?.user?.id || auth?.user?.email}`;
  const options = { headers: { Authorization: `Bearer ${auth.token}` } };
  const load = async () => {
    const [requests, fees] = await Promise.all([axios.get(`${API_BASE_URL}/loaners/requests`, options), axios.get(`${API_BASE_URL}/loaners/cpo-fees`, options)]);
    setRows(requests.data); setRates(fees.data); setRefreshRequired(false);
  };
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) { try { const draft = JSON.parse(saved); requestId.current = draft.requestId; setForm(draft); } catch (_) { /* retain a fresh form */ } }
    load().catch(e => { setRefreshRequired(true); setError(e.response?.data?.message || 'Unable to load requests.'); });
    // Refresh explicitly after actions; authentication change remounts this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const act = async action => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); } catch (e) { setRefreshRequired(true); setError(e.response?.data?.message || 'Unable to confirm current request state. Refresh before taking another action.'); }
    finally { setBusy(false); }
  };
  const sendQueued = async id => {
    if (sendInFlight.current || refreshRequired) return;
    sendInFlight.current = true; setBusy(true); setError(''); setNotice('Checking and sending the queued email…'); setRefreshRequired(true);
    try {
      const { data: row } = await axios.post(`${API_BASE_URL}/loaners/requests/${id}/retry-email`, {}, options);
      setRows(previous => previous.map(item => item.id === row.id ? row : item));
      if (row.email_state === 'accepted') setNotice('Email accepted by the mail server. Mailbox delivery is not confirmed.');
      else if (row.email_state === 'queued') setNotice(row.emailReadiness?.ready === false ? `No email attempted. ${row.emailReadiness.message}` : 'Email remains queued. Refresh to confirm its current state before sending.');
      else setNotice('Email outcome needs reconciliation. Do not resend or resubmit this request.');
      try { await load(); }
      catch (_) { setRefreshRequired(true); setError('The action returned, but refreshing failed. Refresh successfully before taking another send action.'); }
    } catch (e) {
      setNotice('');
      setError(`${e.response?.data?.message || 'No reliable send response was received.'} Refresh to check the saved email state. Do not resubmit or resend an uncertain email.`);
      // Keep sending disabled until an explicit successful read; never replay the POST.
    } finally { sendInFlight.current = false; setBusy(false); }
  };
  const submit = e => {
    e.preventDefault();
    act(async () => {
      const payload = { ...form, requestId: requestId.current || crypto.randomUUID() };
      requestId.current = payload.requestId;
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
      await axios.post(`${API_BASE_URL}/loaners/request`, payload, options);
      requestId.current = null; sessionStorage.removeItem(storageKey);
      setForm({ stockNumber: '', clientName: '', soldUnit: 'Yes', additionalInformation: '', clientAdvisorEmail: auth?.user?.email || '' });
      setNotice('Request saved for admin approval.');
    });
  };
  const admin = auth?.user?.role === 'Admin';
  return <main className="container py-4"><h1>Loaner requests</h1>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <h2>Submit a request</h2><form onSubmit={submit}>
      {[['stockNumber', 'Request / sale stock number'], ['clientName', 'Client name'], ['clientAdvisorEmail', 'Client advisor email']].map(([name, label]) => <label key={name} className="d-block">{label}<input required name={name} type={name.includes('Email') ? 'email' : 'text'} value={form[name]} onChange={e => setForm({ ...form, [name]: e.target.value })} /></label>)}
      <label className="d-block">Sold unit? <select value={form.soldUnit} onChange={e => setForm({ ...form, soldUnit: e.target.value })}><option>Yes</option><option>No</option></select></label>
      <label className="d-block">Additional notes <textarea required maxLength={4000} value={form.additionalInformation} onChange={e => setForm({ ...form, additionalInformation: e.target.value })} /></label>
      <button disabled={busy}>Submit for approval</button>
    </form>
    <h2>{admin ? 'Approval queue' : 'Your requests'}</h2><button disabled={busy} onClick={() => act(load)}>Refresh</button>
    {!rows.length && <p>No requests.</p>}
    {rows.map(row => <section key={row.id} className="border rounded p-3 my-3">
      <h3>{row.request_json.stockNumber} — {row.request_json.clientName}</h3>
      <p>{row.request_json.additionalInformation}</p><p>Advisor: {row.request_json.clientAdvisorEmail}; submitted by: {row.request_json.respondersEmail}; sold: {row.request_json.soldUnit}</p>
      <p>Request: {row.state}; email: {row.email_state}</p>
      {row.approval_json?.approvalType === 'hold' && <p>Hold approved by {row.approval_json.approverName || row.approval_json.approvedBy} at {row.approval_json.approvedAt}.</p>}
      {row.approval_json && row.approval_json.approvalType !== 'hold' && <p>Pulled: {row.approval_json.pulledStockNumber}; replacement: {row.approval_json.replacementStockNumber}; CPO: {row.approval_json.cpo.enabled ? 'Yes' : 'No'}; cost: ${row.approval_json.cpo.cost}. Approved by {row.approval_json.approverName || row.approval_json.approvedBy} at {row.approval_json.approvedAt}.</p>}
      {row.email_state === 'accepted' && <p>Email transport accepted this request; mailbox delivery has not been independently verified.</p>}
      {['sending', 'uncertain'].includes(row.email_state) && <p>Email delivery needs transport reconciliation. Do not resubmit this request or resend the email.</p>}
      {row.email_state === 'queued' && <p>Approved and saved; no send attempt has been claimed.</p>}
      {admin && row.email_state === 'queued' && row.emailReadiness && <p role={row.emailReadiness.ready ? 'status' : 'alert'}>{row.emailReadiness.message}</p>}
      {admin && row.state === 'pending' && rates && <ApprovalForm row={row} rates={rates} busy={busy} onApprove={(id, payload) => act(async () => { await axios.post(`${API_BASE_URL}/loaners/requests/${id}/approve`, payload, options); setNotice('Approval saved. Check email status below.'); })} />}
      {admin && row.email_state === 'queued' && <button disabled={busy || refreshRequired || row.emailReadiness?.ready === false} onClick={() => sendQueued(row.id)}>{busy ? 'Working…' : 'Send queued email'}</button>}
    </section>)}
  </main>;
}

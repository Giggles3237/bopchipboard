import React, { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import LoanerRequests, { ApprovalForm } from './LoanerRequests';
jest.mock('axios');
const fees = { levels: [{ level: 2, cost: 1200, models: ['X3'] }] };
const pending = { id: 'request-1', state: 'pending', email_state: 'not_ready', request_json: { stockNumber: 'SALE1', clientName: 'Buyer', additionalInformation: 'Details', clientAdvisorEmail: 'advisor@example.com', respondersEmail: 'advisor@example.com', soldUnit: 'Yes' } };
function mount(role) {
  return render(<AuthContext.Provider value={{ auth: { token: 'test', user: { id: 1, role, email: 'advisor@example.com' } } }}><LoanerRequests /></AuthContext.Provider>);
}
beforeEach(() => {
  sessionStorage.clear(); jest.clearAllMocks();
  axios.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('cpo-fees') ? fees : [pending] }));
  axios.post.mockResolvedValue({ data: {} });
});
test('every user can submit, but non-admin cannot see approval controls', async () => {
  mount('Salesperson'); await screen.findByText('SALE1 — Buyer');
  expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Approve request' })).not.toBeInTheDocument();
});
test('admin confirms pulled and replacement stocks and base cost before approval', async () => {
  mount('Admin'); await screen.findByRole('button', { name: 'Approve request' });
  fireEvent.change(screen.getByLabelText('Pulled vehicle stock number'), { target: { value: 'PULL1' } });
  fireEvent.change(screen.getByLabelText('Replacement stock number'), { target: { value: 'NEW1' } });
  fireEvent.change(screen.getByLabelText('CPO the pulled vehicle?'), { target: { value: 'yes' } });
  fireEvent.change(screen.getByLabelText('Pulled vehicle make'), { target: { value: 'BMW' } });
  fireEvent.change(screen.getByLabelText('Confirmed BMW fee-chart model/category'), { target: { value: 'X3' } });
  expect(screen.getByLabelText('CPO cost')).toHaveValue('1200');
  fireEvent.click(screen.getByRole('button', { name: 'Approve request' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/request-1/approve'), expect.objectContaining({ pulledStockNumber: 'PULL1', replacementStockNumber: 'NEW1', cpo: true, cpoCost: 1200 }), expect.any(Object)));
});
test('MINI CPO cannot be approved using BMW rates', async () => {
  mount('Admin'); await screen.findByRole('button', { name: 'Approve request' });
  fireEvent.change(screen.getByLabelText('CPO the pulled vehicle?'), { target: { value: 'yes' } });
  fireEvent.change(screen.getByLabelText('Pulled vehicle make'), { target: { value: 'MINI' } });
  expect(screen.getByRole('button', { name: 'Approve request' })).toBeDisabled();
});
test('uncertain delivery displays reconciliation instruction without resend control', async () => {
  axios.get.mockImplementation(url => Promise.resolve({ data: url.endsWith('cpo-fees') ? fees : [{ ...pending, state: 'processed', email_state: 'uncertain' }] }));
  mount('Admin'); await screen.findByText(/Email delivery needs transport reconciliation/);
  expect(screen.queryByRole('button', { name: 'Send queued email' })).not.toBeInTheDocument();
});

test('response loss retries the same submission ID instead of creating a second request', async () => {
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => '11111111-1111-4111-8111-111111111111' } });
  axios.post.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce({ data: {} });
  mount('Salesperson'); await screen.findByText('SALE1 — Buyer');
  fireEvent.change(screen.getByLabelText('Request / sale stock number'), { target: { value: 'SALE2' } });
  fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Buyer2' } });
  fireEvent.change(screen.getByLabelText('Additional notes'), { target: { value: 'Need pull' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
  expect(axios.post.mock.calls[0][1].requestId).toBe(axios.post.mock.calls[1][1].requestId);
  expect(axios.post.mock.calls[1][1].stockNumber).toBe('SALE2');
});

const queued = { ...pending, state: 'processed', email_state: 'queued' };
function queueResponse(row=queued) {
  axios.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('cpo-fees')?fees:[row]}));
}
test.each(['SENDER_MISMATCH','PASSWORD_MISSING'])('admin sees %s on read without attempting send',async code=>{
  queueResponse({...queued,emailReadiness:{ready:false,code,message:`Correct ${code} in backend settings.`}});
  mount('Admin');await screen.findByText(`Correct ${code} in backend settings.`);
  expect(screen.getByRole('button',{name:'Send queued email'})).toBeDisabled();expect(axios.post).not.toHaveBeenCalled();
});
test('unchanged queued response explains preflight failure instead of silently succeeding',async()=>{
  queueResponse();mount('Admin');await screen.findByRole('button',{name:'Send queued email'});
  const blocked={...queued,emailReadiness:{ready:false,code:'PASSWORD_MISSING',message:'Restore existing SMTP credential privately.'}};
  axios.post.mockImplementation(async()=>{queueResponse(blocked);return {data:blocked};});
  fireEvent.click(screen.getByRole('button',{name:'Send queued email'}));
  await screen.findByText('No email attempted. Restore existing SMTP credential privately.');
  expect(axios.post).toHaveBeenCalledTimes(1);
});
test.each(['accepted','uncertain'])('send displays %s outcome and removes retry control',async state=>{
  queueResponse();mount('Admin');await screen.findByRole('button',{name:'Send queued email'});
  const updated={...queued,email_state:state};axios.post.mockImplementation(async()=>{queueResponse(updated);return {data:updated};});
  fireEvent.click(screen.getByRole('button',{name:'Send queued email'}));
  await screen.findByText(state==='accepted'?'Email accepted by the mail server. Mailbox delivery is not confirmed.':'Email outcome needs reconciliation. Do not resend or resubmit this request.');
  expect(screen.queryByRole('button',{name:'Send queued email'})).not.toBeInTheDocument();
});
test('lost POST response requires explicit successful refresh and never repeats send',async()=>{
  queueResponse();mount('Admin');await screen.findByRole('button',{name:'Send queued email'});
  axios.post.mockRejectedValue(new Error('network lost'));
  fireEvent.click(screen.getByRole('button',{name:'Send queued email'}));
  await screen.findByText(/No reliable send response/);
  expect(screen.getByRole('button',{name:'Send queued email'})).toBeDisabled();
  queueResponse({...queued,email_state:'uncertain'});fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
  await screen.findByText('Request: processed; email: uncertain');
  expect(axios.post).toHaveBeenCalledTimes(1);expect(screen.queryByRole('button',{name:'Send queued email'})).not.toBeInTheDocument();
});
test('accepted response stays visible if subsequent fetch fails; no resend offered',async()=>{
  queueResponse();mount('Admin');await screen.findByRole('button',{name:'Send queued email'});
  axios.post.mockImplementation(async()=>{axios.get.mockRejectedValue(new Error('fetch failed'));return {data:{...queued,email_state:'accepted'}};});
  fireEvent.click(screen.getByRole('button',{name:'Send queued email'}));
  await screen.findByText(/The action returned, but refreshing failed/);
  expect(screen.getByText('Request: processed; email: accepted')).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Send queued email'})).not.toBeInTheDocument();expect(axios.post).toHaveBeenCalledTimes(1);
});

test('Hold approval omits all movement and CPO fields and sends an empty payload', async () => {
  const hold={...pending,request_json:{...pending.request_json,soldUnit:'No'}};
  axios.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('cpo-fees')?fees:[hold]}));
  mount('Admin');await screen.findByRole('button',{name:'Approve hold'});
  expect(screen.queryByLabelText('Pulled vehicle stock number')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Replacement stock number')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('CPO the pulled vehicle?')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Approve hold'}));
  await waitFor(()=>expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/approve'),{},expect.any(Object)));
});
test('switching Hold and sold approval preserves draft values and restores required answers', () => {
  const onApprove=jest.fn();
  const view=render(<ApprovalForm row={pending} rates={fees} onApprove={onApprove} busy={false}/>);
  fireEvent.change(screen.getByLabelText('Replacement stock number'),{target:{value:'REPLACE123'}});
  view.rerender(<ApprovalForm row={{...pending,request_json:{...pending.request_json,soldUnit:'No'}}} rates={fees} onApprove={onApprove} busy={false}/>);
  expect(screen.queryByLabelText('Replacement stock number')).not.toBeInTheDocument();
  view.rerender(<ApprovalForm row={pending} rates={fees} onApprove={onApprove} busy={false}/>);
  expect(screen.getByLabelText('Replacement stock number')).toHaveValue('REPLACE123');
  expect(screen.getByLabelText('Replacement stock number')).toBeRequired();
  expect(screen.getByLabelText('CPO the pulled vehicle?')).toBeRequired();
  expect(screen.getByLabelText('CPO the pulled vehicle?')).toHaveValue('');
  fireEvent.submit(screen.getByRole('form',{name:'Approve loaner request'}));
  expect(onApprove.mock.calls[0][1].cpo).toBeUndefined();
});
test('existing Hold submission draft can switch to sold without losing typed details', async () => {
  sessionStorage.setItem('loaner-request-draft:1',JSON.stringify({...pending.request_json,requestId:'11111111-1111-4111-8111-111111111111',soldUnit:'No'}));
  mount('Salesperson');await screen.findByText('SALE1 — Buyer');
  expect(screen.getByLabelText('Sold unit?')).toHaveValue('No');
  fireEvent.change(screen.getByLabelText('Sold unit?'),{target:{value:'Yes'}});
  expect(screen.getByLabelText('Request / sale stock number')).toHaveValue('SALE1');
  fireEvent.click(screen.getByRole('button',{name:'Submit for approval'}));
  await waitFor(()=>expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/request'),expect.objectContaining({soldUnit:'Yes',stockNumber:'SALE1'}),expect.any(Object)));
});
test('admin decline has optional reason, separate confirmation and duplicate click protection', async () => {
  let resolvePost;axios.post.mockImplementation(()=>new Promise(resolve=>{resolvePost=resolve;}));
  mount('Admin');await screen.findByRole('button',{name:'Decline request'});
  fireEvent.click(screen.getByRole('button',{name:'Decline request'}));
  expect(screen.getByLabelText('Decline reason (optional, shared with requestor)')).not.toBeRequired();
  const button=screen.getByRole('button',{name:'Confirm decline'});
  fireEvent.click(button);fireEvent.click(button);
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/decline'),{reason:''},expect.any(Object));
  await act(async()=>resolvePost({data:{}}));
});
test('non-admin requestor sees declined history and reason without decision controls', async () => {
  axios.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('cpo-fees')?fees:[{...pending,state:'declined',email_state:'accepted',approval_json:{reason:'No available replacement',declinerName:'Admin',declinedAt:'2026-10-26'}}]}));
  mount('Salesperson');await screen.findByText(/Reason: No available replacement/);
  expect(screen.queryByRole('button',{name:'Decline request'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Approve request'})).not.toBeInTheDocument();
});
test('failed decline notification shows durable outcome and retry action', async () => {
  axios.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('cpo-fees')?fees:[{...pending,state:'declined',email_state:'failed',approval_json:{reason:''},emailReadiness:{ready:true,message:'Configured'}}]}));
  axios.post.mockResolvedValue({data:{...pending,state:'declined',email_state:'accepted'}});
  mount('Admin');await screen.findByRole('button',{name:'Retry notification'});
  expect(screen.getByText(/Decision saved. Email was not sent/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Retry notification'}));
  await waitFor(()=>expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('/retry-email'),{},expect.any(Object)));
});
test('approval validation error preserves inputs and blocks decisions until refreshed', async () => {
  axios.post.mockRejectedValue({response:{data:{message:'Choose whether the pulled vehicle will be CPO.'}}});
  mount('Admin');await screen.findByRole('button',{name:'Approve request'});
  fireEvent.change(screen.getByLabelText('Pulled vehicle stock number'),{target:{value:'PULL123'}});
  fireEvent.submit(screen.getByRole('form',{name:'Approve loaner request'}));
  await screen.findByText('Choose whether the pulled vehicle will be CPO.');
  expect(screen.getByLabelText('Pulled vehicle stock number')).toHaveValue('PULL123');
  expect(screen.getByRole('button',{name:'Decline request'})).toBeDisabled();
});

 test.each([
  { requestType: 'hold', pulledStockNumber: null, replacementStockNumber: null, cpo: null },
  { approvalType: 'hold', pulledStockNumber: null, replacementStockNumber: null, cpo: { enabled: false, cost: 0 } },
 ])('Hold history accepts both contract variants as N/A without inventing No or zero fees', async approval => {
  axios.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('cpo-fees')?fees:[{...pending,state:'processed',approval_json:approval}]}));
  mount('Admin');await screen.findByText(/Hold approved. Vehicle movement, replacement and CPO: Not applicable/);
  expect(screen.queryByText(/CPO: No\b|cost: \$0/)).not.toBeInTheDocument();
 });
 test('Decline history without any CPO fields renders safely beside canonical Hold history', async () => {
  const rows=[{...pending,state:'declined',approval_json:{outcome:'declined',reason:'Unavailable'}},{...pending,id:'hold-2',state:'processed',approval_json:{requestType:'hold',cpo:null}}];
  axios.get.mockImplementation(url=>Promise.resolve({data:url.endsWith('cpo-fees')?fees:rows}));
  mount('Admin');await screen.findByText(/Reason: Unavailable/);
  expect(screen.getByText(/Hold approved/)).toBeInTheDocument();
 });

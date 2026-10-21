import React, { act } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import LoanerRequests from './LoanerRequests';
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
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Approve request' })); });
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
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' })); });
  await screen.findByRole('alert');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit for approval' })); });
  expect(axios.post.mock.calls[0][1].requestId).toBe(axios.post.mock.calls[1][1].requestId);
  expect(axios.post.mock.calls[1][1].stockNumber).toBe('SALE2');
});

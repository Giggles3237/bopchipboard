import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import EditSaleForm from './EditSaleForm';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('./ScheduleButton', () => () => null);
jest.mock('react-datepicker', () => props => <input id={props.id} aria-label={props.name}
  value={props.selected && !Number.isNaN(props.selected.getTime())
    ? `${props.selected.getFullYear()}-${String(props.selected.getMonth() + 1).padStart(2, '0')}-${String(props.selected.getDate()).padStart(2, '0')}` : ''}
  onChange={event => {
    const [year, month, day] = event.target.value.split('-').map(Number);
    props.onChange(event.target.value ? new Date(year, month - 1, day) : null);
  }} />);

const auth = { token: 'test-token', user: { name: 'Manager', role: 'Manager', email: 'manager@example.com' } };
const sale = { id: 1, clientName: 'Test Customer', stockNumber: 'PB4329A', year: 2026,
  make: 'BMW', model: 'X5', color: 'Blue', advisor: 'Manager', delivered: false,
  deliveryDate: '2099-11-06', type: 'Used BMW' };

beforeEach(() => {
  axios.get.mockResolvedValue({ data: [{ id: 1, name: 'Manager', role: 'Manager' }] });
  axios.post.mockResolvedValue({ status: 200, data: { recipients: [] } });
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

async function open(inventoryOnly = false) {
  render(<AuthContext.Provider value={{ auth }}><EditSaleForm sale={sale}
    inventoryOnly={inventoryOnly} onSubmit={jest.fn()} onCancel={jest.fn()} /></AuthContext.Provider>);
  await waitFor(() => expect(axios.get).toHaveBeenCalled());
  if (!inventoryOnly) fireEvent.click(screen.getByRole('button', { name: 'Get Ready', exact: true }));
}

test.each([false, true])('selected date remains unambiguous through form submission (inventory=%s)', async inventoryOnly => {
  await open(inventoryOnly);
  // Simulate a day-first browser locale that caused November 5 to be read as May 11.
  jest.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('05/11/2099');
  fireEvent.change(screen.getByLabelText('getReadyDate'), { target: { value: '2099-11-05' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Get Ready Email' }));
  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  expect(axios.post.mock.calls[0][1]).toMatchObject({
    getReadyDate: '2099-11-05', promiseTime: '14:00', dueBy: '11/05/2099 at 14:00', soldUnit: !inventoryOnly
  });
});

test('cleared date sends no request', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('getReadyDate'), { target: { value: '' } });
  expect(screen.getByLabelText('getReadyDate')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Send Get Ready Email' }));
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('valid Get Ready date')));
  expect(axios.post).not.toHaveBeenCalled();
});

test('manual date survives delivery-date changes, hiding and reopening', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('getReadyDate'), { target: { value: '2099-05-11' } });
  fireEvent.change(screen.getByLabelText('Delivery Date:'), { target: { value: '2099-12-20' } });
  expect(screen.getByLabelText('getReadyDate')).toHaveValue('2099-05-11');
  fireEvent.click(screen.getByRole('button', { name: 'Get Ready', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Get Ready', exact: true }));
  expect(screen.getByLabelText('getReadyDate')).toHaveValue('2099-05-11');
  expect(axios.post).not.toHaveBeenCalled();
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../contexts/AuthContext';
import EditSaleForm from './EditSaleForm';
import ViewToggleBar from './ViewToggleBar';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('./ScheduleButton', () => () => null);

const auth = { token: 'test-token', user: { name: 'Manager', role: 'Manager', email: 'manager@example.com' } };
const unit = { clientName: 'Inventory Unit', stockNumber: 'PB1234', year: 2026, make: 'BMW', model: 'X5', color: 'Blue', chassis: '', advisor: 'Manager', delivered: false, deliveryDate: '2099-10-14', type: '' };

beforeEach(() => {
  axios.get.mockResolvedValue({ data: [{ id: 1, name: 'Manager', role: 'Manager' }] });
  axios.post.mockResolvedValue({ status: 200, data: { recipients: ['test@example.com'] } });
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

test('inventory uses the expanded sale Get Ready flow and sends no sale', async () => {
  const saveSale = jest.fn();
  const close = jest.fn();
  render(<AuthContext.Provider value={{ auth }}><EditSaleForm sale={unit} inventoryOnly onSubmit={saveSale} onCancel={close} /></AuthContext.Provider>);
  await waitFor(() => expect(screen.getByLabelText('Advisor:').value).toBe('Manager'));
  expect(screen.queryByLabelText('Client Name:')).toBeNull();
  expect(screen.queryByLabelText('Delivery Date:')).toBeNull();
  expect(screen.queryByText('Save Changes')).toBeNull();
  fireEvent.change(screen.getByLabelText('Get Ready Date:'), { target: { value: '2099-10-14' } });
  fireEvent.click(screen.getByLabelText('Fuel'));
  fireEvent.click(screen.getByText('Send Get Ready Email'));
  await waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
  expect(axios.post.mock.calls[0][0]).toMatch(/getready\/send-email$/);
  expect(axios.post.mock.calls[0][1]).toMatchObject({ soldUnit: false, getReadyId: 'PB1234', customerName: 'Inventory Unit', itemsNeeded: ['Fuel'] });
  expect(saveSale).not.toHaveBeenCalled();
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

test.each(['Admin', 'Manager', 'Salesperson', 'Genius'])('Get Ready Only visibility for %s', (role) => {
  render(<MemoryRouter><AuthContext.Provider value={{ auth: { ...auth, user: { ...auth.user, role } } }}><ViewToggleBar /></AuthContext.Provider></MemoryRouter>);
  const button = screen.queryByRole('link', { name: 'Get Ready Only' });
  if (['Admin', 'Manager'].includes(role)) expect(button.getAttribute('href')).toBe('/get-ready');
  else expect(button).toBeNull();
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GetReadyAcknowledgment, { getReadyDateWarning, useGetReadyAcknowledgment } from './GetReadyAcknowledgment';

test('checks the promised time, Sundays, and both conditions together', () => {
  const now = new Date(2026, 9, 14, 12, 0);
  expect(getReadyDateWarning(new Date(2026, 9, 14), '11:59', now)).toMatch(/in the past/);
  expect(getReadyDateWarning(new Date(2026, 9, 14), '12:01', now)).toBe('');
  expect(getReadyDateWarning(new Date(2026, 9, 18), '14:00', now)).toMatch(/on a Sunday/);
  expect(getReadyDateWarning(new Date(2026, 9, 11), '14:00', now)).toMatch(/in the past and on a Sunday/);
});

function Form({ date, time, send }) {
  const acknowledgment = useGetReadyAcknowledgment(date, time);
  return <>
    <GetReadyAcknowledgment acknowledgment={acknowledgment} id="understood" />
    <button onClick={() => { if (acknowledgment.canSend()) send(); }}>Send</button>
  </>;
}

test('requires a separate acknowledgment and resets it when the due time changes', () => {
  const send = jest.fn();
  const date = new Date(2020, 0, 1);
  const { rerender } = render(<Form date={date} time="14:00" send={send} />);
  fireEvent.click(screen.getByText('Send'));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Send'));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('I understand'));
  rerender(<Form date={date} time="15:00" send={send} />);
  fireEvent.click(screen.getByText('Send'));
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('I understand'));
  fireEvent.click(screen.getByText('Send'));
  expect(send).toHaveBeenCalledTimes(1);
});

test('future weekdays send immediately', () => {
  const send = jest.fn();
  render(<Form date={new Date(2099, 9, 14)} time="14:00" send={send} />);
  fireEvent.click(screen.getByText('Send'));
  expect(send).toHaveBeenCalledTimes(1);
});

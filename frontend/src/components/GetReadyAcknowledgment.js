import React, { useEffect, useState } from 'react';

export function getReadyDateWarning(date, time, now = new Date()) {
  if (!date) return '';
  const due = date instanceof Date ? new Date(date) : new Date(`${String(date).split('T')[0]}T00:00:00`);
  const [hours, minutes] = (time || '14:00').split(':').map(Number);
  due.setHours(hours, minutes, 0, 0);
  const reasons = [];
  if (due < now) reasons.push('in the past');
  if (due.getDay() === 0) reasons.push('on a Sunday');
  return reasons.length ? `This Get Ready is due ${reasons.join(' and ')}.` : '';
}

export function useGetReadyAcknowledgment(date, time) {
  const [warning, setWarning] = useState('');
  const [understood, setUnderstood] = useState(false);
  useEffect(() => {
    setWarning('');
    setUnderstood(false);
  }, [date, time]);

  const canSend = () => {
    const currentWarning = getReadyDateWarning(date, time);
    if (currentWarning && (currentWarning !== warning || !understood)) {
      setWarning(currentWarning);
      setUnderstood(false);
      return false;
    }
    setWarning('');
    setUnderstood(false);
    return true;
  };

  return { warning, understood, setUnderstood, canSend };
}

export default function GetReadyAcknowledgment({ acknowledgment, id }) {
  if (!acknowledgment.warning) return null;
  return (
    <div className="get-ready-date-warning" role="alert">
      <p>{acknowledgment.warning} Please acknowledge this before sending.</p>
      <div className="instruction-item">
        <input id={id} type="checkbox" checked={acknowledgment.understood}
          onChange={(event) => acknowledgment.setUnderstood(event.target.checked)} />
        <label htmlFor={id}>I understand</label>
      </div>
    </div>
  );
}

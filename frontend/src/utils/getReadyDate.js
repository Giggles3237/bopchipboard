// A Get Ready date is a local calendar day, not a UTC timestamp or locale string.
export function buildGetReadyDateFields(value, time = '14:00') {
  let year, month, day;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    year = value.getFullYear();
    month = value.getMonth() + 1;
    day = value.getDate();
  } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    [year, month, day] = value.split('-').map(Number);
  } else {
    throw new Error('Please select a valid Get Ready date.');
  }

  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  if (year < 1 || year > 9999 || check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error('Please select a valid Get Ready date.');
  }
  const promiseTime = time || '14:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(promiseTime)) {
    throw new Error('Please select a valid Get Ready promise time.');
  }
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return {
    getReadyDate: `${yyyy}-${mm}-${dd}`,
    promiseTime,
    // Deterministic legacy display for older backend versions and integrations.
    dueBy: `${mm}/${dd}/${yyyy} at ${promiseTime}`
  };
}

export function previousCalendarDay(date) {
  const previous = new Date(date.getTime());
  // Calendar arithmetic also works when a DST day is 23 or 25 hours long.
  previous.setDate(previous.getDate() - 1);
  return previous;
}

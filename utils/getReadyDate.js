// Date-only values are calendar dates, not instants. Never parse localized
// display text when the structured date and time are available.
function normalizeGetReadyDate({ getReadyDate, promiseTime, dueBy } = {}) {
  if (getReadyDate === undefined && promiseTime === undefined) {
    return { dueBy };
  }

  const invalid = () => {
    const error = new Error('getReadyDate must be a valid YYYY-MM-DD calendar date and promiseTime must be HH:mm (00:00–23:59).');
    error.statusCode = 400;
    return error;
  };
  if (typeof getReadyDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(getReadyDate) ||
      typeof promiseTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(promiseTime)) {
    throw invalid();
  }
  const [year, month, day] = getReadyDate.split('-').map(Number);
  const date = new Date(`${getReadyDate}T00:00:00.000Z`);
  if (year < 1 || Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw invalid();
  }

  return {
    getReadyDate,
    promiseTime,
    dueBy: `${getReadyDate.slice(5, 7)}/${getReadyDate.slice(8, 10)}/${getReadyDate.slice(0, 4)} at ${promiseTime}`
  };
}

function buildDueDate(data) {
  const normalized = normalizeGetReadyDate(data);
  if (normalized.getReadyDate) {
    // Preserve the integration's existing server-local time conversion. No
    // timezone is supplied by this API, so do not reinterpret it as UTC.
    return new Date(`${normalized.getReadyDate}T${normalized.promiseTime}:00`).toISOString();
  }
  if (normalized.dueBy) {
    const fallback = new Date(String(normalized.dueBy).replace(' at ', ' '));
    if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();
  }
  return null;
}

module.exports = { normalizeGetReadyDate, buildDueDate };

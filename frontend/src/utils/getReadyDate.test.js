import { buildGetReadyDateFields, previousCalendarDay } from './getReadyDate';

afterEach(() => jest.restoreAllMocks());

test.each(['en-US', 'en-GB', 'en-NZ'])('calendar dates do not depend on %s display formatting', locale => {
  const original = Date.prototype.toLocaleDateString;
  const display = jest.spyOn(Date.prototype, 'toLocaleDateString')
    .mockImplementation(function () { return original.call(this, locale); });
  for (const [month, day, canonical, dueBy] of [
    [10, 5, '2026-11-05', '11/05/2026 at 14:30'],
    [4, 11, '2026-05-11', '05/11/2026 at 14:30'],
    [10, 4, '2026-11-04', '11/04/2026 at 14:30'],
    [3, 11, '2026-04-11', '04/11/2026 at 14:30']
  ]) {
    expect(buildGetReadyDateFields(new Date(2026, month, day), '14:30'))
      .toEqual({ getReadyDate: canonical, promiseTime: '14:30', dueBy });
  }
  expect(display).not.toHaveBeenCalled();
});

test.each(['2028-02-29', '2027-01-01', '2026-12-31'])('date-only string %s keeps its day', value => {
  expect(buildGetReadyDateFields(value).getReadyDate).toBe(value);
});

test.each([null, undefined, '', new Date(NaN), '2026-02-29', '2026-11-31', '2026-13-01', '05/11/2026'])('rejects invalid date %s', value => {
  expect(() => buildGetReadyDateFields(value)).toThrow('valid Get Ready date');
});

test.each(['24:00', '14:60', '2:00 PM', '9:00'])('rejects invalid time %s', time => {
  expect(() => buildGetReadyDateFields('2026-11-05', time)).toThrow('valid Get Ready promise time');
});

test('previous day uses calendar arithmetic across DST, month and year boundaries', () => {
  for (const [date, expected] of [
    [new Date(2026, 2, 9), '2026-03-08'],
    [new Date(2026, 10, 2), '2026-11-01'],
    [new Date(2027, 0, 1), '2026-12-31'],
    [new Date(2028, 2, 1), '2028-02-29']
  ]) {
    expect(buildGetReadyDateFields(previousCalendarDay(date)).getReadyDate).toBe(expected);
    expect(previousCalendarDay(date).getHours()).toBe(0);
  }
});

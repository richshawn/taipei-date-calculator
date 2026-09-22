export const DAY_MS = 86400000;

export function parseISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(date, amount) {
  return new Date(date.getTime() + amount * DAY_MS);
}

export function calendarDiff(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function weekdayIndex(date) {
  return date.getUTCDay();
}

export function isWeekend(date) {
  const d = weekdayIndex(date);
  return d === 0 || d === 6;
}

export function getDayMeta(date, calendarData = {}) {
  const key = isoDate(date);
  const day = calendarData.days?.[key] || {};
  const weekend = isWeekend(date);
  const governmentHoliday = Boolean(day.governmentHoliday);
  const marketClosed = Boolean(day.marketClosed);
  return {
    key,
    weekend,
    governmentHoliday,
    marketClosed,
    governmentName: day.governmentName || '',
    marketName: day.marketName || '',
    isWorkday: !(weekend || governmentHoliday || marketClosed),
    source: day.source || '',
  };
}

export function addWorkdays(start, days, calendarData, includeStart = false) {
  if (!Number.isInteger(days) || days < 0) throw new Error('工作日天數必須為 0 以上整數');
  if (days === 0) return new Date(start);

  let cursor = new Date(start);
  let count = 0;

  if (includeStart && getDayMeta(cursor, calendarData).isWorkday) {
    count = 1;
    if (count === days) return cursor;
  }

  while (count < days) {
    cursor = addCalendarDays(cursor, 1);
    if (getDayMeta(cursor, calendarData).isWorkday) count += 1;
    if (count > 100000) throw new Error('計算範圍過大');
  }
  return cursor;
}

export function addCalendarCount(start, days, includeStart = false) {
  if (!Number.isInteger(days) || days < 0) throw new Error('日曆日天數必須為 0 以上整數');
  if (days === 0) return new Date(start);
  return addCalendarDays(start, includeStart ? days - 1 : days);
}

export function countRange(start, end, calendarData, includeStart = false) {
  const diff = calendarDiff(start, end);
  if (diff < 0) throw new Error('到期日不可早於起算日');

  const calendarDays = includeStart ? diff + 1 : diff;
  let workdays = 0;
  let cursor = includeStart ? new Date(start) : addCalendarDays(start, 1);

  while (cursor <= end) {
    if (getDayMeta(cursor, calendarData).isWorkday) workdays += 1;
    cursor = addCalendarDays(cursor, 1);
  }
  return { calendarDays, workdays };
}

export function eventsOn(date, eventsData = {}) {
  const key = isoDate(date);
  return (eventsData.events || []).filter((event) => event.date === key);
}

export function eventsBetween(start, end, eventsData = {}) {
  return (eventsData.events || [])
    .filter((event) => {
      const date = parseISODate(event.date);
      return date && date >= start && date <= end;
    })
    .sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));
}

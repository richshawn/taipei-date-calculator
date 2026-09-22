import {
  parseISODate, isoDate, addWorkdays, addCalendarCount, countRange,
  getDayMeta, eventsOn, eventsBetween
} from './calendar-core.js';

const $ = (id) => document.getElementById(id);
const els = {
  tabAdd: $('tabAdd'), tabRange: $('tabRange'), addMode: $('addMode'), rangeMode: $('rangeMode'),
  startDateAdd: $('startDateAdd'), daysInput: $('daysInput'), startDateRange: $('startDateRange'), endDateRange: $('endDateRange'),
  ruleToggle: $('ruleToggle'), ruleHelp: $('ruleHelp'), calculateBtn: $('calculateBtn'), results: $('results'),
  resultGrid: $('resultGrid'), dateContext: $('dateContext'), errorBox: $('errorBox'), eventList: $('eventList'),
  dataStatus: $('dataStatus'), eventCoverage: $('eventCoverage'), lastUpdated: $('lastUpdated'), taipeiTime: $('taipeiTime')
};

let mode = 'add';
let rule = 'exclude';
let calendarData = { days: {}, coverage: [] };
let eventsData = { events: [], coverage: {} };

const weekdayFmt = new Intl.DateTimeFormat('zh-TW', { weekday: 'long', timeZone: 'UTC' });
const dateFmt = new Intl.DateTimeFormat('zh-TW', { year:'numeric', month:'2-digit', day:'2-digit', timeZone:'UTC' });
const taipeiClockFmt = new Intl.DateTimeFormat('zh-TW', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Taipei' });
const taipeiTodayFmt = new Intl.DateTimeFormat('en-CA', { year:'numeric', month:'2-digit', day:'2-digit', timeZone:'Asia/Taipei' });

function todayTaipeiISO() {
  const parts = taipeiTodayFmt.formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDaysISO(value, n) {
  const d = parseISODate(value);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

function initDefaults() {
  const today = todayTaipeiISO();
  els.startDateAdd.value = today;
  els.startDateRange.value = today;
  els.endDateRange.value = addDaysISO(today, 10);
}

async function loadJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('data load failed:', url, err);
    return fallback;
  }
}

async function loadData() {
  [calendarData, eventsData] = await Promise.all([
    loadJson('./data/taiwan-calendar.json', calendarData),
    loadJson('./data/international-events.json', eventsData)
  ]);
  const years = calendarData.coverage?.join('、') || '未標示';
  els.dataStatus.textContent = `台灣行事曆已載入｜涵蓋 ${years}`;
  const ec = eventsData.coverage || {};
  els.eventCoverage.textContent = ec.start && ec.end ? `${ec.start} → ${ec.end}` : '本週資料';
  const updated = [calendarData.updatedAt, eventsData.updatedAt].filter(Boolean).sort().pop();
  els.lastUpdated.textContent = `資料時間：${updated ? updated.replace('T', ' ').replace('Z',' UTC') : '—'}`;
}

function switchMode(next) {
  mode = next;
  const add = mode === 'add';
  els.addMode.classList.toggle('hidden', !add);
  els.rangeMode.classList.toggle('hidden', add);
  els.tabAdd.classList.toggle('active', add);
  els.tabRange.classList.toggle('active', !add);
  els.tabAdd.setAttribute('aria-selected', String(add));
  els.tabRange.setAttribute('aria-selected', String(!add));
  updateRuleText();
}

function updateRuleText() {
  const include = rule === 'include';
  if (mode === 'add') {
    els.ruleHelp.textContent = include
      ? '含起算日：若起算日本身符合該類型，起算日就是第 1 天。'
      : '不含起算日：起算日不列入第 1 天；往後第 N 天為答案。';
  } else {
    els.ruleHelp.textContent = include
      ? '含起算日：起日與訖日都納入天數。'
      : '不含起算日：計算起日之後至訖日，訖日仍計入。';
  }
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.classList.remove('hidden');
  els.results.classList.add('hidden');
}
function clearError() { els.errorBox.classList.add('hidden'); }

function flag(country) {
  return country === 'US' ? '🇺🇸' : country === 'JP' ? '🇯🇵' : country === 'CN' ? '🇨🇳' : '🌐';
}
function countryName(country) {
  return country === 'US' ? '美國' : country === 'JP' ? '日本' : country === 'CN' ? '中國' : country;
}

function metaBadges(date) {
  const meta = getDayMeta(date, calendarData);
  const badges = [];
  if (meta.isWorkday) badges.push('<span class="badge work">工作日</span>');
  if (meta.weekend) badges.push('<span class="badge closed">例假日</span>');
  if (meta.governmentHoliday) badges.push(`<span class="badge closed">${escapeHtml(meta.governmentName || '國定／政府放假')}</span>`);
  if (meta.marketClosed) badges.push(`<span class="badge market">台股休市${meta.marketName ? ` · ${escapeHtml(meta.marketName)}` : ''}</span>`);
  return badges.join('');
}

function contextCard(title, date) {
  const exactEvents = eventsOn(date, eventsData);
  return `<div class="context-card">
    <div class="context-head"><strong>${escapeHtml(title)} · ${dateFmt.format(date)}</strong><span class="coverage">${weekdayFmt.format(date)}</span></div>
    <div class="badges">${metaBadges(date)}</div>
    ${exactEvents.length ? `<div class="badges"><span class="badge market">⚑ ${exactEvents.length} 項國際事件</span></div>` : ''}
  </div>`;
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function resultDateCard(type, date) {
  const work = type === 'work';
  return `<article class="result-card ${work ? 'work' : 'calendar'}">
    <div class="result-label"><i></i>${work ? '工作日答案' : '日曆日答案'}</div>
    <div class="result-date">${dateFmt.format(date)}</div>
    <div class="result-value">${date.getUTCMonth()+1}/${date.getUTCDate()}</div>
    <div class="result-weekday">${weekdayFmt.format(date)}</div>
    <div class="result-note">${work ? '已排除週末、政府放假與台股無交易日' : '連續日曆日，不排除任何休假日'}</div>
  </article>`;
}

function resultCountCard(type, count) {
  const work = type === 'work';
  return `<article class="result-card ${work ? 'work' : 'calendar'}">
    <div class="result-label"><i></i>${work ? '工作日' : '日曆日'}</div>
    <div class="result-value">${count}</div>
    <div class="result-date">天</div>
    <div class="result-note">${work ? '週末、政府放假、台股休市均不計' : '所有日期均計入'}</div>
  </article>`;
}

function inCalendarCoverage(date) {
  const y = String(date.getUTCFullYear());
  return calendarData.coverage?.map(String).includes(y);
}

function renderEvents(events, deadlineISO = null) {
  if (!events.length) {
    els.eventList.innerHTML = '<p class="empty">答案日期沒有比對到美・日・中高重要度事件。若資料來源尚未公布遠期行程，之後的自動更新會補入。</p>';
    return;
  }
  els.eventList.innerHTML = events.slice(0, 12).map(event => {
    const isDeadline = deadlineISO && event.date === deadlineISO;
    const critical = Number(event.importance || 0) >= 3;
    const meta = [event.actual ? `今值 ${event.actual}${event.unit || ''}` : '', event.forecast ? `預期 ${event.forecast}${event.unit || ''}` : '', event.previous ? `前值 ${event.previous}${event.unit || ''}` : ''].filter(Boolean).join(' · ');
    return `<article class="event-item ${isDeadline ? 'deadline' : critical ? 'critical' : ''}">
      <div class="event-top"><span class="event-country">${flag(event.country)} ${countryName(event.country)}</span><span class="event-time">${escapeHtml(event.date)} ${escapeHtml(event.time || '時間待定')}</span></div>
      <div class="event-title">${escapeHtml(event.title)}</div>
      ${meta ? `<div class="event-meta">${escapeHtml(meta)}</div>` : ''}
      ${isDeadline ? '<span class="event-tag">到期日事件提醒</span>' : ''}
    </article>`;
  }).join('');
}

function calculate() {
  clearError();
  const includeStart = rule === 'include';
  try {
    if (mode === 'add') {
      const start = parseISODate(els.startDateAdd.value);
      const days = Number(els.daysInput.value);
      if (!start) throw new Error('請輸入有效的起算日期');
      if (!Number.isInteger(days) || days < 0) throw new Error('天數請輸入 0 以上整數');

      const workTarget = addWorkdays(start, days, calendarData, includeStart);
      const calTarget = addCalendarCount(start, days, includeStart);
      els.resultGrid.innerHTML = resultDateCard('work', workTarget) + resultDateCard('calendar', calTarget);
      els.dateContext.innerHTML = contextCard('工作日答案', workTarget) + (isoDate(workTarget) !== isoDate(calTarget) ? contextCard('日曆日答案', calTarget) : '');

      const dateMap = new Map();
      [...eventsOn(workTarget, eventsData), ...eventsOn(calTarget, eventsData)].forEach(e => dateMap.set(`${e.date}-${e.id || e.title}`, e));
      renderEvents([...dateMap.values()].sort((a,b) => `${a.date}${a.time||''}`.localeCompare(`${b.date}${b.time||''}`)));

      if (!inCalendarCoverage(workTarget)) {
        els.dataStatus.textContent = '⚠ 工作日答案超出台灣官方資料覆蓋年度，休假日判斷可能不完整';
      }
    } else {
      const start = parseISODate(els.startDateRange.value);
      const end = parseISODate(els.endDateRange.value);
      if (!start || !end) throw new Error('請輸入有效的起訖日期');
      const counts = countRange(start, end, calendarData, includeStart);
      els.resultGrid.innerHTML = resultCountCard('work', counts.workdays) + resultCountCard('calendar', counts.calendarDays);
      els.dateContext.innerHTML = contextCard('到期日', end);

      const rangeEvents = eventsBetween(start, end, eventsData);
      renderEvents(rangeEvents, isoDate(end));

      if (!inCalendarCoverage(start) || !inCalendarCoverage(end)) {
        els.dataStatus.textContent = '⚠ 起訖日期超出台灣官方資料覆蓋年度，工作日結果可能不完整';
      }
    }
    els.results.classList.remove('hidden');
  } catch (err) {
    showError(err.message || '計算失敗，請檢查輸入');
  }
}

els.tabAdd.addEventListener('click', () => switchMode('add'));
els.tabRange.addEventListener('click', () => switchMode('range'));
els.ruleToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-rule]');
  if (!btn) return;
  rule = btn.dataset.rule;
  [...els.ruleToggle.querySelectorAll('button')].forEach(b => b.classList.toggle('active', b === btn));
  updateRuleText();
});
els.calculateBtn.addEventListener('click', calculate);
['startDateAdd','daysInput','startDateRange','endDateRange'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') calculate(); }));

function tickClock() { els.taipeiTime.textContent = taipeiClockFmt.format(new Date()); }
setInterval(tickClock, 30000); tickClock();
initDefaults();
await loadData();
calculate();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
}

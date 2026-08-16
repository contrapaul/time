/* The year at a glance. Choose the term's dates, paint out the days you are
   not in, and set which weeks are week 1. */

import {
  mondayOf, addDays, parseISO, weekIndexOf, weekCount,
  defaultWeekTypes, flipWeekFrom, DAYS_PER_WEEK,
} from './model.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MODES = [
  ['off', 'Off'],
  ['am', 'Morning only'],
  ['pm', 'Afternoon only'],
  ['clear', 'Back to normal'],
];

export function createYearView(host, { draft, onChange }) {
  let mode = 'off';
  let painting = false;

  host.classList.add('yv');
  host.innerHTML = `
    <div class="yv-dates">
      <label class="yv-datefield"><span class="dlg-q">First day?</span>
        <input type="date" name="start" class="dlg-input" value="${draft.startDate}"></label>
      <label class="yv-datefield"><span class="dlg-q">Last day?</span>
        <input type="date" name="end" class="dlg-input" value="${draft.endDate}"></label>
    </div>
    <div class="yv-tools">
      <div class="yv-modes">
        ${MODES.map(([m, label]) => `
          <button type="button" class="btn btn-sm${m === mode ? ' is-on' : ''}" data-mode="${m}">${label}</button>
        `).join('')}
      </div>
    </div>
    <div class="yv-weeks"></div>
  `;

  const weeksEl = host.querySelector('.yv-weeks');
  const startInput = host.querySelector('[name="start"]');
  const endInput = host.querySelector('[name="end"]');

  function ensureWeekTypes() {
    if (draft.rotationWeeks === 1) { draft.calendar.weekTypes = []; return; }
    const want = weekCount(draft);
    const have = draft.calendar.weekTypes;
    if (!have || have.length !== want) {
      const base = defaultWeekTypes(draft);
      // Keep whatever the user already chose, extend or trim the rest.
      draft.calendar.weekTypes = base.map((v, i) => (have && have[i]) || v);
    }
  }

  function renderWeeks() {
    if (!draft.startDate || !draft.endDate || draft.endDate < draft.startDate) {
      weeksEl.innerHTML = '<p class="yv-hint">Pick a first and last day.</p>';
      return;
    }
    ensureWeekTypes();

    const weeks = weekCount(draft);
    const first = mondayOf(draft.startDate);
    let lastMonth = null;
    const out = [];

    for (let w = 0; w < weeks; w++) {
      const monday = addDays(first, w * 7);
      const month = parseISO(monday).getMonth();
      if (month !== lastMonth) {
        out.push(`<div class="yv-month">${MONTHS[month]} ${parseISO(monday).getFullYear()}</div>`);
        lastMonth = month;
      }

      const toggle = draft.rotationWeeks === 2
        ? `<button type="button" class="yv-wk" data-week="${w}">W${draft.calendar.weekTypes[w]}</button>`
        : '<span class="yv-wk is-static"></span>';

      const days = [];
      for (let d = 0; d < DAYS_PER_WEEK; d++) {
        const iso = addDays(monday, d);
        const outside = iso < draft.startDate || iso > draft.endDate;
        const state = draft.calendar.dayStates[iso];
        days.push(`
          <button type="button" class="yv-day${outside ? ' is-outside' : ''}${state ? ` is-${state}` : ''}${d >= 5 ? ' is-weekend' : ''}"
                  data-iso="${iso}" ${outside ? 'disabled' : ''}>
            <span class="yv-dnum">${parseISO(iso).getDate()}</span>
          </button>`);
      }
      out.push(`<div class="yv-week">${toggle}<div class="yv-days">${days.join('')}</div></div>`);
    }
    weeksEl.innerHTML = out.join('');
  }

  function apply(iso) {
    if (!iso) return;
    if (mode === 'clear') delete draft.calendar.dayStates[iso];
    else draft.calendar.dayStates[iso] = mode;
    const btn = weeksEl.querySelector(`[data-iso="${iso}"]`);
    if (btn) {
      btn.classList.remove('is-off', 'is-am', 'is-pm');
      if (mode !== 'clear') btn.classList.add(`is-${mode}`);
    }
    onChange?.();
  }

  host.addEventListener('click', (e) => {
    const modeBtn = e.target.closest('[data-mode]');
    if (modeBtn) {
      mode = modeBtn.dataset.mode;
      host.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('is-on', b === modeBtn));
      return;
    }
    const wk = e.target.closest('[data-week]');
    if (wk) {
      const i = Number(wk.dataset.week);
      const next = draft.calendar.weekTypes[i] === 1 ? 2 : 1;
      draft.calendar.weekTypes = flipWeekFrom(draft.calendar.weekTypes, i, next);
      renderWeeks();
      onChange?.();
    }
  });

  // Click, or click and sweep, the way the auditorium planner paints seats.
  weeksEl.addEventListener('pointerdown', (e) => {
    const day = e.target.closest('.yv-day:not([disabled])');
    if (!day) return;
    painting = true;
    apply(day.dataset.iso);
    weeksEl.setPointerCapture(e.pointerId);
  });
  weeksEl.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const day = el?.closest('.yv-day:not([disabled])');
    if (day) apply(day.dataset.iso);
  });
  const stop = () => { painting = false; };
  weeksEl.addEventListener('pointerup', stop);
  weeksEl.addEventListener('pointercancel', stop);

  const onDates = () => {
    draft.startDate = startInput.value;
    draft.endDate = endInput.value;
    // Anything painted outside the new range is no longer meaningful.
    for (const iso of Object.keys(draft.calendar.dayStates)) {
      if (iso < draft.startDate || iso > draft.endDate) delete draft.calendar.dayStates[iso];
    }
    renderWeeks();
    onChange?.();
  };
  startInput.addEventListener('change', onDates);
  endInput.addEventListener('change', onDates);

  renderWeeks();
  return { render: renderWeeks };
}


/* The period list editor, shared by wizard step 2 and the after-the-fact
   editor reached from the timetable.

   Rows re-sort themselves by start time, but only once a time is committed.
   Sorting on every keystroke would yank the row out from under the cursor
   halfway through typing "14:30". */

import { minutesOf, hhmmOf, validatePeriods, sortPeriods } from './model.js';
import { escapeHtml } from './palette.js';

export function createPeriodEditor(host, { periods, onChange }) {
  host.classList.add('per');
  host.innerHTML = `
    <div class="per-list"></div>
    <button type="button" class="btn per-add">Add a period</button>
    <p class="wiz-errors" hidden></p>
  `;
  const list = host.querySelector('.per-list');
  const errs = host.querySelector('.wiz-errors');

  const problems = () => {
    const found = validatePeriods(periods);
    errs.hidden = !found.length;
    errs.textContent = found.join(' ');
    return found;
  };

  function draw() {
    list.innerHTML = periods.map((p, i) => `
      <div class="per-row" data-i="${i}">
        <input class="dlg-input per-name" value="${escapeHtml(p.name)}" placeholder="Name" aria-label="Name">
        <input class="dlg-input per-time" type="time" value="${p.start}" data-f="start" aria-label="Starts">
        <input class="dlg-input per-time" type="time" value="${p.end}" data-f="end" aria-label="Ends">
        <span class="per-len">${minutesOf(p.end) - minutesOf(p.start)} min</span>
        <button type="button" class="cell-x per-del" aria-label="Remove ${escapeHtml(p.name)}">&times;</button>
      </div>`).join('');
    problems();
    onChange?.();
  }

  /** Put the list back in time order, keeping focus on the row that moved. */
  function resort() {
    const sorted = sortPeriods(periods);
    const changed = sorted.some((p, i) => p !== periods[i]);
    if (!changed) return false;
    const activeId = document.activeElement?.closest('.per-row')
      ? periods[Number(document.activeElement.closest('.per-row').dataset.i)]?.id
      : null;
    const field = document.activeElement?.dataset?.f
      || (document.activeElement?.classList.contains('per-name') ? 'name' : null);
    periods.length = 0;
    periods.push(...sorted);
    draw();
    if (activeId) {
      const i = periods.findIndex((p) => p.id === activeId);
      const row = list.querySelector(`.per-row[data-i="${i}"]`);
      const el = field === 'name' ? row?.querySelector('.per-name') : row?.querySelector(`[data-f="${field}"]`);
      el?.focus();
    }
    return true;
  }

  host.querySelector('.per-add').addEventListener('click', () => {
    const last = periods[periods.length - 1];
    const start = last ? last.end : '09:00';
    periods.push({
      id: crypto.randomUUID().slice(0, 8),
      name: `Period ${periods.length + 1}`,
      start,
      end: hhmmOf(Math.min(23 * 60 + 59, minutesOf(start) + 60)),
    });
    draw();
  });

  list.addEventListener('input', (e) => {
    const row = e.target.closest('.per-row');
    const p = periods[Number(row.dataset.i)];
    if (e.target.classList.contains('per-name')) p.name = e.target.value;
    else p[e.target.dataset.f] = e.target.value;
    row.querySelector('.per-len').textContent = `${minutesOf(p.end) - minutesOf(p.start)} min`;
    problems();
    onChange?.();
  });

  // `change` fires once a time is committed, which is when reordering is safe.
  list.addEventListener('change', (e) => {
    if (!e.target.classList.contains('per-time')) return;
    if (!resort()) problems();
  });

  list.addEventListener('click', (e) => {
    if (!e.target.closest('.per-del')) return;
    periods.splice(Number(e.target.closest('.per-row').dataset.i), 1);
    draw();
  });

  draw();
  return { draw, problems };
}

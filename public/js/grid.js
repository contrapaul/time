/* The rotation grid: days across, periods down.
   Shared by wizard step 3 and, later, the pattern editor. Both write to the
   same `pattern` object, which is why "main view edits are date-only" costs
   almost nothing to honour.

   Rows here are uniform rather than proportional. This is the assignment
   surface, not the reading surface: a ten-minute slot has to be clickable. */

import { minutesOf, slotKey, parseSlotKey, DAYS_PER_WEEK, WEEKDAYS } from './model.js';
import { readableOn, escapeHtml } from './palette.js';
import { askAboutSlot } from './dialog.js';
import { enableDragCopy } from './dragcopy.js';

/** Which period rows an entry covers, given where it is anchored. */
export function coveredIndices(periods, entry, anchorIdx) {
  const s = minutesOf(entry.start || periods[anchorIdx].start);
  const e = minutesOf(entry.end || periods[anchorIdx].end);
  const out = [];
  periods.forEach((p, i) => {
    if (minutesOf(p.start) < e && minutesOf(p.end) > s) out.push(i);
  });
  return out.length ? out : [anchorIdx];
}

export function createGrid(host, { periods, pattern, rotationWeeks, onChange, tools }) {
  const days = rotationWeeks * DAYS_PER_WEEK;

  host.classList.add('grid');
  host.style.setProperty('--days', days);
  host.style.setProperty('--rows', periods.length);

  /* Clearing the whole grid is a big enough action to be worth asking about,
     but not big enough for a dialog. The button asks itself. */
  if (tools) {
    tools.innerHTML = '<button type="button" class="btn btn-sm grid-clear">Clear all</button>';
    const clear = tools.querySelector('.grid-clear');
    let armed = false;
    let disarm = null;
    clear.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        clear.textContent = 'Clear all? Click again';
        clear.classList.add('is-armed');
        disarm = setTimeout(() => {
          armed = false;
          clear.textContent = 'Clear all';
          clear.classList.remove('is-armed');
        }, 3000);
        return;
      }
      clearTimeout(disarm);
      armed = false;
      clear.textContent = 'Clear all';
      clear.classList.remove('is-armed');
      for (const key of Object.keys(pattern)) delete pattern[key];
      commit();
    });
  }

  function render() {
    const idxOf = new Map(periods.map((p, i) => [p.id, i]));
    host.innerHTML = '';

    host.appendChild(cellEl('grid-corner', 1, 1, ''));
    for (let d = 0; d < days; d++) {
      const badge = rotationWeeks === 2
        ? `<span class="grid-week">W${Math.floor(d / DAYS_PER_WEEK) + 1}</span>` : '';
      const weekend = d % DAYS_PER_WEEK >= 5 ? ' is-weekend' : '';
      host.appendChild(cellEl(`grid-dayhead${weekend}`, d + 2, 1,
        `<span>${WEEKDAYS[d % DAYS_PER_WEEK]}</span>${badge}`));
    }
    periods.forEach((p, i) => {
      host.appendChild(cellEl('grid-periodhead', 1, i + 2,
        `<span class="grid-pname">${escapeHtml(p.name)}</span>
         <span class="grid-ptime">${p.start}</span>`));
    });

    for (let d = 0; d < days; d++) {
      const occupied = new Set();
      // Anchors first, so a span can claim the rows beneath it.
      for (let i = 0; i < periods.length; i++) {
        const key = slotKey(d, periods[i].id);
        const entry = pattern[key];
        if (!entry || occupied.has(i)) continue;
        const covered = coveredIndices(periods, entry, i);
        const span = Math.max(...covered) - i + 1;
        for (const c of covered) if (c !== i) occupied.add(c);
        host.appendChild(filledCell(entry, key, d + 2, i + 2, span, periods, i));
      }
      for (let i = 0; i < periods.length; i++) {
        if (occupied.has(i) || pattern[slotKey(d, periods[i].id)]) continue;
        host.appendChild(emptyCell(slotKey(d, periods[i].id), d + 2, i + 2));
      }
    }
  }

  function cellEl(cls, col, row, html) {
    const el = document.createElement('div');
    el.className = cls;
    el.style.gridColumn = col;
    el.style.gridRow = row;
    el.innerHTML = html;
    return el;
  }

  function filledCell(entry, key, col, row, span, periods, periodIdx) {
    const el = document.createElement('div');
    el.className = 'cell is-filled';
    el.dataset.slot = key;
    el.style.gridColumn = col;
    el.style.gridRow = `${row} / span ${span}`;
    const times = entry.start
      ? `${entry.start}–${entry.end}`
      : `${periods[periodIdx].start}–${periods[periodIdx].end}`;
    el.innerHTML = `
      <article class="cell-entry" style="--c:${entry.color}; --fg:${readableOn(entry.color)}">
        <span class="cell-name">${escapeHtml(entry.name)}</span>
        ${entry.location ? `<span class="cell-loc">${escapeHtml(entry.location)}</span>` : ''}
        ${entry.detail ? `<span class="cell-detail">${escapeHtml(entry.detail)}</span>` : ''}
        <span class="cell-time">${times}</span>
        <button type="button" class="cell-x" data-remove aria-label="Remove ${escapeHtml(entry.name)}">&times;</button>
      </article>`;
    return el;
  }

  function emptyCell(key, col, row) {
    const el = document.createElement('div');
    el.className = 'cell is-empty';
    el.dataset.slot = key;
    el.style.gridColumn = col;
    el.style.gridRow = row;
    el.innerHTML = '<span class="cell-plus" aria-hidden="true">+</span>';
    return el;
  }

  /** Clear anything the incoming entry would sit on top of. */
  function clearCovered(day, periodIdx, entry) {
    for (const c of coveredIndices(periods, entry, periodIdx)) {
      delete pattern[slotKey(day, periods[c].id)];
    }
    // And any earlier span reaching down into this row.
    for (let i = 0; i < periodIdx; i++) {
      const other = pattern[slotKey(day, periods[i].id)];
      if (other && Math.max(...coveredIndices(periods, other, i)) >= periodIdx) {
        delete pattern[slotKey(day, periods[i].id)];
      }
    }
  }

  function place(key, entry, { repeat = false } = {}) {
    const { dayIndex, periodId } = parseSlotKey(key);
    const periodIdx = periods.findIndex((p) => p.id === periodId);
    const targets = repeat ? [...Array(days).keys()] : [dayIndex];
    for (const d of targets) {
      clearCovered(d, periodIdx, entry);
      pattern[slotKey(d, periodId)] = { ...entry, id: crypto.randomUUID() };
    }
    commit();
  }

  function commit() {
    render();
    onChange?.(pattern);
  }

  host.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      delete pattern[removeBtn.closest('.cell').dataset.slot];
      return commit();
    }

    const cell = e.target.closest('.cell');
    if (!cell || host.classList.contains('is-dragging')) return;

    const key = cell.dataset.slot;
    const { periodId } = parseSlotKey(key);
    const periodIdx = periods.findIndex((p) => p.id === periodId);

    const result = await askAboutSlot({
      entry: pattern[key] || null,
      periods,
      periodIndex: periodIdx,
      canRepeat: true,
      repeatLabel: 'Same time every day of the rotation?',
    });
    if (!result) return;
    if (result === 'remove') { delete pattern[key]; return commit(); }
    place(key, result.entry, { repeat: result.repeat });
  });

  enableDragCopy(host, {
    onCopy(from, to) {
      const entry = pattern[from];
      if (!entry) return;
      const { dayIndex, periodId } = parseSlotKey(to);
      const periodIdx = periods.findIndex((p) => p.id === periodId);
      // A copy lands on the new slot's own times unless it was a custom span.
      const copy = { ...entry, id: crypto.randomUUID() };
      if (copy.start) {
        const length = minutesOf(copy.end) - minutesOf(copy.start);
        copy.start = periods[periodIdx].start;
        copy.end = endAfter(periods, periodIdx, length);
      }
      clearCovered(dayIndex, periodIdx, copy);
      pattern[slotKey(dayIndex, periodId)] = copy;
      commit();
    },
  });

  render();
  return { render, pattern };
}

/** Where a run of `length` minutes from a period's start lands. */
function endAfter(periods, periodIdx, length) {
  const start = minutesOf(periods[periodIdx].start);
  let end = periods[periodIdx].end;
  for (let i = periodIdx; i < periods.length; i++) {
    end = periods[i].end;
    if (minutesOf(end) - start >= length) break;
  }
  return end;
}

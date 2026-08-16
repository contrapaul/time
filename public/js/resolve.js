/* The heart. A date in, the events on that date out.
   Pure: no DOM, no storage, no clock. Change it only with tests. */

import {
  minutesOf, weekdayIndex, isWeekend, weekIndexOf,
  parseSlotKey, DEFAULT_CUTOFF,
} from './model.js';

/**
 * Which rotation day a date lands on, or -1 for a weekend.
 * 0-4 in a one-week rotation, 0-9 in a two-week (5-9 being week 2).
 */
export function dayIndexFor(tt, iso) {
  const wd = weekdayIndex(iso);
  if (wd >= 5) return -1;
  if (tt.rotationWeeks === 1) return wd;
  return (weekTypeFor(tt, iso) - 1) * 5 + wd;
}

/** Week 1 or week 2. Always 1 for a one-week rotation. */
export function weekTypeFor(tt, iso) {
  if (tt.rotationWeeks === 1) return 1;
  const types = tt.calendar?.weekTypes;
  if (!types || !types.length) {
    // No explicit array: fall back to plain alternation from the start week.
    return (weekIndexOf(tt.startDate, iso) % 2) + 1;
  }
  return types[weekIndexOf(tt.startDate, iso)] ?? 1;
}

export function inRange(tt, iso) {
  return iso >= tt.startDate && iso <= tt.endDate;
}

function instanceOf(entry, { slotKey = null, periodId = null, start, end }) {
  const s = entry.start || start;
  const e = entry.end || end;
  return {
    id: entry.id,
    slotKey,
    periodId,
    name: entry.name || '',
    location: entry.location || '',
    detail: entry.detail || '',
    color: entry.color || '',
    start: s,
    end: e,
    startMin: minutesOf(s),
    endMin: minutesOf(e),
    fromPattern: slotKey !== null,
  };
}

/**
 * Every event on one date, sorted by start time.
 *
 * Order matters and is tested: the partial-day trim applies to the rotation
 * only, so an event added specifically to a half day survives it.
 */
export function resolveDay(tt, iso) {
  if (!inRange(tt, iso)) return [];
  if (isWeekend(iso)) return [];

  const state = tt.calendar?.dayStates?.[iso];
  if (state === 'off') return [];

  const dayIndex = dayIndexFor(tt, iso);
  const periodById = new Map((tt.periods || []).map((p) => [p.id, p]));

  let out = [];
  for (const [key, entry] of Object.entries(tt.pattern || {})) {
    const { dayIndex: d, periodId } = parseSlotKey(key);
    if (d !== dayIndex) continue;
    const period = periodById.get(periodId);
    if (!period) continue; // period deleted since; drop rather than crash
    out.push(instanceOf(entry, { slotKey: key, periodId, start: period.start, end: period.end }));
  }

  // Partial days trim the rotation, before overrides get their say.
  if (state === 'am' || state === 'pm') {
    const cutoff = minutesOf(tt.partialCutoff || DEFAULT_CUTOFF);
    out = state === 'am'
      ? out.filter((i) => i.endMin <= cutoff)
      : out.filter((i) => i.startMin >= cutoff);
  }

  const ov = tt.overrides?.[iso];
  if (ov) {
    if (ov.removed?.length) {
      const gone = new Set(ov.removed);
      out = out.filter((i) => !gone.has(i.slotKey));
    }
    if (ov.patched) {
      out = out.map((i) => {
        const patch = ov.patched[i.slotKey];
        if (!patch) return i;
        const merged = { ...i, ...patch };
        merged.startMin = minutesOf(merged.start);
        merged.endMin = minutesOf(merged.end);
        return merged;
      });
    }
    for (const added of ov.added || []) {
      out.push(instanceOf(added, { start: added.start, end: added.end }));
    }
  }

  out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  return out;
}

/**
 * The vertical scale every column shares, so days line up.
 * Spans the periods plus any dated event that reaches outside them.
 */
export function dayBounds(tt) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of tt.periods || []) {
    lo = Math.min(lo, minutesOf(p.start));
    hi = Math.max(hi, minutesOf(p.end));
  }
  for (const entry of Object.values(tt.pattern || {})) {
    if (entry.start) lo = Math.min(lo, minutesOf(entry.start));
    if (entry.end) hi = Math.max(hi, minutesOf(entry.end));
  }
  for (const ov of Object.values(tt.overrides || {})) {
    for (const a of ov.added || []) {
      lo = Math.min(lo, minutesOf(a.start));
      hi = Math.max(hi, minutesOf(a.end));
    }
    for (const p of Object.values(ov.patched || {})) {
      if (p.start) lo = Math.min(lo, minutesOf(p.start));
      if (p.end) hi = Math.max(hi, minutesOf(p.end));
    }
  }
  if (!isFinite(lo)) return { startMin: 0, endMin: 0 };
  return { startMin: lo, endMin: hi };
}

/**
 * Lay overlapping events into side-by-side columns.
 * Returns each instance tagged with `col` and `cols`.
 */
export function packOverlaps(instances) {
  const out = [];
  let group = [];
  let groupEnd = -Infinity;

  const flush = () => {
    if (!group.length) return;
    const cols = [];
    for (const item of group) {
      let c = cols.findIndex((endMin) => endMin <= item.startMin);
      if (c === -1) { c = cols.length; cols.push(0); }
      cols[c] = item.endMin;
      item.col = c;
    }
    for (const item of group) item.cols = cols.length;
    out.push(...group);
    group = [];
    groupEnd = -Infinity;
  };

  for (const i of instances) {
    const item = { ...i };
    if (item.startMin >= groupEnd) flush();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  flush();
  return out;
}

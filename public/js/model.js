/* Shape, defaults, and the date arithmetic everything else borrows.
   No DOM, no storage, no clock. */

export const SCHEMA_VERSION = 2;

export const DEFAULT_CUTOFF = '12:00';

/** Rotations run Monday to Sunday. Weekends hold things too. */
export const DAYS_PER_WEEK = 7;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ── Times, as minutes past midnight ─────────────────────────── */

export function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

export function hhmmOf(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ── Dates, as local-midnight ISO strings ────────────────────── */

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Monday 0 through Sunday 6. */
export function weekdayIndex(iso) {
  return (parseISO(iso).getDay() + 6) % 7;
}

export function isWeekend(iso) {
  return weekdayIndex(iso) >= 5;
}

export function mondayOf(iso) {
  return addDays(iso, -weekdayIndex(iso));
}

/** Rounded, so an hour of DST drift between the two dates cannot shift the count. */
export function daysBetween(aISO, bISO) {
  return Math.round((parseISO(bISO) - parseISO(aISO)) / 86400000);
}

/** Which calendar week of the timetable a date falls in. Week 0 contains startDate. */
export function weekIndexOf(startDate, iso) {
  return Math.floor(daysBetween(mondayOf(startDate), iso) / 7);
}

export function eachDate(startISO, endISO) {
  const out = [];
  for (let d = startISO; d <= endISO; d = addDays(d, 1)) out.push(d);
  return out;
}

/* ── Week types ──────────────────────────────────────────────── */

/** How many calendar weeks the timetable spans. */
export function weekCount(tt) {
  return weekIndexOf(tt.startDate, tt.endDate) + 1;
}

/** Plain alternation, 1,2,1,2… Used when a timetable has no explicit array yet. */
export function defaultWeekTypes(tt) {
  if (tt.rotationWeeks === 1) return [];
  return Array.from({ length: weekCount(tt) }, (_, i) => (i % 2 === 0 ? 1 : 2));
}

/**
 * Set week `index` to `type`, then re-alternate every week after it.
 * This is the whole "flip ripples forward" behaviour, and it is re-runnable:
 * flipping a later week again just re-alternates from that later point.
 * Returns a new array, never mutates.
 */
export function flipWeekFrom(weekTypes, index, type) {
  const out = weekTypes.slice();
  for (let i = index; i < out.length; i++) {
    out[i] = ((type - 1 + (i - index)) % 2) + 1;
  }
  return out;
}

/* ── Slots ───────────────────────────────────────────────────── */

export function slotKey(dayIndex, periodId) {
  return `${dayIndex}:${periodId}`;
}

export function parseSlotKey(key) {
  const i = key.indexOf(':');
  return { dayIndex: Number(key.slice(0, i)), periodId: key.slice(i + 1) };
}

/** Days in one full rotation. Seven-day weeks throughout. */
export function rotationDays(tt) {
  return tt.rotationWeeks * DAYS_PER_WEEK;
}

/** Periods sorted into the order the day actually happens in. */
export function sortPeriods(periods) {
  return periods.slice().sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
}

/**
 * Schema 1 ran Monday to Friday, so a two-week rotation numbered its days
 * 0-9. Schema 2 includes weekends and numbers them 0-13. Old pattern keys
 * have to shift by the week they were in, or Tuesday of week 2 lands on a
 * Sunday.
 */
export function migrate(tt) {
  if ((tt.schemaVersion || 1) >= SCHEMA_VERSION) return tt;

  const moved = {};
  for (const [key, entry] of Object.entries(tt.pattern || {})) {
    const { dayIndex, periodId } = parseSlotKey(key);
    const week = Math.floor(dayIndex / 5);
    const weekday = dayIndex % 5;
    moved[slotKey(week * DAYS_PER_WEEK + weekday, periodId)] = entry;
  }
  tt.pattern = moved;

  // Dated overrides key off slotKey too, so their masks move the same way.
  for (const record of Object.values(tt.overrides || {})) {
    if (!record.removed && !record.patched) continue;
    const shift = (key) => {
      const { dayIndex, periodId } = parseSlotKey(key);
      return slotKey(Math.floor(dayIndex / 5) * DAYS_PER_WEEK + (dayIndex % 5), periodId);
    };
    if (record.removed) record.removed = record.removed.map(shift);
    if (record.patched) {
      record.patched = Object.fromEntries(
        Object.entries(record.patched).map(([k, v]) => [shift(k), v])
      );
    }
  }

  tt.periods = sortPeriods(tt.periods || []);
  tt.schemaVersion = SCHEMA_VERSION;
  return tt;
}

/* ── Construction and validation ─────────────────────────────── */

export function newTimetable(fields = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: fields.id || crypto.randomUUID(),
    name: fields.name || '',
    rotationWeeks: fields.rotationWeeks || 1,
    startDate: fields.startDate || '',
    endDate: fields.endDate || '',
    timezone: fields.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    partialCutoff: fields.partialCutoff || DEFAULT_CUTOFF,
    pxPerMin: fields.pxPerMin || 1.6,
    periods: fields.periods || [],
    pattern: fields.pattern || {},
    calendar: fields.calendar || { weekTypes: [], dayStates: {} },
    overrides: fields.overrides || {},
    createdAt: fields.createdAt || Date.now(),
    updatedAt: fields.updatedAt || Date.now(),
  };
}

/** Returns a list of human-readable problems. Empty means valid. */
export function validatePeriods(periods) {
  const errs = [];
  if (!periods.length) errs.push('No periods yet.');
  periods.forEach((p, i) => {
    if (!p.name || !p.name.trim()) errs.push(`Period ${i + 1} has no name.`);
    if (minutesOf(p.end) <= minutesOf(p.start)) {
      errs.push(`${p.name || `Period ${i + 1}`} ends before it starts.`);
    }
  });
  const sorted = periods.slice().sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (minutesOf(sorted[i].start) < minutesOf(sorted[i - 1].end)) {
      errs.push(`${sorted[i - 1].name} and ${sorted[i].name} overlap.`);
    }
  }
  return errs;
}

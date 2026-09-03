/* The timetable as an .ics file, for importing into Outlook.
   Pure, like resolve.js: no DOM, no storage, no clock. Change it only with tests.

   Flat expansion, one VEVENT per real occurrence. A two week rotation with
   dated overrides and half days does not survive recurrence rules, so it does
   not get any. No METHOD, no ORGANIZER, no ATTENDEE either: this is a
   published calendar, not an invitation, so nothing is sent to anyone. */

import { eachDate } from './model.js';
import { resolveDay } from './resolve.js';

const CRLF = '\r\n';
const DOMAIN = 'time.contrapaul.com';

/* ── Text ────────────────────────────────────────────────────── */

function escapeText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold at 75 octets, not 75 characters, or a name in Chinese breaks mid codepoint. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Back off to a codepoint boundary: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    limit = 74; // the continuation space costs an octet
  }
  return out.join(`${CRLF} `);
}

/* ── Time ────────────────────────────────────────────────────── */

/** A zone's offset from UTC in milliseconds at one instant, east positive. */
function offsetAt(timezone, ms) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(ms));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 0; // plain "GMT"
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return (m[1] === '-' ? -mins : mins) * 60000;
}

/**
 * A wall time in the timetable's zone, as a UTC instant.
 *
 * Two passes: the first offset is read at the wrong instant by however much
 * the zone is offset, which only matters within an hour of a DST change, and
 * the second pass reads it at the candidate instant and settles it.
 */
export function zonedToUTC(timezone, iso, hhmm) {
  const [y, mo, d] = iso.split('-').map(Number);
  const [h, mi] = String(hhmm).split(':').map(Number);
  const asUTC = Date.UTC(y, mo - 1, d, h, mi);
  const guess = asUTC - offsetAt(timezone, asUTC);
  return asUTC - offsetAt(timezone, guess);
}

/** 20260902T001500Z */
export function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/* ── The file ────────────────────────────────────────────────── */

function uidOf(tt, iso, instance) {
  const tail = String(instance.slotKey ?? instance.id).replace(/[^A-Za-z0-9._-]/g, '-');
  return `${tt.id}-${iso}-${tail}@${DOMAIN}`;
}

function eventLines(tt, iso, instance, stamp) {
  const tz = tt.timezone || 'UTC';
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uidOf(tt, iso, instance)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utcStamp(zonedToUTC(tz, iso, instance.start))}`,
    `DTEND:${utcStamp(zonedToUTC(tz, iso, instance.end))}`,
    `SUMMARY:${escapeText(instance.name)}`,
  ];
  if (instance.location) lines.push(`LOCATION:${escapeText(instance.location)}`);
  if (instance.detail) lines.push(`DESCRIPTION:${escapeText(instance.detail)}`);
  lines.push('END:VEVENT');
  return lines;
}

/**
 * The whole timetable as one iCalendar string.
 *
 * `periodIds` chooses which periods travel. Dated one-offs have no period to
 * choose, so they always do. `now` is passed in rather than read, because this
 * module owns no clock.
 */
export function toICS(tt, { periodIds, now = 0 } = {}) {
  const wanted = periodIds ? new Set(periodIds) : null;
  const stamp = utcStamp(now);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${DOMAIN}//Timetable//EN`,
    'CALSCALE:GREGORIAN',
  ];
  if (tt.name) lines.push(`X-WR-CALNAME:${escapeText(tt.name)}`);

  for (const iso of eachDate(tt.startDate, tt.endDate)) {
    for (const instance of resolveDay(tt, iso)) {
      if (wanted && instance.periodId !== null && !wanted.has(instance.periodId)) continue;
      lines.push(...eventLines(tt, iso, instance, stamp));
    }
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join(CRLF)}${CRLF}`;
}

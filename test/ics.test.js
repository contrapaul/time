import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toICS, zonedToUTC, utcStamp } from '../public/js/ics.js';

/* 2026-08-10 is a Monday. Same anchor as resolve.test.js. */
const MON = '2026-08-10';

const periods = [
  { id: 'hr', name: 'HR', start: '08:00', end: '08:10' },
  { id: 'p1', name: 'P1', start: '08:15', end: '09:10' },
  { id: 'p2', name: 'P2', start: '09:15', end: '10:10' },
  { id: 'p4', name: 'P4', start: '13:00', end: '14:00' },
];

function tt(over = {}) {
  return {
    id: 'tt1',
    name: 'Mine',
    rotationWeeks: 1,
    startDate: MON,
    endDate: MON,
    timezone: 'Asia/Shanghai',
    partialCutoff: '12:00',
    periods,
    pattern: {},
    calendar: { weekTypes: [], dayStates: {} },
    overrides: {},
    ...over,
  };
}

const ev = (name, extra = {}) => ({ id: name, name, color: '#333', ...extra });
const lines = (text) => text.split('\r\n');
const events = (text) => lines(text).filter((l) => l.startsWith('SUMMARY:'));

/* ── Times ───────────────────────────────────────────────────── */

test('a wall time becomes the right instant', () => {
  assert.equal(utcStamp(zonedToUTC('Asia/Shanghai', '2026-09-02', '08:15')), '20260902T001500Z');
  assert.equal(utcStamp(zonedToUTC('UTC', '2026-09-02', '08:15')), '20260902T081500Z');
});

test('the offset follows daylight saving', () => {
  // London is GMT in January and BST in July, so the same 09:00 lesson is an
  // hour apart in UTC.
  assert.equal(utcStamp(zonedToUTC('Europe/London', '2026-01-14', '09:00')), '20260114T090000Z');
  assert.equal(utcStamp(zonedToUTC('Europe/London', '2026-07-14', '09:00')), '20260714T080000Z');
});

/* ── The file ────────────────────────────────────────────────── */

test('one event carries the whole slot', () => {
  const text = toICS(tt({
    pattern: { '0:p1': ev('Design', { location: 'T408', detail: '9KX (DES)' }) },
  }), { now: 0 });

  assert.deepEqual(lines(text).slice(0, 5), [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//time.contrapaul.com//Timetable//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Mine',
  ]);
  assert.deepEqual(lines(text).slice(5, 13), [
    'BEGIN:VEVENT',
    'UID:tt1-2026-08-10-0-p1@time.contrapaul.com',
    'DTSTAMP:19700101T000000Z',
    'DTSTART:20260810T001500Z',
    'DTEND:20260810T011000Z',
    'SUMMARY:Design',
    'LOCATION:T408',
    'DESCRIPTION:9KX (DES)',
  ]);
  assert.equal(lines(text).at(-2), 'END:VCALENDAR');
  assert.equal(lines(text).at(-1), '');
});

test('empty location and detail print nothing', () => {
  const text = toICS(tt({ pattern: { '0:p1': ev('Free') } }), { now: 0 });
  assert.equal(lines(text).filter((l) => l.startsWith('LOCATION:')).length, 0);
  assert.equal(lines(text).filter((l) => l.startsWith('DESCRIPTION:')).length, 0);
});

test('commas, semicolons, backslashes and newlines escape', () => {
  const text = toICS(tt({
    pattern: { '0:p1': ev('Maths, double', { detail: 'a;b\\c\nd' }) },
  }), { now: 0 });
  assert.ok(lines(text).includes('SUMMARY:Maths\\, double'));
  assert.ok(lines(text).includes('DESCRIPTION:a\\;b\\\\c\\nd'));
});

test('long lines fold at 75 octets, on codepoint boundaries', () => {
  const text = toICS(tt({ pattern: { '0:p1': ev('数'.repeat(40)) } }), { now: 0 });
  const folded = lines(text).filter((l) => l.startsWith('SUMMARY:') || l.startsWith(' '));
  assert.ok(folded.length > 1);
  for (const line of folded) {
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
  }
  const rejoined = folded.map((l, i) => (i ? l.slice(1) : l)).join('');
  assert.equal(rejoined, `SUMMARY:${'数'.repeat(40)}`);
});

/* ── What the rotation says ──────────────────────────────────── */

test('the whole range expands, day by day', () => {
  const text = toICS(tt({
    endDate: '2026-08-16',
    pattern: { '0:p1': ev('Design'), '2:p1': ev('Music') },
  }), { now: 0 });
  assert.deepEqual(events(text), ['SUMMARY:Design', 'SUMMARY:Music']);
  assert.ok(lines(text).includes('DTSTART:20260812T001500Z')); // Wednesday
});

test('a two week rotation reaches week two', () => {
  const text = toICS(tt({
    rotationWeeks: 2,
    endDate: '2026-08-23',
    calendar: { weekTypes: [1, 2], dayStates: {} },
    pattern: { '0:p1': ev('Week one'), '7:p1': ev('Week two') },
  }), { now: 0 });
  assert.deepEqual(events(text), ['SUMMARY:Week one', 'SUMMARY:Week two']);
});

test('a day off is empty and a half day is trimmed', () => {
  const base = { '0:p1': ev('Morning'), '0:p4': ev('Afternoon') };
  const off = toICS(tt({
    endDate: '2026-08-11',
    calendar: { weekTypes: [], dayStates: { [MON]: 'off' } },
    pattern: base,
  }), { now: 0 });
  assert.deepEqual(events(off), []);

  const am = toICS(tt({
    calendar: { weekTypes: [], dayStates: { [MON]: 'am' } },
    pattern: base,
  }), { now: 0 });
  assert.deepEqual(events(am), ['SUMMARY:Morning']);
});

test('overrides win, and a dated one-off survives any period filter', () => {
  const text = toICS(tt({
    pattern: { '0:hr': ev('Homeroom'), '0:p1': ev('Design') },
    overrides: {
      [MON]: {
        removed: ['0:hr'],
        patched: { '0:p1': { name: 'Assembly' } },
        added: [{ id: 'x1', name: 'Parents', start: '16:00', end: '17:00' }],
      },
    },
  }), { periodIds: ['p1'], now: 0 });

  assert.deepEqual(events(text), ['SUMMARY:Assembly', 'SUMMARY:Parents']);
  assert.ok(lines(text).includes('UID:tt1-2026-08-10-x1@time.contrapaul.com'));
});

test('an entry spanning two periods keeps its own times', () => {
  const text = toICS(tt({
    pattern: { '0:p1': ev('DDES', { start: '08:15', end: '10:10' }) },
  }), { now: 0 });
  assert.ok(lines(text).includes('DTSTART:20260810T001500Z'));
  assert.ok(lines(text).includes('DTEND:20260810T021000Z'));
});

test('unticked periods stay behind', () => {
  const text = toICS(tt({
    pattern: { '0:hr': ev('Homeroom'), '0:p1': ev('Design'), '0:p4': ev('Music') },
  }), { periodIds: ['p1', 'p4'], now: 0 });
  assert.deepEqual(events(text), ['SUMMARY:Design', 'SUMMARY:Music']);
});

test('nothing invitational is emitted', () => {
  const text = toICS(tt({ pattern: { '0:p1': ev('Design') } }), { now: 0 });
  for (const key of ['METHOD:', 'ORGANIZER', 'ATTENDEE', 'RRULE']) {
    assert.ok(!text.includes(key), key);
  }
});

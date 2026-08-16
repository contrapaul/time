import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  minutesOf, hhmmOf, addDays, weekdayIndex, isWeekend, mondayOf,
  daysBetween, weekIndexOf, weekCount, defaultWeekTypes, flipWeekFrom,
  validatePeriods, sortPeriods, migrate, SCHEMA_VERSION,
} from '../public/js/model.js';

import {
  resolveDay, dayIndexFor, weekTypeFor, dayBounds, packOverlaps,
} from '../public/js/resolve.js';

/* 2026-08-10 is a Monday. Every fixture below anchors there. */
const MON = '2026-08-10';

const periods = [
  { id: 'hr', name: 'HR', start: '08:00', end: '08:10' },
  { id: 'p1', name: 'P1', start: '08:15', end: '09:10' },
  { id: 'p2', name: 'P2', start: '09:15', end: '10:10' },
  { id: 'p3', name: 'P3', start: '10:15', end: '11:10' },
  { id: 'p4', name: 'P4', start: '13:00', end: '14:00' },
];

function tt(over = {}) {
  return {
    rotationWeeks: 1,
    startDate: MON,
    endDate: '2026-12-18',
    partialCutoff: '12:00',
    periods,
    pattern: {},
    calendar: { weekTypes: [], dayStates: {} },
    overrides: {},
    ...over,
  };
}

const ev = (name, extra = {}) => ({ id: name, name, color: '#333', ...extra });

/* ── Time and date helpers ───────────────────────────────────── */

test('minutes round-trip', () => {
  assert.equal(minutesOf('08:15'), 495);
  assert.equal(minutesOf('00:00'), 0);
  assert.equal(hhmmOf(495), '08:15');
  assert.equal(hhmmOf(0), '00:00');
});

test('weekday index is Monday-zero', () => {
  assert.equal(weekdayIndex(MON), 0);
  assert.equal(weekdayIndex('2026-08-14'), 4); // Friday
  assert.equal(weekdayIndex('2026-08-15'), 5); // Saturday
  assert.equal(isWeekend('2026-08-15'), true);
  assert.equal(isWeekend('2026-08-16'), true); // Sunday
  assert.equal(isWeekend('2026-08-14'), false);
});

test('mondayOf snaps back within the week', () => {
  assert.equal(mondayOf('2026-08-14'), MON);
  assert.equal(mondayOf(MON), MON);
  assert.equal(mondayOf('2026-08-16'), MON); // Sunday belongs to the week it ends
});

test('daysBetween and weekIndexOf', () => {
  assert.equal(daysBetween(MON, '2026-08-17'), 7);
  assert.equal(weekIndexOf(MON, MON), 0);
  assert.equal(weekIndexOf(MON, '2026-08-14'), 0);
  assert.equal(weekIndexOf(MON, '2026-08-17'), 1);
  assert.equal(weekIndexOf(MON, '2026-08-31'), 3);
});

test('a timetable starting mid-week still counts from its Monday', () => {
  const t = tt({ startDate: '2026-08-12', endDate: '2026-08-28' }); // Wednesday
  assert.equal(weekIndexOf(t.startDate, '2026-08-12'), 0);
  assert.equal(weekIndexOf(t.startDate, '2026-08-17'), 1);
});

/* ── Week types and the flip ─────────────────────────────────── */

test('default week types alternate', () => {
  const t = tt({ rotationWeeks: 2, endDate: '2026-09-11' }); // 5 weeks
  assert.equal(weekCount(t), 5);
  assert.deepEqual(defaultWeekTypes(t), [1, 2, 1, 2, 1]);
});

test('one-week rotations have no week types', () => {
  assert.deepEqual(defaultWeekTypes(tt({ rotationWeeks: 1 })), []);
});

test('flipping a week re-alternates everything after it', () => {
  const types = [1, 2, 1, 2, 1, 2];
  assert.deepEqual(flipWeekFrom(types, 3, 1), [1, 2, 1, 1, 2, 1]);
});

test('flipping is re-runnable further into the year', () => {
  let types = [1, 2, 1, 2, 1, 2, 1, 2];
  types = flipWeekFrom(types, 2, 2);
  assert.deepEqual(types, [1, 2, 2, 1, 2, 1, 2, 1]);
  types = flipWeekFrom(types, 5, 2);
  assert.deepEqual(types, [1, 2, 2, 1, 2, 2, 1, 2]);
});

test('flipping a week to what it already was leaves it alone', () => {
  const types = [1, 2, 1, 2];
  assert.deepEqual(flipWeekFrom(types, 1, 2), types);
});

test('flipWeekFrom does not mutate its input', () => {
  const types = [1, 2, 1, 2];
  flipWeekFrom(types, 0, 2);
  assert.deepEqual(types, [1, 2, 1, 2]);
});

test('the holiday case: leave on week 2, return to week 1', () => {
  // Four weeks: teach, teach, holiday, return. Default says the return
  // week is 2; the user flips it to 1 and the rest follows.
  const t = tt({ rotationWeeks: 2, endDate: '2026-09-18' }); // 6 weeks
  let types = defaultWeekTypes(t);
  assert.deepEqual(types, [1, 2, 1, 2, 1, 2]);
  types = flipWeekFrom(types, 3, 1);
  t.calendar.weekTypes = types;
  assert.equal(weekTypeFor(t, '2026-08-31'), 1); // week 3, flipped
  assert.equal(weekTypeFor(t, '2026-09-07'), 2); // and alternating on
  assert.equal(weekTypeFor(t, '2026-09-14'), 1);
});

/* ── Day index ───────────────────────────────────────────────── */

test('one-week rotation maps weekdays straight through', () => {
  const t = tt();
  assert.equal(dayIndexFor(t, MON), 0);
  assert.equal(dayIndexFor(t, '2026-08-14'), 4); // Friday
  assert.equal(dayIndexFor(t, '2026-08-15'), 5); // Saturday
  assert.equal(dayIndexFor(t, '2026-08-16'), 6); // Sunday
});

test('two-week rotation offsets week 2 by seven', () => {
  const t = tt({ rotationWeeks: 2, calendar: { weekTypes: [1, 2], dayStates: {} } });
  assert.equal(dayIndexFor(t, MON), 0);           // Mon, week 1
  assert.equal(dayIndexFor(t, '2026-08-16'), 6);  // Sun, week 1
  assert.equal(dayIndexFor(t, '2026-08-17'), 7);  // Mon, week 2
  assert.equal(dayIndexFor(t, '2026-08-21'), 11); // Fri, week 2
  assert.equal(dayIndexFor(t, '2026-08-23'), 13); // Sun, week 2
});

test('a two-week rotation with no stored week types still alternates', () => {
  const t = tt({ rotationWeeks: 2, calendar: { weekTypes: [], dayStates: {} } });
  assert.equal(weekTypeFor(t, MON), 1);
  assert.equal(weekTypeFor(t, '2026-08-17'), 2);
});

/* ── resolveDay ──────────────────────────────────────────────── */

test('resolves the rotation for a plain day', () => {
  const t = tt({ pattern: { '0:p1': ev('Maths'), '0:p4': ev('Art') } });
  const day = resolveDay(t, MON);
  assert.deepEqual(day.map((i) => i.name), ['Maths', 'Art']);
  assert.equal(day[0].start, '08:15');
  assert.equal(day[0].end, '09:10');
  assert.equal(day[0].fromPattern, true);
});

test('sorts by start time regardless of pattern key order', () => {
  const t = tt({ pattern: { '0:p4': ev('Art'), '0:hr': ev('Reg'), '0:p2': ev('Maths') } });
  assert.deepEqual(resolveDay(t, MON).map((i) => i.name), ['Reg', 'Maths', 'Art']);
});

test('out-of-range dates are empty', () => {
  const t = tt({ pattern: { '0:p1': ev('Maths') } });
  assert.deepEqual(resolveDay(t, '2026-08-03'), []); // before start
  assert.deepEqual(resolveDay(t, '2027-01-04'), []); // after end
});

test('weekends are ordinary rotation days', () => {
  const t = tt({ pattern: { '5:p1': ev('Football'), '6:p1': ev('Choir') } });
  assert.deepEqual(resolveDay(t, '2026-08-15').map((i) => i.name), ['Football']); // Saturday
  assert.deepEqual(resolveDay(t, '2026-08-16').map((i) => i.name), ['Choir']);    // Sunday
});

test('the range is inclusive at both ends', () => {
  const t = tt({ startDate: MON, endDate: '2026-08-14', pattern: { '0:p1': ev('Maths'), '4:p1': ev('PE') } });
  assert.equal(resolveDay(t, MON).length, 1);
  assert.equal(resolveDay(t, '2026-08-14').length, 1);
});

test('a day off is empty even though the rotation has events', () => {
  const t = tt({
    pattern: { '0:p1': ev('Maths') },
    calendar: { weekTypes: [], dayStates: { [MON]: 'off' } },
  });
  assert.deepEqual(resolveDay(t, MON), []);
});

test('an entry with its own times spans several periods', () => {
  const t = tt({ pattern: { '0:p2': ev('Double Design', { start: '09:15', end: '11:10' }) } });
  const [i] = resolveDay(t, MON);
  assert.equal(i.start, '09:15');
  assert.equal(i.end, '11:10');
  assert.equal(i.endMin - i.startMin, 115);
});

test('an entry pointing at a deleted period is dropped, not fatal', () => {
  const t = tt({ pattern: { '0:gone': ev('Ghost'), '0:p1': ev('Maths') } });
  assert.deepEqual(resolveDay(t, MON).map((i) => i.name), ['Maths']);
});

/* ── Partial days ────────────────────────────────────────────── */

test('a morning-only day drops the afternoon', () => {
  const t = tt({
    pattern: { '0:p1': ev('Maths'), '0:p4': ev('Art') },
    calendar: { weekTypes: [], dayStates: { [MON]: 'am' } },
  });
  assert.deepEqual(resolveDay(t, MON).map((i) => i.name), ['Maths']);
});

test('an afternoon-only day drops the morning', () => {
  const t = tt({
    pattern: { '0:p1': ev('Maths'), '0:p4': ev('Art') },
    calendar: { weekTypes: [], dayStates: { [MON]: 'pm' } },
  });
  assert.deepEqual(resolveDay(t, MON).map((i) => i.name), ['Art']);
});

test('an event added to a half day survives the trim', () => {
  // The trim is for the rotation. Something entered against this exact
  // date was entered knowing the day is short, so it stays.
  const t = tt({
    pattern: { '0:p1': ev('Maths'), '0:p4': ev('Art') },
    calendar: { weekTypes: [], dayStates: { [MON]: 'am' } },
    overrides: { [MON]: { added: [ev('Parent evening', { start: '16:00', end: '18:00' })] } },
  });
  assert.deepEqual(resolveDay(t, MON).map((i) => i.name), ['Maths', 'Parent evening']);
});

/* ── Overrides ───────────────────────────────────────────────── */

test('removing an instance affects only that date', () => {
  const t = tt({
    pattern: { '0:p1': ev('Maths') },
    overrides: { [MON]: { removed: ['0:p1'] } },
  });
  assert.deepEqual(resolveDay(t, MON), []);
  assert.deepEqual(resolveDay(t, '2026-08-17').map((i) => i.name), ['Maths']);
});

test('patching changes times on that date only', () => {
  const t = tt({
    pattern: { '0:p1': ev('Maths') },
    overrides: { [MON]: { patched: { '0:p1': { start: '08:15', end: '10:10' } } } },
  });
  const [patched] = resolveDay(t, MON);
  assert.equal(patched.end, '10:10');
  assert.equal(patched.endMin, 610);
  const [normal] = resolveDay(t, '2026-08-17');
  assert.equal(normal.end, '09:10');
});

test('added events carry their own times and are not from the pattern', () => {
  const t = tt({
    overrides: { [MON]: { added: [ev('PD Day', { start: '09:00', end: '15:00' })] } },
  });
  const [i] = resolveDay(t, MON);
  assert.equal(i.fromPattern, false);
  assert.equal(i.slotKey, null);
  assert.equal(i.start, '09:00');
});

test('overrides on one date leave neighbouring dates alone', () => {
  const t = tt({
    pattern: { '0:p1': ev('Maths') },
    overrides: { [MON]: { removed: ['0:p1'], added: [ev('Trip', { start: '09:00', end: '15:00' })] } },
  });
  assert.deepEqual(resolveDay(t, MON).map((i) => i.name), ['Trip']);
  assert.deepEqual(resolveDay(t, '2026-08-17').map((i) => i.name), ['Maths']);
});

/* ── Bounds and packing ──────────────────────────────────────── */

test('day bounds span the periods', () => {
  assert.deepEqual(dayBounds(tt()), { startMin: 480, endMin: 840 });
});

test('day bounds stretch to reach an out-of-hours event', () => {
  const t = tt({
    overrides: { [MON]: { added: [ev('Parent evening', { start: '17:00', end: '19:30' })] } },
  });
  assert.deepEqual(dayBounds(t), { startMin: 480, endMin: 1170 });
});

test('day bounds on an empty timetable are zero, not infinite', () => {
  assert.deepEqual(dayBounds({ periods: [] }), { startMin: 0, endMin: 0 });
});

test('non-overlapping events each get the full width', () => {
  const packed = packOverlaps(resolveDay(tt({ pattern: { '0:p1': ev('A'), '0:p2': ev('B') } }), MON));
  assert.deepEqual(packed.map((i) => i.cols), [1, 1]);
  assert.deepEqual(packed.map((i) => i.col), [0, 0]);
});

test('two overlapping events split the width', () => {
  const t = tt({
    pattern: { '0:p1': ev('Class') },
    overrides: { [MON]: { added: [ev('Meeting', { start: '08:30', end: '09:00' })] } },
  });
  const packed = packOverlaps(resolveDay(t, MON));
  assert.deepEqual(packed.map((i) => i.cols), [2, 2]);
  assert.deepEqual(packed.map((i) => i.col), [0, 1]);
});

test('a later event reuses a freed column', () => {
  const t = tt({
    pattern: { '0:p1': ev('Class') },
    overrides: {
      [MON]: {
        added: [
          ev('Meeting', { start: '08:30', end: '09:00' }),
          ev('Chained', { start: '09:05', end: '09:20' }),
        ],
      },
    },
  });
  const packed = packOverlaps(resolveDay(t, MON));
  const chained = packed.find((i) => i.name === 'Chained');
  assert.equal(chained.col, 1); // slots back in beside Class, not a third column
  assert.equal(chained.cols, 2);
});

/* ── Validation ──────────────────────────────────────────────── */

test('validatePeriods accepts a sane structure', () => {
  assert.deepEqual(validatePeriods(periods), []);
});

test('validatePeriods catches empties, inversions and overlaps', () => {
  assert.match(validatePeriods([])[0], /No periods/);
  assert.match(
    validatePeriods([{ id: 'a', name: 'A', start: '10:00', end: '09:00' }])[0],
    /ends before it starts/
  );
  assert.match(
    validatePeriods([
      { id: 'a', name: 'A', start: '09:00', end: '10:00' },
      { id: 'b', name: 'B', start: '09:30', end: '10:30' },
    ])[0],
    /overlap/
  );
  assert.match(
    validatePeriods([{ id: 'a', name: '  ', start: '09:00', end: '10:00' }])[0],
    /Row 1 needs a name/
  );
});

test('problems point at a row when the row has no name yet', () => {
  // New rows start unnamed, so nothing can assume there is a name to quote.
  const errs = validatePeriods([
    { id: 'a', name: '', start: '09:00', end: '10:00' },
    { id: 'b', name: '', start: '09:30', end: '10:30' },
  ]);
  assert.ok(errs.some((e) => e === 'Row 1 needs a name.'));
  assert.ok(errs.some((e) => e === 'Row 2 needs a name.'));
  assert.ok(errs.some((e) => e === 'Row 1 and Row 2 overlap.'));
});

test('a named row is quoted by name, an unnamed neighbour by row', () => {
  const errs = validatePeriods([
    { id: 'a', name: 'Lunch', start: '12:00', end: '13:00' },
    { id: 'b', name: '', start: '12:30', end: '13:30' },
  ]);
  assert.ok(errs.some((e) => e === 'Lunch and Row 2 overlap.'));
});

/* ── Sorting and migration ───────────────────────────────────── */

test('periods sort into the order the day happens in', () => {
  const jumbled = [
    { id: 'p5', name: 'P5', start: '14:00', end: '15:00' },
    { id: 'hr', name: 'Homeroom', start: '08:00', end: '08:10' },
    { id: 'p1', name: 'P1', start: '09:00', end: '10:00' },
  ];
  assert.deepEqual(sortPeriods(jumbled).map((p) => p.id), ['hr', 'p1', 'p5']);
});

test('sortPeriods does not mutate its input', () => {
  const given = [
    { id: 'b', name: 'B', start: '10:00', end: '11:00' },
    { id: 'a', name: 'A', start: '09:00', end: '10:00' },
  ];
  sortPeriods(given);
  assert.deepEqual(given.map((p) => p.id), ['b', 'a']);
});

test('migration shifts week 2 from five-day numbering to seven', () => {
  const old = {
    schemaVersion: 1,
    periods,
    pattern: {
      '0:p1': ev('Mon wk1'),
      '4:p1': ev('Fri wk1'),
      '5:p1': ev('Mon wk2'),
      '9:p1': ev('Fri wk2'),
    },
    overrides: {},
  };
  migrate(old);
  assert.equal(old.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(Object.keys(old.pattern).sort(), ['0:p1', '11:p1', '4:p1', '7:p1']);
  assert.equal(old.pattern['7:p1'].name, 'Mon wk2');
  assert.equal(old.pattern['11:p1'].name, 'Fri wk2');
});

test('migration shifts the masks in dated overrides too', () => {
  const old = {
    schemaVersion: 1,
    periods,
    pattern: {},
    overrides: {
      '2026-08-17': { removed: ['5:p1'], patched: { '9:p2': { end: '10:00' } } },
    },
  };
  migrate(old);
  assert.deepEqual(old.overrides['2026-08-17'].removed, ['7:p1']);
  assert.deepEqual(Object.keys(old.overrides['2026-08-17'].patched), ['11:p2']);
});

test('a migrated two-week timetable still resolves week 2 correctly', () => {
  const old = tt({
    schemaVersion: 1,
    rotationWeeks: 2,
    calendar: { weekTypes: [1, 2], dayStates: {} },
    pattern: { '5:p1': ev('Monday of week two') },
  });
  migrate(old);
  assert.deepEqual(resolveDay(old, '2026-08-17').map((i) => i.name), ['Monday of week two']);
});

test('migration is idempotent', () => {
  const t = { schemaVersion: 1, periods, pattern: { '5:p1': ev('X') }, overrides: {} };
  migrate(t);
  const once = JSON.stringify(t.pattern);
  migrate(t);
  assert.equal(JSON.stringify(t.pattern), once);
});

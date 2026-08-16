import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  removeInstance, addEntry, patchInstance, freePeriods, snapshot, restore,
} from '../public/js/edits.js';
import { resolveDay } from '../public/js/resolve.js';

const MON = '2026-08-10';
const NEXT_MON = '2026-08-17';

const periods = [
  { id: 'reg', name: 'Registration', start: '08:30', end: '08:40' },
  { id: 'p1',  name: 'Period 1',     start: '08:45', end: '09:45' },
  { id: 'p2',  name: 'Period 2',     start: '09:45', end: '10:45' },
  { id: 'p3',  name: 'Period 3',     start: '11:00', end: '12:00' },
];

function tt() {
  return {
    rotationWeeks: 1,
    startDate: MON,
    endDate: '2026-12-18',
    partialCutoff: '12:00',
    periods,
    pattern: {
      '0:p1': { id: 'e1', name: 'Maths', color: '#333' },
      '0:p3': { id: 'e2', name: 'Science', color: '#333' },
    },
    calendar: { weekTypes: [], dayStates: {} },
    overrides: {},
  };
}

const names = (t, iso) => resolveDay(t, iso).map((i) => i.name);

/* ── Removing ────────────────────────────────────────────────── */

test('cancelling a lesson affects that date and no other', () => {
  const t = tt();
  const maths = resolveDay(t, MON).find((i) => i.name === 'Maths');
  removeInstance(t, MON, maths);
  assert.deepEqual(names(t, MON), ['Science']);
  assert.deepEqual(names(t, NEXT_MON), ['Maths', 'Science']);
});

test('cancelling never touches the pattern', () => {
  const t = tt();
  const before = JSON.stringify(t.pattern);
  removeInstance(t, MON, resolveDay(t, MON)[0]);
  assert.equal(JSON.stringify(t.pattern), before);
});

test('cancelling the same lesson twice does not duplicate the mask', () => {
  const t = tt();
  const maths = resolveDay(t, MON).find((i) => i.name === 'Maths');
  removeInstance(t, MON, maths);
  removeInstance(t, MON, maths);
  assert.deepEqual(t.overrides[MON].removed, ['0:p1']);
});

test('removing a one-off deletes it rather than leaving a tombstone', () => {
  const t = tt();
  addEntry(t, MON, { id: 'x1', name: 'Trip', color: '#333' }, periods[1]);
  const trip = resolveDay(t, MON).find((i) => i.name === 'Trip');
  removeInstance(t, MON, trip);
  assert.deepEqual(names(t, MON), ['Maths', 'Science']);
  assert.equal(t.overrides[MON], undefined, 'the date record should be gone entirely');
});

/* ── Adding ──────────────────────────────────────────────────── */

test('an added entry inherits the slot times when given none', () => {
  const t = tt();
  addEntry(t, MON, { id: 'x1', name: 'Cover', color: '#333' }, periods[2]);
  const cover = resolveDay(t, MON).find((i) => i.name === 'Cover');
  assert.equal(cover.start, '09:45');
  assert.equal(cover.end, '10:45');
  assert.equal(cover.fromPattern, false);
});

test('an added entry keeps times of its own when given them', () => {
  const t = tt();
  addEntry(t, MON, { id: 'x1', name: 'Parent evening', start: '16:30', end: '19:00' }, periods[2]);
  const ev = resolveDay(t, MON).find((i) => i.name === 'Parent evening');
  assert.equal(ev.start, '16:30');
  assert.equal(ev.end, '19:00');
});

test('adding on one date leaves the next week alone', () => {
  const t = tt();
  addEntry(t, MON, { id: 'x1', name: 'Cover', color: '#333' }, periods[2]);
  assert.deepEqual(names(t, NEXT_MON), ['Maths', 'Science']);
});

/* ── Patching ────────────────────────────────────────────────── */

test('stretching a lesson changes that date only', () => {
  const t = tt();
  const maths = resolveDay(t, MON).find((i) => i.name === 'Maths');
  patchInstance(t, MON, maths, { start: '08:45', end: '10:45' });
  assert.equal(resolveDay(t, MON).find((i) => i.name === 'Maths').end, '10:45');
  assert.equal(resolveDay(t, NEXT_MON).find((i) => i.name === 'Maths').end, '09:45');
});

test('renaming a one-off edits it in place', () => {
  const t = tt();
  addEntry(t, MON, { id: 'x1', name: 'Cover', color: '#333' }, periods[2]);
  const cover = resolveDay(t, MON).find((i) => i.name === 'Cover');
  patchInstance(t, MON, cover, { name: 'Cover for Sam' });
  assert.ok(names(t, MON).includes('Cover for Sam'));
  assert.equal(t.overrides[MON].added.length, 1);
});

test('two patches to the same instance merge', () => {
  const t = tt();
  const maths = resolveDay(t, MON).find((i) => i.name === 'Maths');
  patchInstance(t, MON, maths, { end: '10:45' });
  patchInstance(t, MON, maths, { location: 'Room 3' });
  assert.deepEqual(t.overrides[MON].patched['0:p1'], { end: '10:45', location: 'Room 3' });
});

/* ── Undo ────────────────────────────────────────────────────── */

test('a snapshot puts back exactly what was there', () => {
  const t = tt();
  const before = snapshot(t, MON);
  assert.equal(before, null);
  removeInstance(t, MON, resolveDay(t, MON)[0]);
  assert.deepEqual(names(t, MON), ['Science']);
  restore(t, MON, before);
  assert.deepEqual(names(t, MON), ['Maths', 'Science']);
});

test('undo restores an earlier edit rather than clearing the date', () => {
  const t = tt();
  addEntry(t, MON, { id: 'x1', name: 'Cover', color: '#333' }, periods[2]);
  const before = snapshot(t, MON);
  removeInstance(t, MON, resolveDay(t, MON).find((i) => i.name === 'Maths'));
  assert.deepEqual(names(t, MON), ['Cover', 'Science']);
  restore(t, MON, before);
  assert.deepEqual(names(t, MON), ['Maths', 'Cover', 'Science']);
});

/* ── Free periods ────────────────────────────────────────────── */

test('free periods are the ones nothing sits over', () => {
  const t = tt();
  const free = freePeriods(periods, resolveDay(t, MON)).map((p) => p.id);
  assert.deepEqual(free, ['reg', 'p2']);
});

test('a spanning entry blocks every period it crosses', () => {
  const t = tt();
  t.pattern['0:p1'] = { id: 'e1', name: 'Double', start: '08:45', end: '10:45' };
  const free = freePeriods(periods, resolveDay(t, MON)).map((p) => p.id);
  assert.deepEqual(free, ['reg']);
});

test('an empty day leaves every period free', () => {
  const t = tt();
  t.pattern = {};
  assert.equal(freePeriods(periods, resolveDay(t, MON)).length, 4);
});

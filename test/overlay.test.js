import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  busyIntervals, freeIntervals, intersectIntervals, comparisonWindow,
  mutualFree, totalMinutes, comparisonWeeks, sharedRange,
} from '../public/js/overlay.js';
import { resolveDay } from '../public/js/resolve.js';

const span = (startMin, endMin) => ({ startMin, endMin });
const show = (list) => list.map((i) => `${i.startMin}-${i.endMin}`);

/* 09:00 = 540, 10:00 = 600, and so on. */

/* ── Busy ────────────────────────────────────────────────────── */

test('busy intervals merge things that touch or overlap', () => {
  assert.deepEqual(
    show(busyIntervals([span(540, 600), span(600, 660), span(700, 720)])),
    ['540-660', '700-720']
  );
});

test('busy intervals swallow a lesson wholly inside another', () => {
  assert.deepEqual(show(busyIntervals([span(540, 720), span(600, 660)])), ['540-720']);
});

test('busy intervals do not care what order they arrive in', () => {
  assert.deepEqual(show(busyIntervals([span(700, 720), span(540, 600)])), ['540-600', '700-720']);
});

test('nothing scheduled is nothing busy', () => {
  assert.deepEqual(busyIntervals([]), []);
});

/* ── Free ────────────────────────────────────────────────────── */

test('free is what the window has left', () => {
  assert.deepEqual(
    show(freeIntervals([span(540, 600), span(660, 720)], 480, 780)),
    ['480-540', '600-660', '720-780']
  );
});

test('an empty day is free for the whole window', () => {
  assert.deepEqual(show(freeIntervals([], 480, 780)), ['480-780']);
});

test('a day full from edge to edge has no free time', () => {
  assert.deepEqual(freeIntervals([span(480, 780)], 480, 780), []);
});

test('busy time outside the window is ignored', () => {
  assert.deepEqual(show(freeIntervals([span(0, 100), span(900, 1000)], 480, 780)), ['480-780']);
});

test('busy time straddling the window edge is clipped, not dropped', () => {
  assert.deepEqual(show(freeIntervals([span(400, 540)], 480, 780)), ['540-780']);
  assert.deepEqual(show(freeIntervals([span(720, 900)], 480, 780)), ['480-720']);
});

test('a zero-width window is free of everything', () => {
  assert.deepEqual(freeIntervals([], 600, 600), []);
});

/* ── Intersection ────────────────────────────────────────────── */

test('intersection finds the shared part', () => {
  assert.deepEqual(
    show(intersectIntervals([span(480, 600), span(660, 780)], [span(540, 700)])),
    ['540-600', '660-700']
  );
});

test('intervals that merely touch do not intersect', () => {
  assert.deepEqual(intersectIntervals([span(480, 600)], [span(600, 700)]), []);
});

test('intersecting with nothing gives nothing', () => {
  assert.deepEqual(intersectIntervals([span(480, 600)], []), []);
});

/* ── Mutual free ─────────────────────────────────────────────── */

const window = { startMin: 480, endMin: 900 }; // 08:00 to 15:00

test('two people free at the same time show up', () => {
  const mine = [span(480, 600)];   // busy 08:00-10:00
  const theirs = [span(540, 660)]; // busy 09:00-11:00
  assert.deepEqual(show(mutualFree(mine, theirs, window)), ['660-900']);
});

test('a gap shorter than the minimum is not a meeting', () => {
  const mine = [span(480, 600), span(610, 900)];
  const theirs = [span(480, 600), span(610, 900)];
  assert.deepEqual(mutualFree(mine, theirs, window, 15), []);
  assert.deepEqual(show(mutualFree(mine, theirs, window, 10)), ['600-610']);
});

test('two people who are never free together get nothing', () => {
  assert.deepEqual(mutualFree([span(480, 900)], [span(480, 900)], window), []);
});

test('a day off for one of them leaves the other free time standing', () => {
  const mine = [span(540, 600)];
  const theirsDayOff = [];
  assert.deepEqual(show(mutualFree(mine, theirsDayOff, window)), ['480-540', '600-900']);
});

test('two empty days are free for the whole window', () => {
  assert.deepEqual(show(mutualFree([], [], window)), ['480-900']);
});

test('minutes add up across the gaps', () => {
  assert.equal(totalMinutes([span(480, 540), span(600, 660)]), 120);
  assert.equal(totalMinutes([]), 0);
});

/* ── Window, weeks, range ────────────────────────────────────── */

const base = (over = {}) => ({
  rotationWeeks: 1,
  startDate: '2026-08-10',
  endDate: '2026-12-18',
  periods: [{ id: 'p1', name: 'P1', start: '09:00', end: '10:00' }],
  pattern: {},
  overrides: {},
  calendar: { weekTypes: [], dayStates: {} },
  ...over,
});

test('the comparison window covers both people', () => {
  const mine = base();
  const theirs = base({ periods: [{ id: 'x', name: 'X', start: '08:00', end: '17:00' }] });
  assert.deepEqual(comparisonWindow(mine, theirs), { startMin: 480, endMin: 1020 });
});

test('the window stretches to reach an evening event', () => {
  const mine = base({
    overrides: { '2026-09-01': { added: [{ id: 'a', name: 'Evening', start: '18:00', end: '20:00' }] } },
  });
  assert.deepEqual(comparisonWindow(mine, base()), { startMin: 540, endMin: 1200 });
});

test('two empty timetables produce no window rather than an infinite one', () => {
  const empty = base({ periods: [] });
  assert.deepEqual(comparisonWindow(empty, empty), { startMin: 0, endMin: 0 });
});

test('a one-week and a two-week timetable are read on the longer cycle', () => {
  assert.equal(comparisonWeeks(base(), base({ rotationWeeks: 2 })), 2);
  assert.equal(comparisonWeeks(base({ rotationWeeks: 2 }), base()), 2);
  assert.equal(comparisonWeeks(base(), base()), 1);
});

test('the shared range is the overlap of both', () => {
  const mine = base({ startDate: '2026-08-10', endDate: '2026-12-18' });
  const theirs = base({ startDate: '2026-09-01', endDate: '2027-01-30' });
  assert.deepEqual(sharedRange(mine, theirs), { start: '2026-09-01', end: '2026-12-18' });
});

test('timetables that never overlap share no range at all', () => {
  const mine = base({ startDate: '2026-01-01', endDate: '2026-06-30' });
  const theirs = base({ startDate: '2026-09-01', endDate: '2027-01-30' });
  assert.equal(sharedRange(mine, theirs), null);
});

/* ── End to end against the resolver ─────────────────────────── */

test('two real timetables agree on when they are both free', () => {
  const periods = [
    { id: 'p1', name: 'P1', start: '09:00', end: '10:00' },
    { id: 'p2', name: 'P2', start: '10:00', end: '11:00' },
    { id: 'p3', name: 'P3', start: '11:00', end: '12:00' },
  ];
  const mine = base({ periods, pattern: { '0:p1': { id: 'a', name: 'Maths' } } });
  const theirs = base({ periods, pattern: { '0:p2': { id: 'b', name: 'Science' } } });

  const win = comparisonWindow(mine, theirs);
  const free = mutualFree(resolveDay(mine, '2026-08-10'), resolveDay(theirs, '2026-08-10'), win);
  // Mine is busy 9-10, theirs 10-11, so 11-12 is the only shared gap.
  assert.deepEqual(show(free), ['660-720']);
});

test('a cancelled lesson opens up shared free time', () => {
  const periods = [{ id: 'p1', name: 'P1', start: '09:00', end: '10:00' }];
  const mine = base({ periods, pattern: { '0:p1': { id: 'a', name: 'Maths' } } });
  const theirs = base({ periods, pattern: {} });
  const win = comparisonWindow(mine, theirs);

  assert.deepEqual(mutualFree(resolveDay(mine, '2026-08-10'), resolveDay(theirs, '2026-08-10'), win), []);

  mine.overrides['2026-08-10'] = { removed: ['0:p1'] };
  assert.deepEqual(
    show(mutualFree(resolveDay(mine, '2026-08-10'), resolveDay(theirs, '2026-08-10'), win)),
    ['540-600']
  );
});

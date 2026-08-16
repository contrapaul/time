import { test } from 'node:test';
import assert from 'node:assert/strict';

import { coveredIndices } from '../public/js/grid.js';

const periods = [
  { id: 'reg', name: 'Registration', start: '08:30', end: '08:40' },
  { id: 'p1',  name: 'Period 1',     start: '08:45', end: '09:45' },
  { id: 'p2',  name: 'Period 2',     start: '09:45', end: '10:45' },
  { id: 'ln',  name: 'Lunch',        start: '10:45', end: '11:30' },
  { id: 'p3',  name: 'Period 3',     start: '11:30', end: '12:30' },
];

test('an entry with no times of its own covers just its own row', () => {
  assert.deepEqual(coveredIndices(periods, { name: 'Maths' }, 1), [1]);
});

test('a double period covers both rows', () => {
  const entry = { start: '09:45', end: '11:30' };
  assert.deepEqual(coveredIndices(periods, entry, 2), [2, 3]);
});

test('a long entry covers everything it overlaps', () => {
  const entry = { start: '08:45', end: '12:30' };
  assert.deepEqual(coveredIndices(periods, entry, 1), [1, 2, 3, 4]);
});

test('touching boundaries do not count as overlap', () => {
  // Ends exactly when Period 2 begins, so Period 2 stays free.
  assert.deepEqual(coveredIndices(periods, { start: '08:45', end: '09:45' }, 1), [1]);
});

test('an entry inside the gap between periods covers nothing but its anchor', () => {
  // 08:40 to 08:45 is the gap after registration.
  assert.deepEqual(coveredIndices(periods, { start: '08:40', end: '08:45' }, 0), [0]);
});

test('a ten-minute entry stays a single row', () => {
  assert.deepEqual(coveredIndices(periods, { start: '08:30', end: '08:40' }, 0), [0]);
});

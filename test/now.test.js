import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayStatus, elapsedFraction } from '../public/js/now.js';

const lesson = { startMin: 540, endMin: 600 }; // 09:00 to 10:00

test('days sort into past, today and future', () => {
  assert.equal(dayStatus('2026-08-10', '2026-08-12'), 'past');
  assert.equal(dayStatus('2026-08-12', '2026-08-12'), 'today');
  assert.equal(dayStatus('2026-08-14', '2026-08-12'), 'future');
});

test('an event not yet started is nought elapsed', () => {
  assert.equal(elapsedFraction(lesson, 0), 0);
  assert.equal(elapsedFraction(lesson, 539), 0);
  assert.equal(elapsedFraction(lesson, 540), 0);
});

test('an event finished is fully elapsed', () => {
  assert.equal(elapsedFraction(lesson, 600), 1);
  assert.equal(elapsedFraction(lesson, 1439), 1);
});

test('an event in progress reports how far through it is', () => {
  assert.equal(elapsedFraction(lesson, 570), 0.5);
  assert.equal(elapsedFraction(lesson, 555), 0.25);
  assert.equal(elapsedFraction(lesson, 585), 0.75);
});

test('a ten-minute event still reports a fraction', () => {
  assert.equal(elapsedFraction({ startMin: 500, endMin: 510 }, 505), 0.5);
});

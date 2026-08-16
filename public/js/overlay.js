/* Comparing two timetables.

   The comparison is done on time, never on slots. Two people at the same
   school share a period structure and two people at different schools do
   not, and the only thing that reliably means the same to both is the clock.
   When the structures do happen to match, this collapses to exactly what
   slot matching would have said.

   Pure: no DOM, no storage, no clock. */

import { dayBounds } from './resolve.js';

/** Merge a day's instances into non-overlapping busy ranges. */
export function busyIntervals(instances) {
  const sorted = instances
    .map((i) => ({ startMin: i.startMin, endMin: i.endMin }))
    .sort((a, b) => a.startMin - b.startMin);

  const out = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, span.endMin);
    } else {
      out.push({ ...span });
    }
  }
  return out;
}

/** The gaps left over inside a window. A day with nothing on is all gap. */
export function freeIntervals(instances, windowStart, windowEnd) {
  if (windowEnd <= windowStart) return [];
  const out = [];
  let cursor = windowStart;
  for (const busy of busyIntervals(instances)) {
    if (busy.endMin <= windowStart || busy.startMin >= windowEnd) continue;
    const start = Math.max(windowStart, busy.startMin);
    if (start > cursor) out.push({ startMin: cursor, endMin: start });
    cursor = Math.max(cursor, Math.min(windowEnd, busy.endMin));
  }
  if (cursor < windowEnd) out.push({ startMin: cursor, endMin: windowEnd });
  return out;
}

/** Where two lists of intervals overlap. Both must be sorted and disjoint. */
export function intersectIntervals(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].startMin, b[j].startMin);
    const end = Math.min(a[i].endMin, b[j].endMin);
    if (end > start) out.push({ startMin: start, endMin: end });
    if (a[i].endMin < b[j].endMin) i++;
    else j++;
  }
  return out;
}

/**
 * The window worth comparing inside: everything either person has anything
 * scheduled in. Beyond it both are free, but "free at 3am" is not an answer
 * to when two people can meet.
 */
export function comparisonWindow(ttA, ttB) {
  const a = dayBounds(ttA);
  const b = dayBounds(ttB);
  const startMin = Math.min(a.startMin || Infinity, b.startMin || Infinity);
  const endMin = Math.max(a.endMin, b.endMin);
  if (!isFinite(startMin) || endMin <= startMin) return { startMin: 0, endMin: 0 };
  return { startMin, endMin };
}

/**
 * When both people are free on one day, given each one's resolved instances.
 * `minGap` drops slivers: five minutes between two lessons is not a meeting.
 */
export function mutualFree(instancesA, instancesB, window, minGap = 15) {
  const free = intersectIntervals(
    freeIntervals(instancesA, window.startMin, window.endMin),
    freeIntervals(instancesB, window.startMin, window.endMin)
  );
  return free.filter((f) => f.endMin - f.startMin >= minGap);
}

/** Total minutes in a list of intervals. */
export function totalMinutes(intervals) {
  return intervals.reduce((n, i) => n + (i.endMin - i.startMin), 0);
}

/**
 * How wide the default view should be when two timetables are shown at once.
 * A one-week rotation next to a two-week one is read on the longer cycle,
 * because that is the period over which the pairing actually repeats.
 */
export function comparisonWeeks(ttA, ttB) {
  return Math.max(ttA?.rotationWeeks || 1, ttB?.rotationWeeks || 1);
}

/** Dates both timetables actually cover. Outside it there is nothing to say. */
export function sharedRange(ttA, ttB) {
  const start = ttA.startDate > ttB.startDate ? ttA.startDate : ttB.startDate;
  const end = ttA.endDate < ttB.endDate ? ttA.endDate : ttB.endDate;
  return end < start ? null : { start, end };
}

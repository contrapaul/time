/* Every edit made from the timetable view lands here, and every one of them
   is scoped to a single date. The pattern is only ever touched by the pattern
   editor. That split is the whole of decision 5, and keeping it in one small
   module is what stops it leaking.

   These mutate the timetable in place and return it. */

function recordFor(tt, iso) {
  tt.overrides ||= {};
  tt.overrides[iso] ||= {};
  return tt.overrides[iso];
}

/** Drop a date's record once it no longer says anything. */
function tidy(tt, iso) {
  const r = tt.overrides?.[iso];
  if (!r) return;
  if (!r.removed?.length) delete r.removed;
  if (r.patched && !Object.keys(r.patched).length) delete r.patched;
  if (!r.added?.length) delete r.added;
  if (!Object.keys(r).length) delete tt.overrides[iso];
}

/** A snapshot to hand back if the user changes their mind. */
export function snapshot(tt, iso) {
  return JSON.parse(JSON.stringify(tt.overrides?.[iso] ?? null));
}

export function restore(tt, iso, snap) {
  tt.overrides ||= {};
  if (snap === null) delete tt.overrides[iso];
  else tt.overrides[iso] = snap;
  return tt;
}

/**
 * Cancel one instance on one date. A rotation entry is masked; a one-off
 * added earlier is deleted outright, since masking something that only ever
 * existed on this date would leave a tombstone for no reason.
 */
export function removeInstance(tt, iso, instance) {
  const r = recordFor(tt, iso);
  if (instance.fromPattern) {
    r.removed ||= [];
    if (!r.removed.includes(instance.slotKey)) r.removed.push(instance.slotKey);
  } else {
    r.added = (r.added || []).filter((a) => a.id !== instance.id);
  }
  tidy(tt, iso);
  return tt;
}

/** Add something that happens on this date only. */
export function addEntry(tt, iso, entry, period) {
  const r = recordFor(tt, iso);
  r.added ||= [];
  r.added.push({
    ...entry,
    start: entry.start || period.start,
    end: entry.end || period.end,
  });
  return tt;
}

/** Change an instance on this date only, whatever its origin. */
export function patchInstance(tt, iso, instance, fields) {
  const r = recordFor(tt, iso);
  if (instance.fromPattern) {
    r.patched ||= {};
    r.patched[instance.slotKey] = { ...r.patched[instance.slotKey], ...fields };
  } else {
    r.added = (r.added || []).map((a) => (a.id === instance.id ? { ...a, ...fields } : a));
  }
  tidy(tt, iso);
  return tt;
}

/** Which periods have nothing sitting over them on a given day. */
export function freePeriods(periods, instances) {
  return periods.filter((p) => {
    const s = toMin(p.start);
    const e = toMin(p.end);
    return !instances.some((i) => i.startMin < e && i.endMin > s);
  });
}

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/* The scrolling day-column view.
   Days run across, time runs down, height is duration. */

import { minutesOf, hhmmOf, eachDate, isWeekend, parseISO } from './model.js';
import { resolveDay, dayBounds, packOverlaps, weekTypeFor, dayIndexFor } from './resolve.js';
import { todayISO, dayStatus, elapsedFraction, startClock } from './now.js';
import { readableOn, greyOf, escapeHtml } from './palette.js';
import { askAboutSlot } from './dialog.js';
import {
  removeInstance, addEntry, patchInstance, freePeriods, snapshot, restore,
} from './edits.js';

/* Below this rendered height an entry has no room for a line of text and
   becomes a bare colour stripe. See PLAN.md section 4. */
const STRIPE_PX = 26;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Colour helpers, including the computed grey that makes a past day, a
   finished lesson and the elapsed half of a running lesson one colour, all
   live in palette.js. */

/* ── Mount ───────────────────────────────────────────────────── */

export function mount(root, tt, {
  onChange, onEditPattern, onNew, onSwitch, timetables = [],
} = {}) {
  let bounds = dayBounds(tt);
  const dayMin = Math.max(1, bounds.endMin - bounds.startMin);
  const pastOpacity = 0.38;

  const dates = eachDate(tt.startDate, tt.endDate).filter((d) => !isWeekend(d));
  let today = todayISO();
  let stopClock = null;

  root.innerHTML = `
    <header class="bar">
      ${timetables.length > 1 ? `
        <select class="bar-pick" aria-label="Which timetable?">
          ${timetables.map((t) => `
            <option value="${t.id}" ${t.id === tt.id ? 'selected' : ''}>${escapeHtml(t.name || 'Untitled')}</option>
          `).join('')}
        </select>`
      : `<h1 class="bar-title">${escapeHtml(tt.name || 'Timetable')}</h1>`}
      <div class="bar-actions">
        <button class="btn" data-act="today">Today</button>
        <div class="zoom" role="group" aria-label="Zoom">
          <button class="btn btn-icon" data-act="zoom-out" aria-label="Show less detail">&minus;</button>
          <button class="btn btn-icon" data-act="zoom-in" aria-label="Show more detail">+</button>
        </div>
        <button class="btn" data-act="pattern">Edit pattern</button>
        <button class="btn" data-act="new">New</button>
      </div>
    </header>
    <div class="stage">
      <aside class="gutter" aria-hidden="true">
        <div class="gutter-head"></div>
        <div class="gutter-body"></div>
      </aside>
      <div class="scroller" tabindex="0" role="region" aria-label="Timetable, scroll sideways through days">
        <div class="track"></div>
      </div>
    </div>
  `;

  const stage = root.querySelector('.stage');
  const scroller = root.querySelector('.scroller');
  const track = root.querySelector('.track');
  const gutterBody = root.querySelector('.gutter-body');

  stage.style.setProperty('--day-min', dayMin);
  stage.style.setProperty('--px-per-min', tt.pxPerMin || 1.6);
  stage.style.setProperty('--rules', rulesGradient(tt.periods, bounds));

  /* Gutter: one label per period, sitting at its true offset. */
  function redrawGutter() {
    gutterBody.innerHTML = tt.periods
      .map((p) => {
        const off = minutesOf(p.start) - bounds.startMin;
        const dur = minutesOf(p.end) - minutesOf(p.start);
        return `<div class="tick" style="--off:${off}; --dur:${dur}">
                  <span class="tick-name">${escapeHtml(p.name)}</span>
                  <span class="tick-time">${p.start}</span>
                </div>`;
      })
      .join('');
  }
  redrawGutter();

  /* Columns. A school year is under 200 of them, so they all just exist. */
  const columns = new Map();
  const frag = document.createDocumentFragment();
  for (const iso of dates) {
    const col = buildColumn(tt, iso, bounds, pastOpacity);
    columns.set(iso, col);
    frag.appendChild(col);
  }
  track.appendChild(frag);

  /* ── Editing ───────────────────────────────────────────────── */

  /**
   * Redraw after an edit. Only the touched day needs rebuilding, unless the
   * edit pushed the day's bounds out (an evening event, say), because every
   * column shares one vertical scale and they all have to agree.
   */
  function refresh(iso) {
    const next = dayBounds(tt);
    if (next.startMin !== bounds.startMin || next.endMin !== bounds.endMin) {
      bounds = next;
      stage.style.setProperty('--day-min', Math.max(1, next.endMin - next.startMin));
      stage.style.setProperty('--rules', rulesGradient(tt.periods, next));
      redrawGutter();
      for (const [d, col] of columns) replaceColumn(d, col);
    } else {
      replaceColumn(iso, columns.get(iso));
    }
    restripe(Number(stage.style.getPropertyValue('--px-per-min')) || 1.6);
    paint({ nowMin: nowMinutesFromRule(), today, rolled: false });
    onChange?.(tt);
  }

  function replaceColumn(iso, oldCol) {
    if (!oldCol) return;
    const fresh = buildColumn(tt, iso, bounds, pastOpacity);
    oldCol.replaceWith(fresh);
    columns.set(iso, fresh);
  }

  function nowMinutesFromRule() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function instanceFromEl(el, iso) {
    const all = resolveDay(tt, iso);
    return all.find((i) => (el.dataset.slotKey
      ? i.slotKey === el.dataset.slotKey
      : i.id === el.dataset.entryId));
  }

  async function openSlot(iso, periodId) {
    const periodIndex = tt.periods.findIndex((p) => p.id === periodId);
    const result = await askAboutSlot({
      entry: null,
      periods: tt.periods,
      periodIndex,
      canRepeat: false,
    });
    if (!result || result === 'remove') return;
    addEntry(tt, iso, result.entry, tt.periods[periodIndex]);
    refresh(iso);
  }

  async function openEntry(iso, el) {
    const instance = instanceFromEl(el, iso);
    if (!instance) return;
    const periodIndex = Math.max(0, tt.periods.findIndex((p) => p.id === instance.periodId));
    const result = await askAboutSlot({
      entry: instance,
      periods: tt.periods,
      periodIndex,
      canRepeat: false,
    });
    if (!result) return;

    const before = snapshot(tt, iso);
    if (result === 'remove') {
      removeInstance(tt, iso, instance);
      offerUndo('Removed.', iso, before);
    } else {
      const { id, ...fields } = result.entry;
      patchInstance(tt, iso, instance, fields);
    }
    refresh(iso);
  }

  function cancelInstance(iso, el) {
    const instance = instanceFromEl(el, iso);
    if (!instance) return;
    const before = snapshot(tt, iso);
    removeInstance(tt, iso, instance);
    refresh(iso);
    offerUndo(`${instance.name} removed.`, iso, before);
  }

  /* Removing takes one click and asks nothing, which is right for a class
     that has just been cancelled. Undo is what makes that safe. */
  let undoTimer = null;
  function offerUndo(message, iso, before) {
    clearTimeout(undoTimer);
    root.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${escapeHtml(message)}</span><button class="toast-undo">Undo</button>`;
    el.querySelector('.toast-undo').addEventListener('click', () => {
      restore(tt, iso, before);
      refresh(iso);
      el.remove();
    });
    root.appendChild(el);
    undoTimer = setTimeout(() => el.remove(), 6000);
  }

  track.addEventListener('click', (ev) => {
    const iso = ev.target.closest('.col')?.dataset.iso;
    if (!iso) return;

    const x = ev.target.closest('[data-remove]');
    if (x) return cancelInstance(iso, x.closest('.entry'));

    const entry = ev.target.closest('.entry');
    if (entry) return openEntry(iso, entry);

    const slot = ev.target.closest('.slot');
    if (slot) return openSlot(iso, slot.dataset.periodId);
  });

  /* ── Time response ─────────────────────────────────────────── */

  function paint({ nowMin, today: t, rolled }) {
    today = t;
    for (const [iso, col] of columns) {
      const status = dayStatus(iso, today);
      col.classList.toggle('is-past', status === 'past');
      col.classList.toggle('is-today', status === 'today');
      if (status !== 'today') {
        if (col.dataset.wasToday) {
          col.querySelector('.now-rule')?.remove();
          col.querySelectorAll('.entry').forEach((el) => {
            el.classList.remove('is-elapsed');
            el.style.removeProperty('--elapsed');
          });
          delete col.dataset.wasToday;
        }
        continue;
      }
      col.dataset.wasToday = '1';
      paintToday(col, nowMin, bounds);
    }
    if (rolled) scrollToDay(today, { animate: true });
  }

  function paintToday(col, nowMin, b) {
    let rule = col.querySelector('.now-rule');
    if (!rule) {
      rule = document.createElement('div');
      rule.className = 'now-rule';
      col.querySelector('.col-body').appendChild(rule);
    }
    rule.style.setProperty('--off', nowMin - b.startMin);
    rule.dataset.time = hhmmOf(nowMin);

    for (const el of col.querySelectorAll('.entry')) {
      const startMin = Number(el.dataset.startMin);
      const endMin = Number(el.dataset.endMin);
      const f = elapsedFraction({ startMin, endMin }, nowMin);
      el.classList.toggle('is-elapsed', f >= 1);
      el.style.setProperty('--elapsed', `${(f * 100).toFixed(2)}%`);
    }
  }

  /* ── Scrolling ─────────────────────────────────────────────── */

  /** Nearest school day at or after `iso`, so weekends and holidays still land. */
  function nearestColumn(iso) {
    if (columns.has(iso)) return columns.get(iso);
    let best = null;
    let bestGap = Infinity;
    for (const [d, col] of columns) {
      const gap = Math.abs(parseISO(d) - parseISO(iso));
      if (gap < bestGap) { bestGap = gap; best = col; }
    }
    return best;
  }

  function scrollToDay(iso, { animate = true } = {}) {
    const col = nearestColumn(iso);
    if (!col) return;
    // Measured, not offsetLeft: the columns' offsetParent is not the scroller,
    // so offsetLeft carries the gutter and page margins with it.
    const colRect = col.getBoundingClientRect();
    const scRect = scroller.getBoundingClientRect();
    const target = scroller.scrollLeft
      + (colRect.left - scRect.left)
      - (scroller.clientWidth - colRect.width) / 2;
    easeScroll(scroller, target, animate);
  }

  root.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'today') scrollToDay(today, { animate: true });
    if (act === 'zoom-in') zoom(1.25);
    if (act === 'zoom-out') zoom(0.8);
    if (act === 'pattern') onEditPattern?.();
    if (act === 'new') onNew?.();
  });

  root.querySelector('.bar-pick')?.addEventListener('change', (ev) => {
    onSwitch?.(ev.target.value);
  });

  function zoom(factor) {
    const current = Number(stage.style.getPropertyValue('--px-per-min')) || 1.6;
    const next = Math.min(6, Math.max(0.5, current * factor));
    stage.style.setProperty('--px-per-min', next);
    restripe(next);
  }

  /** Which entries are too short for text depends on the zoom, so recheck. */
  function restripe(pxPerMin) {
    for (const el of track.querySelectorAll('.entry')) {
      const dur = Number(el.dataset.dur);
      el.classList.toggle('is-stripe', dur * pxPerMin < STRIPE_PX);
    }
  }

  /* The gutter sits outside the scroller so it cannot drift sideways, which
     means its vertical offset has to be driven by hand. */
  scroller.addEventListener('scroll', () => {
    gutterBody.style.transform = `translateY(${-scroller.scrollTop}px)`;
  }, { passive: true });

  restripe(tt.pxPerMin || 1.6);
  stopClock = startClock(paint);
  requestAnimationFrame(() => scrollToDay(today, { animate: false }));

  return () => stopClock?.();
}

/* ── Column building ─────────────────────────────────────────── */

function buildColumn(tt, iso, bounds, pastOpacity) {
  const d = parseISO(iso);
  const col = document.createElement('section');
  col.className = 'col';
  col.dataset.iso = iso;

  const state = tt.calendar?.dayStates?.[iso];
  if (state) col.classList.add(`is-${state}`);

  const weekBadge = tt.rotationWeeks === 2 ? `W${weekTypeFor(tt, iso)}` : '';
  const dayIdx = dayIndexFor(tt, iso);

  const head = document.createElement('header');
  head.className = 'col-head';
  head.innerHTML = `
    <span class="col-day">${WEEKDAYS[dayIdx % 5] || ''}</span>
    <span class="col-date">${d.getDate()} ${MONTHS[d.getMonth()]}</span>
    ${weekBadge ? `<span class="col-week">${weekBadge}</span>` : ''}
    ${state ? `<span class="col-state">${state === 'off' ? 'Off' : state === 'am' ? 'Morning only' : 'Afternoon only'}</span>` : ''}
  `;

  const body = document.createElement('div');
  body.className = 'col-body';

  const instances = resolveDay(tt, iso);

  /* Empty periods first, so they sit behind anything drawn over them. A day
     that is off has no slots: there is nothing to schedule into. */
  if (state !== 'off') {
    for (const p of freePeriods(tt.periods, instances)) {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'slot';
      slot.dataset.periodId = p.id;
      slot.style.setProperty('--off', minutesOf(p.start) - bounds.startMin);
      slot.style.setProperty('--dur', minutesOf(p.end) - minutesOf(p.start));
      slot.setAttribute('aria-label', `Add something to ${p.name}`);
      slot.innerHTML = '<span class="slot-plus" aria-hidden="true">+</span>';
      body.appendChild(slot);
    }
  }

  for (const i of packOverlaps(instances)) {
    body.appendChild(buildEntry(i, bounds, pastOpacity));
  }

  col.append(head, body);
  return col;
}

function buildEntry(i, bounds, pastOpacity) {
  const dur = i.endMin - i.startMin;
  const colour = i.color || '#3d3d3d';

  const el = document.createElement('article');
  el.className = 'entry';
  el.dataset.startMin = i.startMin;
  el.dataset.endMin = i.endMin;
  el.dataset.dur = dur;
  if (i.slotKey) el.dataset.slotKey = i.slotKey;
  else el.dataset.entryId = i.id;

  el.style.setProperty('--off', i.startMin - bounds.startMin);
  el.style.setProperty('--dur', dur);
  el.style.setProperty('--c', colour);
  el.style.setProperty('--c-past', greyOf(colour, pastOpacity));
  el.style.setProperty('--fg', readableOn(colour));
  el.style.setProperty('--col', i.col || 0);
  el.style.setProperty('--cols', i.cols || 1);

  const time = `${i.start}–${i.end}`;
  el.innerHTML = `
    <div class="entry-bg"></div>
    <div class="entry-wash"></div>
    <div class="entry-body">
      <span class="entry-name">${escapeHtml(i.name)}</span>
      ${i.location ? `<span class="entry-loc">${escapeHtml(i.location)}</span>` : ''}
      ${i.detail ? `<span class="entry-detail">${escapeHtml(i.detail)}</span>` : ''}
      <span class="entry-time">${time}</span>
    </div>
    <button type="button" class="entry-x" data-remove
            aria-label="Remove ${escapeHtml(i.name)} on this day">&times;</button>
  `;
  el.title = `${i.name}${i.location ? ` · ${i.location}` : ''} · ${time}`;
  return el;
}

/* ── Period rules, as one gradient rather than 2000 elements ─── */

function rulesGradient(periods, bounds) {
  const span = Math.max(1, bounds.endMin - bounds.startMin);
  const stops = [];
  const seen = new Set();
  for (const p of periods) {
    for (const m of [minutesOf(p.start), minutesOf(p.end)]) {
      if (seen.has(m)) continue;
      seen.add(m);
      stops.push(((m - bounds.startMin) / span) * 100);
    }
  }
  stops.sort((a, b) => a - b);
  // Percentages keep the rules correct at any zoom without recomputing.
  const parts = ['transparent 0'];
  for (const pct of stops) {
    parts.push(`transparent calc(${pct}% - 0.5px)`);
    parts.push(`var(--line) calc(${pct}% - 0.5px)`);
    parts.push(`var(--line) calc(${pct}% + 0.5px)`);
    parts.push(`transparent calc(${pct}% + 0.5px)`);
  }
  return `linear-gradient(to bottom, ${parts.join(', ')})`;
}

/* ── Eased scrolling ─────────────────────────────────────────── */

/**
 * Native smooth scrolling across a whole school year is either capped,
 * instant, or stuttering depending on the browser. Crossing a term should
 * read as travel, so the duration scales with the distance.
 */
function easeScroll(el, target, animate) {
  const from = el.scrollLeft;
  const max = el.scrollWidth - el.clientWidth;
  const to = Math.max(0, Math.min(max, target));
  const distance = Math.abs(to - from);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduced || distance < 2) {
    el.scrollLeft = to;
    return;
  }

  const duration = Math.min(1400, Math.max(450, 380 + distance * 0.28));
  const snap = el.style.scrollSnapType;
  el.style.scrollSnapType = 'none'; // or the snap points fight the animation
  const t0 = performance.now();

  const step = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    el.scrollLeft = from + (to - from) * eased;
    if (t < 1) requestAnimationFrame(step);
    else el.style.scrollSnapType = snap;
  };
  requestAnimationFrame(step);
}


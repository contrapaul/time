/* The scrolling day-column view.
   Days run across, time runs down, height is duration. */

import {
  minutesOf, hhmmOf, eachDate, isWeekend, parseISO,
  DAYS_PER_WEEK, WEEKDAYS,
} from './model.js';
import { enableDragCopy } from './dragcopy.js';
import { resolveDay, dayBounds, packOverlaps, weekTypeFor, dayIndexFor } from './resolve.js';
import { todayISO, dayStatus, elapsedFraction, startClock } from './now.js';
import { readableOn, greyOf, escapeHtml } from './palette.js';
import { askAboutSlot } from './dialog.js';
import {
  removeInstance, addEntry, patchInstance, freePeriods, snapshot, restore,
} from './edits.js';
import {
  mutualFree, comparisonWindow, comparisonWeeks, sharedRange, totalMinutes,
} from './overlay.js';

/* Below this rendered height an entry has no room for a line of text and
   becomes a bare colour stripe. See PLAN.md section 4. */
const STRIPE_PX = 26;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Zoom moves the horizontal axis: how many days you can see at once.
   The vertical axis fits the window instead, so the day is always whole. */
const MIN_COL = 34;
const MAX_COL = 420;
const MIN_PX_PER_MIN = 0.45;

/* Colour helpers, including the computed grey that makes a past day, a
   finished lesson and the elapsed half of a running lesson one colour, all
   live in palette.js. */

/* ── Mount ───────────────────────────────────────────────────── */

export function mount(root, tt, {
  onChange, onEditPattern, onEditPeriods, onNew, onSwitch, onAccount, onShare,
  user, timetables = [], readOnly = false, owner = null, mine = null,
} = {}) {
  let bounds = dayBounds(tt);
  const dayMin = Math.max(1, bounds.endMin - bounds.startMin);
  const pastOpacity = 0.38;

  const dates = eachDate(tt.startDate, tt.endDate);
  let today = todayISO();
  let stopClock = null;

  /* Comparing against your own timetable, when you are looking at someone
     else's. Off until asked for: the first question is what their week looks
     like, not how it collides with yours. */
  const canOverlay = !!(mine && readOnly && mine.id !== tt.id);
  const overlayState = {
    on: false,
    showFree: false,
    minGap: 15,
    other: mine,
    window: canOverlay ? comparisonWindow(tt, mine) : null,
    range: canOverlay ? sharedRange(tt, mine) : null,
  };
  const overlayArg = () => (overlayState.on ? overlayState : null);

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
        ${readOnly ? `
          <span class="bar-owner">${escapeHtml(owner || '')}'s timetable</span>
          ${canOverlay ? `
            <button class="btn" data-act="overlay">Overlay mine</button>
            <span class="bar-overlay" hidden>
              <span class="bar-legend">
                <span class="bar-key">${escapeHtml(owner || 'Theirs')}</span>
                <span class="bar-key is-mine">You</span>
              </span>
              <button class="btn" data-act="free">Both free?</button>
              <select class="bar-gap" aria-label="Shortest gap worth showing">
                <option value="15">15 min or more</option>
                <option value="30">30 min or more</option>
                <option value="45">45 min or more</option>
                <option value="60">An hour or more</option>
              </select>
            </span>` : ''}
          <a class="btn" href="/">Open mine</a>
        ` : `
          <button class="btn" data-act="periods">Edit times</button>
          <button class="btn" data-act="pattern">Edit pattern</button>
          <button class="btn" data-act="share">Share</button>
          <button class="btn" data-act="new">New</button>
          <span class="bar-sync" aria-live="polite"></span>
          <button class="btn" data-act="account">${
            user ? escapeHtml(user.username) : 'Sign in'
          }</button>
        `}
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
  stage.style.setProperty('--rules', rulesGradient(tt.periods, bounds));

  /* Vertical: fit the whole day into the window rather than letting the
     user shrink rows. Below a floor it gives up and scrolls instead. */
  function fitVertical() {
    const room = scroller.clientHeight - 56; // column header
    const fitted = room / Math.max(1, bounds.endMin - bounds.startMin);
    stage.style.setProperty('--px-per-min', Math.max(MIN_PX_PER_MIN, fitted));
  }

  /* Horizontal: this is what zoom means now. Default to one whole rotation
     on screen, so choosing two weeks shows two weeks. */
  function fitHorizontal() {
    const room = scroller.clientWidth;
    const want = tt.rotationWeeks * DAYS_PER_WEEK;
    setColWidth(room / want - 8);
  }

  function setColWidth(px) {
    const w = Math.round(Math.min(MAX_COL, Math.max(MIN_COL, px)));
    stage.style.setProperty('--col-w', `${w}px`);
    // Words drop out in the order they stop earning their space.
    stage.dataset.density = w < 52 ? 'tiny' : w < 92 ? 'cramped' : w < 140 ? 'tight' : 'roomy';
    return w;
  }

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
    const col = buildColumn(tt, iso, bounds, pastOpacity, readOnly, overlayArg());
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
    const fresh = buildColumn(tt, iso, bounds, pastOpacity, readOnly, overlayArg());
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
    if (readOnly || track.classList.contains('is-dragging')) return;
    const iso = ev.target.closest('.col')?.dataset.iso;
    if (!iso) return;

    const x = ev.target.closest('[data-remove]');
    if (x) return cancelInstance(iso, x.closest('.entry'));

    const entry = ev.target.closest('.entry');
    if (entry) return openEntry(iso, entry);

    const slot = ev.target.closest('.slot');
    if (slot) return openSlot(iso, slot.dataset.periodId);
  });

  /* Drag an entry onto a free period, on any day, to copy it there.
     The copy is a dated one-off, like everything else the main view writes. */
  if (!readOnly) enableDragCopy(track, {
    handle: '.entry',
    source: '.col',
    target: '.slot',
    keyOf: (el) => (el.classList.contains('col') ? el.dataset.iso : el.dataset.periodId),
    onCopy(fromIso, periodId, { to, el }) {
      const toIso = to.closest('.col').dataset.iso;
      const instance = instanceFromEl(el, fromIso);
      const period = tt.periods.find((p) => p.id === periodId);
      if (!instance || !period) return;
      addEntry(tt, toIso, {
        id: crypto.randomUUID(),
        name: instance.name,
        location: instance.location,
        detail: instance.detail,
        color: instance.color,
      }, period);
      refresh(toIso);
    },
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
    if (act === 'zoom-in') zoom(1.3);
    if (act === 'zoom-out') zoom(1 / 1.3);
    if (act === 'pattern') onEditPattern?.();
    if (act === 'periods') onEditPeriods?.();
    if (act === 'share') onShare?.();
    if (act === 'overlay') toggleOverlay(ev.target.closest('[data-act]'));
    if (act === 'free') toggleFree(ev.target.closest('[data-act]'));
    if (act === 'new') onNew?.();
    if (act === 'account') onAccount?.();
  });

  root.querySelector('.bar-pick')?.addEventListener('change', (ev) => {
    onSwitch?.(ev.target.value);
  });

  root.querySelector('.bar-gap')?.addEventListener('change', (ev) => {
    overlayState.minGap = Number(ev.target.value);
    if (overlayState.showFree) rebuildAll();
  });

  /* Turning the overlay on changes what has to fit on screen: both people's
     days vertically, and the longer of the two rotations horizontally. */
  function toggleOverlay(btn) {
    overlayState.on = !overlayState.on;
    btn.classList.toggle('is-on', overlayState.on);
    btn.textContent = overlayState.on ? 'Just theirs' : 'Overlay mine';
    root.querySelector('.bar-overlay').hidden = !overlayState.on;
    if (!overlayState.on) overlayState.showFree = false;

    bounds = overlayState.on ? overlayState.window : dayBounds(tt);
    stage.style.setProperty('--day-min', Math.max(1, bounds.endMin - bounds.startMin));
    stage.style.setProperty('--rules', rulesGradient(tt.periods, bounds));
    redrawGutter();
    rebuildAll();

    const weeks = overlayState.on ? comparisonWeeks(tt, mine) : tt.rotationWeeks;
    setColWidth(scroller.clientWidth / (weeks * DAYS_PER_WEEK) - 8);
    fitVertical();
    restripe();
    scrollToDay(today, { animate: false });
  }

  function toggleFree(btn) {
    overlayState.showFree = !overlayState.showFree;
    btn.classList.toggle('is-on', overlayState.showFree);
    rebuildAll();
  }

  function rebuildAll() {
    for (const [d, col] of columns) replaceColumn(d, col);
    restripe();
    paint({ nowMin: nowMinutesFromRule(), today, rolled: false });
  }

  /**
   * Zoom the day axis, keeping whatever is under the cursor under the cursor.
   * Anchoring matters: pinching without it slides the day you are looking at
   * off the screen.
   */
  function zoom(factor, anchorX) {
    const current = parseFloat(stage.style.getPropertyValue('--col-w')) || 220;
    const rect = scroller.getBoundingClientRect();
    const x = (anchorX ?? rect.left + scroller.clientWidth / 2) - rect.left;
    const before = (scroller.scrollLeft + x) / (current + parseFloat(getComputedStyle(track).gap || 8));

    const next = setColWidth(current * factor);
    const gap = parseFloat(getComputedStyle(track).gap || 8);
    scroller.scrollLeft = before * (next + gap) - x;
    restripe();
  }

  /** Which entries are too short for text depends on the scale, so recheck. */
  function restripe() {
    const pxPerMin = Number(stage.style.getPropertyValue('--px-per-min')) || 1.6;
    for (const el of track.querySelectorAll('.entry')) {
      const dur = Number(el.dataset.dur);
      el.classList.toggle('is-stripe', dur * pxPerMin < STRIPE_PX);
    }
  }

  /* Trackpad pinch arrives as a wheel event with ctrlKey set, and so does
     ctrl or command plus scroll on a mouse. Same gesture, same handler. */
  scroller.addEventListener('wheel', (ev) => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    zoom(Math.exp(-ev.deltaY * 0.01), ev.clientX);
  }, { passive: false });

  const onResize = () => { fitVertical(); restripe(); };
  window.addEventListener('resize', onResize);

  /* The gutter sits outside the scroller so it cannot drift sideways, which
     means its vertical offset has to be driven by hand. */
  scroller.addEventListener('scroll', () => {
    gutterBody.style.transform = `translateY(${-scroller.scrollTop}px)`;
  }, { passive: true });

  requestAnimationFrame(() => {
    fitVertical();
    fitHorizontal();
    restripe();
    scrollToDay(today, { animate: false });
  });
  stopClock = startClock(paint);

  return () => {
    stopClock?.();
    window.removeEventListener('resize', onResize);
  };
}

/* ── Column building ─────────────────────────────────────────── */

function buildColumn(tt, iso, bounds, pastOpacity, readOnly, overlay) {
  const d = parseISO(iso);
  const col = document.createElement('section');
  col.className = 'col';
  col.dataset.iso = iso;

  const state = tt.calendar?.dayStates?.[iso];
  if (state) col.classList.add(`is-${state}`);

  const weekBadge = tt.rotationWeeks === 2 ? `W${weekTypeFor(tt, iso)}` : '';
  const dayIdx = dayIndexFor(tt, iso);
  if (isWeekend(iso)) col.classList.add('is-weekend');

  const head = document.createElement('header');
  head.className = 'col-head';
  head.innerHTML = `
    <span class="col-day">${WEEKDAYS[dayIdx % DAYS_PER_WEEK] || ''}</span>
    <span class="col-date">${d.getDate()} ${MONTHS[d.getMonth()]}</span>
    ${weekBadge ? `<span class="col-week">${weekBadge}</span>` : ''}
    ${state ? `<span class="col-state">${state === 'off' ? 'Off' : state === 'am' ? 'Morning only' : 'Afternoon only'}</span>` : ''}
  `;

  const body = document.createElement('div');
  body.className = 'col-body';

  const instances = resolveDay(tt, iso);

  /* Empty periods first, so they sit behind anything drawn over them. A day
     that is off has no slots: there is nothing to schedule into. */
  if (state !== 'off' && !readOnly) {
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

  const lanes = overlay ? 2 : 1;

  /* Shared free time sits behind everything, so entries stay readable on
     top of it. Only computed where both timetables actually cover the date:
     outside that, silence is honest and an empty day is not. */
  if (overlay?.showFree && overlay.range
      && iso >= overlay.range.start && iso <= overlay.range.end) {
    const theirs = resolveDay(overlay.other, iso);
    for (const f of mutualFree(instances, theirs, overlay.window, overlay.minGap)) {
      const band = document.createElement('div');
      band.className = 'free-band';
      band.style.setProperty('--off', f.startMin - bounds.startMin);
      band.style.setProperty('--dur', f.endMin - f.startMin);
      band.innerHTML = `<span class="free-band-len">${formatGap(f.endMin - f.startMin)}</span>`;
      body.appendChild(band);
    }
  }

  for (const i of packOverlaps(instances)) {
    body.appendChild(buildEntry(i, bounds, pastOpacity, readOnly, 0, lanes));
  }

  if (overlay) {
    for (const i of packOverlaps(resolveDay(overlay.other, iso))) {
      body.appendChild(buildEntry(i, bounds, pastOpacity, true, 1, lanes, 'is-mine'));
    }
  }

  col.append(head, body);
  return col;
}

function formatGap(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function buildEntry(i, bounds, pastOpacity, readOnly, lane = 0, lanes = 1, extraClass = '') {
  const dur = i.endMin - i.startMin;
  const colour = i.color || '#3d3d3d';

  const el = document.createElement('article');
  el.className = `entry${extraClass ? ` ${extraClass}` : ''}`;
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
  el.style.setProperty('--lane', lane);
  el.style.setProperty('--lanes', lanes);

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
    ${readOnly ? '' : `<button type="button" class="entry-x" data-remove
            aria-label="Remove ${escapeHtml(i.name)} on this day">&times;</button>`}
  `;
  el.title = `${i.name}${i.location ? ` · ${i.location}` : ''} · ${time}`;
  return el;
}

/* ── Period rules, as one gradient rather than 2000 elements ─── */

/**
 * A rule where each period begins, and nowhere else. Drawing the end of a
 * period as well puts two lines around every empty slot, which reads as a
 * box drawn around nothing.
 */
function rulesGradient(periods, bounds) {
  const span = Math.max(1, bounds.endMin - bounds.startMin);
  const stops = [];
  const seen = new Set();
  for (const p of periods) {
    const m = minutesOf(p.start);
    if (seen.has(m)) continue;
    seen.add(m);
    stops.push(((m - bounds.startMin) / span) * 100);
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


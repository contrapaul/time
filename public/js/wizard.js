/* The five-step wizard, running on the same horizontal snap engine as the
   timetable itself.

   Forward movement is impossible because the next panel does not exist yet:
   panels are only built as they are unlocked, so there is nothing to the
   right to scroll to and no clamping code to write. */

import {
  newTimetable, validatePeriods,
  defaultWeekTypes, weekCount, mondayOf, addDays,
} from './model.js';
import { escapeHtml } from './palette.js';
import { createPeriodEditor } from './periods.js';
import { createGrid } from './grid.js';
import { createYearView } from './yearview.js';
import { todayISO } from './now.js';

export function mountWizard(root, { onDone }) {
  const draft = {
    rotationWeeks: null,
    periods: [],
    pattern: {},
    startDate: '',
    endDate: '',
    name: '',
    calendar: { weekTypes: [], dayStates: {} },
  };

  const steps = [
    { key: 'rotation', ask: 'One week or two?',            build: buildRotation, valid: () => !!draft.rotationWeeks },
    { key: 'periods',  ask: 'How is each day structured?', build: buildPeriods,  valid: () => draft.periods.length > 0 && validatePeriods(draft.periods).length === 0 },
    { key: 'pattern',  ask: 'What do you teach, and when?', build: buildPattern, valid: () => Object.keys(draft.pattern).length > 0, wide: true },
    { key: 'year',     ask: 'Which days are you off?',     build: buildYear,     valid: () => !!draft.startDate && !!draft.endDate && draft.endDate > draft.startDate, wide: true },
    { key: 'name',     ask: 'What should we call it?',     build: buildName,     valid: () => draft.name.trim().length > 0 },
  ];

  root.innerHTML = `
    <div class="wiz">
      <div class="wiz-track"></div>
      <nav class="wiz-dots" aria-label="Progress"></nav>
    </div>
  `;
  const wiz = root.querySelector('.wiz');
  const track = root.querySelector('.wiz-track');
  const dots = root.querySelector('.wiz-dots');

  let unlocked = 0;

  function panelAt(i) { return track.children[i]; }

  function addPanel(i) {
    const step = steps[i];
    const el = document.createElement('section');
    el.className = `wiz-panel${step.wide ? ' is-wide' : ''}`;
    el.dataset.step = i;
    el.innerHTML = `
      <h2 class="ask">${escapeHtml(step.ask)}</h2>
      <div class="wiz-body"></div>
      <div class="wiz-foot">
        <span class="wiz-note" hidden></span>
        <button type="button" class="btn btn-primary wiz-next" disabled>Next</button>
      </div>
    `;
    track.appendChild(el);
    step.build(el.querySelector('.wiz-body'), el);
    el.querySelector('.wiz-next').addEventListener('click', () => advance(i));
    refresh(i);
    renderDots();
    updateDepth();
    return el;
  }

  /** Re-check a step and enable or disable its way forward. */
  function refresh(i) {
    const el = panelAt(i);
    if (!el) return;
    const ok = steps[i].valid();
    const next = el.querySelector('.wiz-next');
    next.disabled = !ok;
    next.textContent = i === steps.length - 1 ? 'Done' : 'Next';
    if (i === 0) next.hidden = true; // rotation advances on choice
  }

  function advance(i) {
    if (!steps[i].valid()) return;
    if (i === steps.length - 1) return finish();
    if (unlocked === i) {
      unlocked = i + 1;
      addPanel(unlocked);
    }
    scrollToPanel(i + 1);
  }

  function scrollToPanel(i, animate = true) {
    const el = panelAt(i);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const tr = wiz.getBoundingClientRect();
    const target = wiz.scrollLeft + (r.left - tr.left) - (wiz.clientWidth - r.width) / 2;
    easeScroll(wiz, target, animate);
  }

  function renderDots() {
    dots.innerHTML = steps.map((s, i) => `
      <button type="button" class="wiz-dot${i <= unlocked ? ' is-live' : ''}"
              data-goto="${i}" ${i > unlocked ? 'disabled' : ''}
              aria-label="${escapeHtml(s.ask)}"></button>`).join('');
  }
  dots.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b && !b.disabled) scrollToPanel(Number(b.dataset.goto));
  });

  // A panel off centre is dimmed and pushed back, but still there to click.
  function updateDepth() {
    const mid = wiz.getBoundingClientRect().left + wiz.clientWidth / 2;
    for (const el of track.children) {
      const r = el.getBoundingClientRect();
      const d = Math.min(1, Math.abs(r.left + r.width / 2 - mid) / (wiz.clientWidth * 0.8));
      el.style.setProperty('--away', d.toFixed(3));
      el.classList.toggle('is-centre', d < 0.15);
    }
  }

  let ticking = false;
  wiz.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateDepth(); ticking = false; });
  }, { passive: true });

  track.addEventListener('click', (e) => {
    const panel = e.target.closest('.wiz-panel');
    if (panel && !panel.classList.contains('is-centre')) {
      scrollToPanel(Number(panel.dataset.step));
    }
  }, true);

  /* ── Step 1: rotation ──────────────────────────────────────── */

  function buildRotation(body) {
    body.innerHTML = `
      <div class="wiz-choices">
        <button type="button" class="wiz-choice" data-weeks="1" aria-label="One week">
          <span class="wiz-choice-n" aria-hidden="true">1</span><span>One week</span>
          <span class="wiz-choice-sub">The same five days, over and over.</span>
        </button>
        <button type="button" class="wiz-choice" data-weeks="2" aria-label="Two weeks">
          <span class="wiz-choice-n" aria-hidden="true">2</span><span>Two weeks</span>
          <span class="wiz-choice-sub">Ten days, alternating week 1 and week 2.</span>
        </button>
      </div>`;
    body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-weeks]');
      if (!b) return;
      draft.rotationWeeks = Number(b.dataset.weeks);
      body.querySelectorAll('[data-weeks]').forEach((o) => o.classList.toggle('is-on', o === b));
      refresh(0);
      setTimeout(() => advance(0), 180);
    });
  }

  /* ── Step 2: periods ───────────────────────────────────────── */

  function buildPeriods(body) {
    createPeriodEditor(body, {
      periods: draft.periods,
      onChange: () => refresh(1),
    });
  }

  /* ── Step 3: the rotation grid ─────────────────────────────── */

  function buildPattern(body, panel) {
    body.innerHTML = '<div class="grid-scroll"><div class="grid-host"></div></div>';
    panel.dataset.needsGrid = '1';
    panel._mountGrid = () => {
      body.querySelector('.grid-host').innerHTML = '';
      createGrid(body.querySelector('.grid-host'), {
        periods: draft.periods,
        pattern: draft.pattern,
        rotationWeeks: draft.rotationWeeks,
        onChange: () => refresh(2),
      });
    };
    panel._mountGrid();
  }

  /* ── Step 4: the year ──────────────────────────────────────── */

  function buildYear(body, panel) {
    const today = todayISO();
    draft.startDate ||= mondayOf(today);
    draft.endDate ||= addDays(mondayOf(today), 7 * 18 + 4);
    panel._mountYear = () => {
      body.innerHTML = '';
      createYearView(body, { draft, onChange: () => refresh(3) });
    };
    panel._mountYear();
  }

  /* ── Step 5: name it ───────────────────────────────────────── */

  function buildName(body) {
    body.innerHTML = `
      <input class="dlg-input wiz-nameinput" placeholder="My timetable" aria-label="Name">
      <p class="wiz-summary"></p>`;
    const input = body.querySelector('input');
    input.addEventListener('input', () => { draft.name = input.value; refresh(4); });
    body.querySelector('.wiz-summary').textContent = summary();
    requestAnimationFrame(() => input.focus());
  }

  function summary() {
    const weeks = draft.rotationWeeks === 2 ? 'Two-week rotation' : 'One-week rotation';
    const off = Object.keys(draft.calendar.dayStates).length;
    return `${weeks}, ${draft.periods.length} periods a day, `
      + `${Object.keys(draft.pattern).length} entries, `
      + `${weekCount(draft)} weeks, ${off} day${off === 1 ? '' : 's'} marked.`;
  }

  function finish() {
    const tt = newTimetable({
      name: draft.name.trim(),
      rotationWeeks: draft.rotationWeeks,
      startDate: draft.startDate,
      endDate: draft.endDate,
      periods: draft.periods,
      pattern: draft.pattern,
      calendar: {
        weekTypes: draft.rotationWeeks === 2
          ? (draft.calendar.weekTypes.length ? draft.calendar.weekTypes : defaultWeekTypes(draft))
          : [],
        dayStates: draft.calendar.dayStates,
      },
    });
    onDone(tt);
  }

  addPanel(0);
  requestAnimationFrame(() => { scrollToPanel(0, false); updateDepth(); });
}

/* Shared with the timetable view: distance-scaled easing so a long move
   reads as travel rather than a jump. */
function easeScroll(el, target, animate) {
  const from = el.scrollLeft;
  const to = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, target));
  const distance = Math.abs(to - from);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!animate || reduced || distance < 2) { el.scrollLeft = to; return; }

  const duration = Math.min(900, Math.max(380, 320 + distance * 0.4));
  const snap = el.style.scrollSnapType;
  el.style.scrollSnapType = 'none';
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

/* Changing the year after setup: which days you are off, and which weeks are
   week 1.

   The week toggles have always rippled forward correctly, but they only ever
   existed inside the wizard, so the only way to reach them was to build a new
   timetable and lose everything. This is the same door as "Edit times".

   Only `calendar` and the two dates are touched here. The rotation pattern and
   every dated override survive untouched. */

import { createYearView } from './yearview.js';

export function openYearEditor(tt, { onClose }) {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `
    <div class="sheet-bar">
      <h2 class="ask sheet-ask">Which days are you off?</h2>
      <div class="sheet-actions">
        <span class="sheet-note">Changing a week ripples forward from there.</span>
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="button" class="btn btn-primary" data-done>Done</button>
      </div>
    </div>
    <div class="sheet-body"><div class="sheet-narrow"></div></div>
  `;
  document.body.appendChild(el);

  // Work on a copy of just the parts this screen owns, so cancelling really
  // cancels and nothing else can be caught in the crossfire.
  const working = {
    rotationWeeks: tt.rotationWeeks,
    startDate: tt.startDate,
    endDate: tt.endDate,
    calendar: JSON.parse(JSON.stringify(tt.calendar || { weekTypes: [], dayStates: {} })),
  };

  const done = el.querySelector('[data-done]');
  createYearView(el.querySelector('.sheet-narrow'), {
    draft: working,
    onChange() {
      done.disabled = !working.startDate || !working.endDate
        || working.endDate <= working.startDate;
    },
  });

  const close = (commit) => {
    document.removeEventListener('keydown', onKey);
    el.remove();
    onClose?.(commit ? working : null);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(false); };
  document.addEventListener('keydown', onKey);
  el.querySelector('[data-cancel]').addEventListener('click', () => close(false));
  done.addEventListener('click', () => close(true));
}

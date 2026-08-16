/* Changing the shape of the day after setup.

   A wrong time entered in the wizard used to be permanent, which made a
   typo like 03:30 instead of 15:30 unfixable. Everything keeps its id, so
   editing a period's times moves every entry sitting in it, and deleting a
   period drops whatever was in it (resolve.js already ignores entries whose
   period has gone). */

import { validatePeriods, sortPeriods } from './model.js';
import { createPeriodEditor } from './periods.js';

export function openPeriodEditor(tt, { onClose }) {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `
    <div class="sheet-bar">
      <h2 class="ask sheet-ask">How is each day structured?</h2>
      <div class="sheet-actions">
        <span class="sheet-note">Changing a time moves everything in that period.</span>
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="button" class="btn btn-primary" data-done>Done</button>
      </div>
    </div>
    <div class="sheet-body"><div class="sheet-narrow"></div></div>
  `;
  document.body.appendChild(el);

  // Work on a copy so cancelling really cancels.
  const working = JSON.parse(JSON.stringify(tt.periods));
  const done = el.querySelector('[data-done]');

  createPeriodEditor(el.querySelector('.sheet-narrow'), {
    periods: working,
    onChange() {
      done.disabled = working.length === 0 || validatePeriods(working).length > 0;
    },
  });

  const close = (commit) => {
    document.removeEventListener('keydown', onKey);
    el.remove();
    onClose?.(commit ? sortPeriods(working) : null);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(false); };
  document.addEventListener('keydown', onKey);
  el.querySelector('[data-cancel]').addEventListener('click', () => close(false));
  done.addEventListener('click', () => close(true));
}

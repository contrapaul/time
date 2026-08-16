/* Changing the rotation itself, as opposed to one day of it.

   This is the other half of decision 5. The timetable view only ever writes
   dated overrides; every-occurrence changes happen here, on a separate
   screen, using the same grid the wizard used. */

import { createGrid } from './grid.js';
import { escapeHtml } from './palette.js';

export function openPatternEditor(tt, { onClose }) {
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `
    <div class="sheet-bar">
      <h2 class="ask sheet-ask">What do you teach, and when?</h2>
      <div class="sheet-actions">
        <span class="sheet-note">Changes here apply to every week.</span>
        <button type="button" class="btn btn-primary" data-done>Done</button>
      </div>
    </div>
    <div class="sheet-body"><div class="grid-scroll"><div class="grid-host"></div></div></div>
  `;
  document.body.appendChild(el);

  // Edit a copy, so backing out leaves the real timetable untouched.
  const working = JSON.parse(JSON.stringify(tt.pattern));

  createGrid(el.querySelector('.grid-host'), {
    periods: tt.periods,
    pattern: working,
    rotationWeeks: tt.rotationWeeks,
  });

  const close = (commit) => {
    document.removeEventListener('keydown', onKey);
    el.remove();
    onClose?.(commit ? working : null);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(false); };
  document.addEventListener('keydown', onKey);
  el.querySelector('[data-done]').addEventListener('click', () => close(true));

  return () => close(false);
}

export { escapeHtml };

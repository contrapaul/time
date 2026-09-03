/* Handing the timetable to Outlook.

   Every period is ticked to begin with: the file should match the schedule
   unless someone says otherwise. Untick recess if a 25 minute break has no
   business being an appointment. */

import { escapeHtml } from './palette.js';
import { toICS } from './ics.js';

function fileName(tt) {
  const slug = (tt.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'timetable'}.ics`;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function openExport(tt) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dlg';
    document.body.appendChild(el);

    const close = () => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      resolve();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    el.innerHTML = `
      <div class="dlg-scrim" data-close></div>
      <div class="dlg-box" role="dialog" aria-modal="true" aria-label="Export">
        <h2 class="ask dlg-ask">What should Outlook show?</h2>
        <div class="dlg-periods">
          ${(tt.periods || []).map((p) => `
            <label class="dlg-check">
              <input type="checkbox" checked value="${escapeHtml(p.id)}">
              <span class="dlg-q">${escapeHtml(p.name)}</span>
              <span class="dlg-when">${escapeHtml(p.start)} to ${escapeHtml(p.end)}</span>
            </label>`).join('')}
        </div>
        <p class="dlg-note">Importing again adds a second copy, so delete the old calendar first.</p>
        <div class="dlg-actions">
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="button" class="btn btn-primary" data-download>Download</button>
        </div>
      </div>`;

    const boxes = [...el.querySelectorAll('.dlg-periods input')];
    const button = el.querySelector('[data-download]');
    const sync = () => { button.disabled = !boxes.some((b) => b.checked); };
    boxes.forEach((b) => b.addEventListener('change', sync));

    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    button.addEventListener('click', () => {
      const periodIds = boxes.filter((b) => b.checked).map((b) => b.value);
      download(fileName(tt), toICS(tt, { periodIds, now: Date.now() }));
      close();
    });
  });
}

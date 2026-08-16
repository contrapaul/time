/* The slot dialog. Every label is a question. */

import { PALETTE, readableOn, escapeHtml } from './palette.js';
import { minutesOf, hhmmOf } from './model.js';

let openDialog = null;

/**
 * Ask about one slot. Resolves with an entry, 'remove', or null for cancel.
 *
 * `periods` and `periodIndex` are what let "How long?" offer whole periods
 * rather than making anyone type times they already described in step 2.
 */
export function askAboutSlot({ entry, periods, periodIndex, canRepeat, repeatLabel }) {
  return new Promise((resolve) => {
    openDialog?.();

    const existing = entry || null;
    const period = periods[periodIndex];
    const colour = existing?.color || PALETTE[0];

    const el = document.createElement('div');
    el.className = 'dlg';
    el.innerHTML = `
      <div class="dlg-scrim" data-close></div>
      <form class="dlg-box" role="dialog" aria-modal="true" aria-label="Slot details">
        <label class="dlg-field">
          <span class="dlg-q">What is it?</span>
          <input name="name" class="dlg-input" autocomplete="off" required
                 value="${escapeHtml(existing?.name || '')}">
        </label>

        <label class="dlg-field">
          <span class="dlg-q">Where?</span>
          <input name="location" class="dlg-input" autocomplete="off"
                 value="${escapeHtml(existing?.location || '')}">
        </label>

        <label class="dlg-field">
          <span class="dlg-q">Anything else?</span>
          <input name="detail" class="dlg-input" autocomplete="off"
                 value="${escapeHtml(existing?.detail || '')}">
        </label>

        <fieldset class="dlg-field">
          <legend class="dlg-q">How long?</legend>
          <div class="dlg-lengths">${lengthOptions(periods, periodIndex, existing)}</div>
          <div class="dlg-times" hidden>
            <input name="start" type="time" class="dlg-input dlg-time"
                   value="${existing?.start || period.start}">
            <input name="end" type="time" class="dlg-input dlg-time"
                   value="${existing?.end || period.end}">
          </div>
        </fieldset>

        <fieldset class="dlg-field">
          <legend class="dlg-q">Which colour?</legend>
          <div class="dlg-colours">
            ${PALETTE.map((c) => `
              <button type="button" class="dlg-swatch${c === colour ? ' is-on' : ''}"
                      data-colour="${c}" style="--c:${c}; --fg:${readableOn(c)}"
                      aria-label="${c}"></button>`).join('')}
            <input type="color" name="custom" class="dlg-custom" value="${colour}"
                   aria-label="A colour of your own">
          </div>
        </fieldset>

        ${canRepeat ? `
        <label class="dlg-check">
          <input type="checkbox" name="repeat">
          <span class="dlg-q">${escapeHtml(repeatLabel)}</span>
        </label>` : ''}

        <div class="dlg-actions">
          ${existing ? '<button type="button" class="btn btn-danger" data-remove>Remove</button>' : ''}
          <button type="button" class="btn" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">${existing ? 'Save' : 'Add'}</button>
        </div>
      </form>
    `;

    document.body.appendChild(el);
    const form = el.querySelector('.dlg-box');
    const times = el.querySelector('.dlg-times');
    let chosen = colour;

    const syncLengthUI = () => {
      const mode = form.querySelector('[name="length"]:checked')?.value;
      times.hidden = mode !== 'custom';
    };
    form.querySelectorAll('[name="length"]').forEach((r) =>
      r.addEventListener('change', syncLengthUI));
    syncLengthUI();

    el.querySelectorAll('.dlg-swatch').forEach((b) => {
      b.addEventListener('click', () => {
        chosen = b.dataset.colour;
        el.querySelectorAll('.dlg-swatch').forEach((o) => o.classList.toggle('is-on', o === b));
      });
    });
    form.custom.addEventListener('input', (e) => {
      chosen = e.target.value;
      el.querySelectorAll('.dlg-swatch').forEach((o) => o.classList.remove('is-on'));
    });

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      openDialog = null;
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    openDialog = () => close(null);

    el.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => close(null)));
    el.querySelector('[data-remove]')?.addEventListener('click', () => close('remove'));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      if (!name) return form.name.focus();

      const mode = form.querySelector('[name="length"]:checked').value;
      let start;
      let end;
      if (mode === 'custom') {
        start = form.start.value;
        end = form.end.value;
        if (minutesOf(end) <= minutesOf(start)) return form.end.focus();
      } else {
        const span = Number(mode);
        start = periods[periodIndex].start;
        end = periods[Math.min(periods.length - 1, periodIndex + span - 1)].end;
      }

      // Only carry times when they differ from the slot, so the common case
      // stays a plain slot entry that follows its period if the period moves.
      const fitsSlot = start === period.start && end === period.end;
      close({
        entry: {
          id: existing?.id || crypto.randomUUID(),
          name,
          location: form.location.value.trim(),
          detail: form.detail.value.trim(),
          color: chosen,
          ...(fitsSlot ? {} : { start, end }),
        },
        repeat: canRepeat && form.repeat.checked,
      });
    });

    requestAnimationFrame(() => form.name.focus());
  });
}

function lengthOptions(periods, periodIndex, existing) {
  const period = periods[periodIndex];
  const remaining = periods.length - periodIndex;
  const opts = [];

  for (let span = 1; span <= Math.min(3, remaining); span++) {
    const end = periods[periodIndex + span - 1].end;
    const mins = minutesOf(end) - minutesOf(period.start);
    const label = span === 1
      ? `${periods[periodIndex].name} (${mins} min)`
      : `${span} periods (${mins} min)`;
    opts.push({ value: String(span), label, end });
  }

  const isCustom = existing?.start
    && !opts.some((o) => existing.start === period.start && existing.end === o.end);
  const checked = isCustom
    ? 'custom'
    : (opts.find((o) => existing?.end === o.end)?.value || '1');

  return opts.map((o) => `
    <label class="dlg-radio">
      <input type="radio" name="length" value="${o.value}" ${checked === o.value ? 'checked' : ''}>
      <span>${escapeHtml(o.label)}</span>
    </label>`).join('') + `
    <label class="dlg-radio">
      <input type="radio" name="length" value="custom" ${checked === 'custom' ? 'checked' : ''}>
      <span>Other times</span>
    </label>`;
}

export { hhmmOf };

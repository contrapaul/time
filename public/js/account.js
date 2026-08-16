/* Signing in, and the dialog that does it. */

import { Api } from './api.js';
import { escapeHtml } from './palette.js';

const MODES = {
  in:     { ask: 'Welcome back. Who are you?', submit: 'Sign in' },
  up:     { ask: 'Want your timetable on every device?', submit: 'Create account' },
  forgot: { ask: 'What is your email address?', submit: 'Send a reset link' },
  reset:  { ask: 'What should your new password be?', submit: 'Save it' },
};

export function openAccount(mode = 'in', token = null) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'dlg';
    document.body.appendChild(el);

    let current = mode;

    const draw = () => {
      const m = MODES[current];
      el.innerHTML = `
        <div class="dlg-scrim" data-close></div>
        <form class="dlg-box" role="dialog" aria-modal="true" aria-label="Account">
          <h2 class="ask dlg-ask">${escapeHtml(m.ask)}</h2>

          ${current === 'reset' ? '' : `
          <label class="dlg-field"><span class="dlg-q">Email?</span>
            <input name="email" type="email" class="dlg-input" autocomplete="email" required>
          </label>`}

          ${current === 'up' ? `
          <label class="dlg-field"><span class="dlg-q">Pick a username?</span>
            <input name="username" class="dlg-input" autocomplete="username" required>
          </label>` : ''}

          ${current === 'forgot' ? '' : `
          <label class="dlg-field"><span class="dlg-q">Password?</span>
            <input name="password" type="password" class="dlg-input"
                   autocomplete="${current === 'in' ? 'current-password' : 'new-password'}" required>
          </label>`}

          <p class="dlg-error" hidden></p>

          <div class="dlg-actions">
            <button type="button" class="btn" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">${m.submit}</button>
          </div>

          <div class="dlg-switch">
            ${current === 'in' ? '<button type="button" class="linkish" data-mode="up">New here?</button>' : ''}
            ${current === 'up' ? '<button type="button" class="linkish" data-mode="in">Already have an account?</button>' : ''}
            ${current === 'in' ? '<button type="button" class="linkish" data-mode="forgot">Forgotten your password?</button>' : ''}
            ${current === 'forgot' ? '<button type="button" class="linkish" data-mode="in">Remembered it?</button>' : ''}
          </div>
        </form>
      `;
      wire();
    };

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);

    function wire() {
      const form = el.querySelector('form');
      const errEl = el.querySelector('.dlg-error');
      el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(null)));
      el.querySelectorAll('[data-mode]').forEach((b) =>
        b.addEventListener('click', () => { current = b.dataset.mode; draw(); }));

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errEl.hidden = true;
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        try {
          if (current === 'in') {
            await Api.login(form.email.value.trim(), form.password.value);
            close('signed-in');
          } else if (current === 'up') {
            await Api.signup(form.email.value.trim(), form.username.value.trim(), form.password.value);
            close('signed-up');
          } else if (current === 'forgot') {
            await Api.requestReset(form.email.value.trim());
            close('reset-sent');
          } else {
            await Api.resetPassword(token, form.password.value);
            close('reset-done');
          }
        } catch (err) {
          errEl.textContent = err.message;
          errEl.hidden = false;
          submit.disabled = false;
        }
      });

      requestAnimationFrame(() => form.querySelector('input')?.focus());
    }

    draw();
  });
}

/**
 * Deal with a link arrived at from email, then clean the address bar so a
 * refresh does not try to spend the token twice.
 */
export async function handleAuthLinks() {
  const params = new URLSearchParams(location.search);
  const verify = params.get('verify');
  const reset = params.get('reset');
  if (!verify && !reset) return null;

  history.replaceState(null, '', location.pathname);

  if (verify) {
    try {
      await Api.verifyEmail(verify);
      await Api.me();
      return 'Email verified.';
    } catch (e) {
      return e.message;
    }
  }

  const outcome = await openAccount('reset', reset);
  return outcome === 'reset-done' ? 'Password changed. Sign in with it.' : null;
}

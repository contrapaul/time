/* Handing your timetable to someone else.

   The link is an unguessable token rather than the timetable's id, because a
   teaching schedule is a map of where a person is all day. Turning sharing
   off, or sharing again, both rotate the token, so a link given to the wrong
   person can always be taken back. */

import { Api } from './api.js';
import { escapeHtml } from './palette.js';

export function shareUrl(token) {
  return `${location.origin}/s/${token}`;
}

export function openShare(tt) {
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

    const draw = (state) => {
      el.innerHTML = `
        <div class="dlg-scrim" data-close></div>
        <div class="dlg-box" role="dialog" aria-modal="true" aria-label="Sharing">
          <h2 class="ask dlg-ask">Who needs to see this?</h2>
          ${state.body}
          <div class="dlg-actions">${state.actions}</div>
        </div>`;
      el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
      state.wire?.();
    };

    const loading = () => draw({
      body: '<p class="dlg-note">One moment.</p>',
      actions: '<button type="button" class="btn" data-close>Close</button>',
    });

    const showLink = (token) => draw({
      body: `
        <p class="dlg-note">Anyone with this link can see it. Nobody can change it.</p>
        <input class="dlg-input dlg-link" readonly value="${escapeHtml(shareUrl(token))}">
      `,
      actions: `
        <button type="button" class="btn btn-danger" data-stop>Stop sharing</button>
        <button type="button" class="btn" data-close>Close</button>
        <button type="button" class="btn btn-primary" data-copy>Copy link</button>
      `,
      wire() {
        const input = el.querySelector('.dlg-link');
        input.addEventListener('focus', () => input.select());
        el.querySelector('[data-copy]').addEventListener('click', async (ev) => {
          input.select();
          try {
            await navigator.clipboard.writeText(input.value);
          } catch {
            document.execCommand('copy'); // older browsers, and non-secure origins
          }
          ev.target.textContent = 'Copied';
          setTimeout(() => { ev.target.textContent = 'Copy link'; }, 1600);
        });
        el.querySelector('[data-stop]').addEventListener('click', async () => {
          loading();
          await Api.unshareTimetable(tt.id);
          showOffer();
        });
      },
    });

    const showOffer = () => draw({
      body: '<p class="dlg-note">A link lets a colleague see this timetable without an account.</p>',
      actions: `
        <button type="button" class="btn" data-close>Close</button>
        <button type="button" class="btn btn-primary" data-make>Make a link</button>
      `,
      wire() {
        el.querySelector('[data-make]').addEventListener('click', async () => {
          loading();
          try {
            const { shareToken } = await Api.shareTimetable(tt.id);
            showLink(shareToken);
          } catch (e) {
            showError(e.message, e.status === 403);
          }
        });
      },
    });

    const showError = (message, offerResend) => draw({
      body: `<p class="dlg-error">${escapeHtml(message)}</p>`,
      actions: `
        ${offerResend ? '<button type="button" class="btn" data-resend>Send it again</button>' : ''}
        <button type="button" class="btn" data-close>Close</button>`,
      wire() {
        el.querySelector('[data-resend]')?.addEventListener('click', async (ev) => {
          ev.target.disabled = true;
          try {
            await Api.resendVerify();
            ev.target.textContent = 'Sent';
          } catch (e) {
            ev.target.textContent = e.message;
          }
        });
      },
    });

    const showSignIn = () => draw({
      body: '<p class="dlg-note">Sharing needs an account, so the link has somewhere to live.</p>',
      actions: '<button type="button" class="btn" data-close>Close</button>',
    });

    (async () => {
      if (!Api.user) return showSignIn();
      loading();
      try {
        const { timetable } = await Api.getTimetable(tt.id);
        if (timetable.shareToken) showLink(timetable.shareToken);
        else showOffer();
      } catch {
        // Not on the server yet: the debounced push has not landed.
        showOffer();
      }
    })();
  });
}

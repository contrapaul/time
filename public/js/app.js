import {
  activeTimetable, listTimetables, save, setActive, syncAll, onSync, flushPending,
} from './store.js';
import { Api } from './api.js';
import { migrate } from './model.js';
import { escapeHtml } from './palette.js';
import { openAccount, handleAuthLinks } from './account.js';
import { openShare } from './share.js';
import { demoTimetable } from './demo.js';
import { mount } from './timetable.js';
import { mountWizard } from './wizard.js';
import { openPatternEditor } from './patterneditor.js';
import { openPeriodEditor } from './periodeditor.js';
import { openYearEditor } from './yeareditor.js';

const root = document.getElementById('app');
let unmount = null;
let wantWizard = false;

/** A share link is the only route this app has. */
function sharedToken() {
  const m = location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/);
  return m ? m[1] : null;
}

function render() {
  unmount?.();
  unmount = null;
  root.className = '';
  const tt = wantWizard ? null : activeTimetable();
  if (tt) showTimetable(tt);
  else startWizard();
}

async function showShared(token) {
  root.className = '';
  root.innerHTML = '<div class="empty"><h1 class="ask">Fetching that timetable.</h1></div>';
  try {
    const { timetable } = await Api.getShared(token);
    const tt = migrate({ ...timetable.data, id: timetable.id, name: timetable.name });
    // Your own timetable, if you have one, so it can be laid over theirs.
    unmount = mount(root, tt, {
      readOnly: true,
      owner: timetable.owner,
      mine: activeTimetable(),
    });
  } catch (e) {
    root.innerHTML = `
      <div class="empty">
        <h1 class="ask">${escapeHtml(e.message)}</h1>
        <a class="btn" href="/">Open your own</a>
      </div>`;
  }
}

function showTimetable(tt) {
  unmount = mount(root, tt, {
    onChange: save,
    timetables: listTimetables(),
    user: Api.user,
    onSwitch(id) { setActive(id); render(); },
    onAccount: accountAction,
    onShare() { openShare(tt); },
    onEditPattern() {
      openPatternEditor(tt, {
        onClose(pattern) {
          if (!pattern) return;
          tt.pattern = pattern;
          save(tt);
          render();
        },
      });
    },
    onEditYear() {
      openYearEditor(tt, {
        onClose(next) {
          if (!next) return;
          // Only the calendar and the dates. The pattern and every dated
          // override are left exactly as they were.
          tt.startDate = next.startDate;
          tt.endDate = next.endDate;
          tt.calendar = next.calendar;
          save(tt);
          render();
        },
      });
    },
    onEditPeriods() {
      openPeriodEditor(tt, {
        onClose(periods) {
          if (!periods) return;
          tt.periods = periods;
          save(tt);
          render();
        },
      });
    },
    // Making a new one never discards the old one; the bar grows a picker.
    onNew() { wantWizard = true; render(); },
  });
}

async function accountAction() {
  if (Api.user) {
    await Api.logout();
    render();
    return;
  }
  const outcome = await openAccount('in');
  if (!outcome) return;
  await syncAll();
  render();
}

function startWizard() {
  root.className = 'is-wizard';
  const hasLocal = listTimetables().length > 0;
  root.innerHTML = `
    <header class="wiz-top">
      <div class="wiz-brand">
        <span class="wiz-wordmark">time.contrapaul.com</span>
        <span class="wiz-tagline">A timetable that knows what day it is.</span>
      </div>
      <div class="wiz-top-actions">
        <button type="button" class="btn" data-act="sample">See an example</button>
        ${hasLocal ? '<button type="button" class="btn" data-act="back">Back to my timetable</button>' : ''}
        <button type="button" class="btn" data-act="login">${
          Api.user ? escapeHtml(Api.user.username) : 'Log in'
        }</button>
      </div>
    </header>
    <div class="wiz-stage"></div>
    <footer class="site-footer wiz-bottom">
      A project by Mr. K, more at <a href="https://contrapaul.com">contrapaul.com</a>
    </footer>
  `;

  mountWizard(root.querySelector('.wiz-stage'), {
    onDone(tt) {
      wantWizard = false;
      save(tt);
      render();
    },
  });

  root.querySelector('.wiz-top').addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'sample') { wantWizard = false; save(demoTimetable()); render(); }
    if (act === 'back') { wantWizard = false; render(); }
    if (act === 'login') wizardAccount();
  });
}

/**
 * Signing in from the wizard.
 *
 * Someone returning on a second device arrives with no session and no local
 * data, so the wizard is all they see. Without this they can only build a
 * second timetable or poke at the sample, with their real one sitting in the
 * cloud behind a door that was not on the page.
 */
async function wizardAccount() {
  if (Api.user) {
    await Api.logout();
    render();
    return;
  }
  const outcome = await openAccount('in');
  if (!outcome) return;
  await syncAll();
  // Whatever came down from the cloud is what they came back for.
  wantWizard = false;
  render();
}

/* ── Sync status ─────────────────────────────────────────────── */

const LABELS = {
  saving: 'Saving',
  saved: 'Saved',
  offline: 'Offline, saved on this device',
};

function showSync(text, state) {
  const el = document.querySelector('.bar-sync');
  if (!el) return null;
  el.textContent = text;
  el.dataset.state = state;
  return el;
}

onSync((status) => {
  if (status === 'replaced') {
    // Redraw first: render() rebuilds the bar, so a message set before it
    // would be wiped by the very update that makes the message true.
    render();
    showSync('Replaced by a newer copy', 'warn');
    return;
  }
  const el = showSync(LABELS[status] || '', status);
  if (el && status === 'saved') {
    setTimeout(() => { if (el.textContent === 'Saved') el.textContent = ''; }, 2000);
  }
});

/* Do not lose the last second and a half of edits to a closing tab. */
window.addEventListener('pagehide', flushPending);

/* ── Boot ────────────────────────────────────────────────────── */

const token = sharedToken();

if (token) {
  // Someone else's timetable. No local data is touched, and no account is
  // needed to look.
  showShared(token);
} else {
  render();
  (async () => {
    await Api.me();
    const message = await handleAuthLinks();
    if (Api.user) await syncAll();
    if (Api.user || message) render();
    if (message) console.info(message);
  })();
}

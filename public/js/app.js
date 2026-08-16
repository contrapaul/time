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
    unmount = mount(root, tt, { readOnly: true, owner: timetable.owner });
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
  mountWizard(root, {
    onDone(tt) {
      wantWizard = false;
      save(tt);
      render();
    },
  });
  addSampleEscape();
  if (listTimetables().length) addBackOut();
}

/* Until there is a timetable to look at, offer one to look at. */
function addSampleEscape() {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'sample-link';
  link.textContent = 'Or see an example';
  link.addEventListener('click', () => {
    wantWizard = false;
    save(demoTimetable());
    render();
  });
  root.appendChild(link); // outside .wiz, which is a scroll container
}

/* Started a new one by mistake? The old one is still there. */
function addBackOut() {
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'sample-link sample-link-right';
  back.textContent = 'Back to my timetable';
  back.addEventListener('click', () => { wantWizard = false; render(); });
  root.appendChild(back);
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

import {
  activeTimetable, listTimetables, save, setActive, syncAll, onSync, flushPending,
} from './store.js';
import { Api } from './api.js';
import { openAccount, handleAuthLinks } from './account.js';
import { demoTimetable } from './demo.js';
import { mount } from './timetable.js';
import { mountWizard } from './wizard.js';
import { openPatternEditor } from './patterneditor.js';

const root = document.getElementById('app');
let unmount = null;
let wantWizard = false;

function render() {
  unmount?.();
  unmount = null;
  root.className = '';
  const tt = wantWizard ? null : activeTimetable();
  if (tt) showTimetable(tt);
  else startWizard();
}

function showTimetable(tt) {
  unmount = mount(root, tt, {
    onChange: save,
    timetables: listTimetables(),
    user: Api.user,
    onSwitch(id) { setActive(id); render(); },
    onAccount: accountAction,
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

render();

(async () => {
  await Api.me();
  const message = await handleAuthLinks();
  if (Api.user) await syncAll();
  if (Api.user || message) render();
  if (message) console.info(message);
})();

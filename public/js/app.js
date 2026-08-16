import { activeTimetable, listTimetables, save, setActive } from './store.js';
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
    onSwitch(id) { setActive(id); render(); },
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

/* Started a new one by mistake? The old one is still there. */
function addBackOut() {
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'sample-link sample-link-right';
  back.textContent = 'Back to my timetable';
  back.addEventListener('click', () => { wantWizard = false; render(); });
  root.appendChild(back);
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

render();

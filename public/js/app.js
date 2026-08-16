import { activeTimetable, save } from './store.js';
import { demoTimetable } from './demo.js';
import { mount } from './timetable.js';
import { mountWizard } from './wizard.js';

const root = document.getElementById('app');
let unmount = null;

function render() {
  unmount?.();
  unmount = null;
  root.className = '';
  const tt = activeTimetable();
  if (tt) unmount = mount(root, tt);
  else startWizard();
}

function startWizard() {
  root.className = 'is-wizard';
  mountWizard(root, {
    onDone(tt) {
      save(tt);
      render();
    },
  });
  addSampleEscape();
}

/* Until there is a timetable to look at, offer one to look at. */
function addSampleEscape() {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'sample-link';
  link.textContent = 'Or see an example';
  link.addEventListener('click', () => { save(demoTimetable()); render(); });
  root.appendChild(link); // outside .wiz, which is a scroll container
}

render();

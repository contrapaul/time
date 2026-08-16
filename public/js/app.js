import { activeTimetable, save } from './store.js';
import { demoTimetable } from './demo.js';
import { mount } from './timetable.js';

const root = document.getElementById('app');
let unmount = null;

function render() {
  unmount?.();
  const tt = activeTimetable();
  if (!tt) return renderEmpty();
  unmount = mount(root, tt);
}

function renderEmpty() {
  root.innerHTML = `
    <div class="empty">
      <h1 class="ask">What do you want to schedule first?</h1>
      <button class="btn" data-act="demo">See an example</button>
    </div>
  `;
  root.querySelector('[data-act="demo"]').addEventListener('click', () => {
    save(demoTimetable());
    render();
  });
}

render();

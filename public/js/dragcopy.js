/* Drag an entry to copy it somewhere else.

   Pointer events rather than HTML5 drag-and-drop: this gives a real ghost
   that follows the cursor, and it is the interaction that turns eight classes
   spread across six slots into a few seconds of work.

   Used twice, with different shapes: the setup grid drags cells into cells,
   and the timetable drags entries into free periods on any day. */

const THRESHOLD = 4; // px of travel before a click becomes a drag

export function enableDragCopy(container, {
  onCopy,
  handle = '.cell-entry',
  source = '.cell',
  target = '.cell',
  keyOf = (el) => el.dataset.slot,
}) {
  let start = null;
  let ghost = null;
  let lastTarget = null;

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-remove]')) return; // the X is not a handle
    const el = e.target.closest(handle);
    if (!el) return;
    const from = el.closest(source);
    if (!from) return;
    start = { x: e.clientX, y: e.clientY, el, from, id: e.pointerId };
  });

  container.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;

    if (!ghost) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return;
      ghost = start.el.cloneNode(true);
      ghost.classList.add('is-ghost');
      const r = start.el.getBoundingClientRect();
      ghost.style.width = `${r.width}px`;
      ghost.style.height = `${Math.min(r.height, 90)}px`;
      document.body.appendChild(ghost);
      start.el.classList.add('is-source');
      container.classList.add('is-dragging');
      container.setPointerCapture(e.pointerId);
    }

    ghost.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 8}px)`;

    // The ghost sits under the cursor, so it has to be ignored while looking.
    ghost.style.pointerEvents = 'none';
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest(target);
    if (hit !== lastTarget) {
      lastTarget?.classList.remove('is-target');
      hit?.classList.add('is-target');
      lastTarget = hit;
    }
  });

  const finish = () => {
    if (!start) return;
    if (ghost) {
      const to = lastTarget;
      const from = start.from;
      const el = start.el;
      cleanup();
      // A pointerup is followed by a click, which would open the dialog for
      // whatever the drag landed on. Swallow exactly one.
      container.addEventListener('click', (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      }, { capture: true, once: true });
      if (to && to !== from) onCopy(keyOf(from), keyOf(to), { from, to, el });
    }
    start = null;
  };

  const cleanup = () => {
    ghost?.remove();
    ghost = null;
    lastTarget?.classList.remove('is-target');
    lastTarget = null;
    container.querySelector('.is-source')?.classList.remove('is-source');
    container.classList.remove('is-dragging');
  };

  container.addEventListener('pointerup', finish);
  container.addEventListener('pointercancel', () => { cleanup(); start = null; });
}

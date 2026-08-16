/* Drag an entry to copy it into another slot.
   Pointer events rather than HTML5 drag-and-drop: this gives a real ghost
   that follows the cursor, and it is the interaction that turns eight classes
   spread across six slots into a few seconds of work. */

const THRESHOLD = 4; // px of travel before a click becomes a drag

export function enableDragCopy(container, { onCopy }) {
  let start = null;
  let ghost = null;
  let lastSlot = null;

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-remove]')) return; // the X is not a handle
    const entry = e.target.closest('.cell-entry');
    if (!entry) return;
    const from = entry.closest('.cell')?.dataset.slot;
    if (!from) return;
    start = { x: e.clientX, y: e.clientY, entry, from, id: e.pointerId };
  });

  container.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;

    if (!ghost) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < THRESHOLD) return;
      ghost = start.entry.cloneNode(true);
      ghost.classList.add('is-ghost');
      const r = start.entry.getBoundingClientRect();
      ghost.style.width = `${r.width}px`;
      ghost.style.height = `${r.height}px`;
      document.body.appendChild(ghost);
      start.entry.classList.add('is-source');
      container.classList.add('is-dragging');
      container.setPointerCapture(e.pointerId);
    }

    ghost.style.transform = `translate(${e.clientX + 10}px, ${e.clientY + 8}px)`;

    // The ghost sits under the cursor, so it has to be ignored while looking.
    ghost.style.pointerEvents = 'none';
    const slot = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell');
    if (slot !== lastSlot) {
      lastSlot?.classList.remove('is-target');
      slot?.classList.add('is-target');
      lastSlot = slot;
    }
  });

  const finish = (e) => {
    if (!start) return;
    if (ghost) {
      const to = lastSlot?.dataset.slot;
      cleanup();
      if (to && to !== start.from) onCopy(start.from, to);
    }
    start = null;
  };

  const cleanup = () => {
    ghost?.remove();
    ghost = null;
    lastSlot?.classList.remove('is-target');
    lastSlot = null;
    container.querySelector('.is-source')?.classList.remove('is-source');
    container.classList.remove('is-dragging');
  };

  container.addEventListener('pointerup', finish);
  container.addEventListener('pointercancel', () => { cleanup(); start = null; });
}

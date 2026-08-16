/* Local persistence. The cloud half arrives in Phase 4; nothing here should
   need changing when it does, beyond store() also queueing a push. */

const KEY = 'time.v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { timetables: [], activeId: null };
  } catch {
    return { timetables: [], activeId: null };
  }
}

function write(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function listTimetables() {
  return read().timetables;
}

export function activeTimetable() {
  const { timetables, activeId } = read();
  return timetables.find((t) => t.id === activeId) || timetables[0] || null;
}

export function save(tt) {
  const state = read();
  tt.updatedAt = Date.now();
  const i = state.timetables.findIndex((t) => t.id === tt.id);
  if (i === -1) state.timetables.push(tt);
  else state.timetables[i] = tt;
  state.activeId = tt.id;
  write(state);
  return tt;
}

export function setActive(id) {
  const state = read();
  state.activeId = id;
  write(state);
}

export function remove(id) {
  const state = read();
  state.timetables = state.timetables.filter((t) => t.id !== id);
  if (state.activeId === id) state.activeId = state.timetables[0]?.id || null;
  write(state);
}

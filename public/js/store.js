/* Local persistence, and the cloud following it.

   Local is always the working copy: every edit lands in localStorage
   synchronously and the network happens afterwards. Signing out, going
   offline, or never having an account all leave the app fully usable.

   `synced[id]` is the server's updatedAt as of our last successful exchange.
   It is what a PUT sends as baseUpdatedAt, and it is the whole of the stale
   write guard. */

import { Api } from './api.js';
import { migrate } from './model.js';

const KEY = 'time.v1';
const PUSH_DELAY = 1500;

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    const state = { timetables: [], activeId: null, synced: {}, ...(s || {}) };
    // Anything saved before the seven-day rotation is brought forward here,
    // so nobody's Tuesday turns into a Sunday.
    state.timetables = state.timetables.map(migrate);
    return state;
  } catch {
    return { timetables: [], activeId: null, synced: {} };
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
  queuePush(tt.id);
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
  delete state.synced[id];
  if (state.activeId === id) state.activeId = state.timetables[0]?.id || null;
  write(state);
  if (Api.user) Api.deleteTimetable(id).catch(() => {});
}

/* ── Sync ────────────────────────────────────────────────────── */

const listeners = new Set();
export function onSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(status, detail) {
  for (const fn of listeners) fn(status, detail);
}

const timers = new Map();

function queuePush(id) {
  if (!Api.user) return;
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => push(id), PUSH_DELAY));
}

async function push(id) {
  if (!Api.user) return;
  const state = read();
  const tt = state.timetables.find((t) => t.id === id);
  if (!tt) return;

  emit('saving');
  try {
    const res = await Api.putTimetable(id, {
      name: tt.name || 'Untitled',
      data: tt,
      updatedAt: tt.updatedAt,
      baseUpdatedAt: state.synced[id] ?? null,
    });
    const after = read();
    after.synced[id] = res.updatedAt;
    write(after);
    emit('saved');
  } catch (e) {
    if (e.status === 409) {
      // Another device got there first. Their copy wins; say so rather than
      // guessing at a merge.
      await pullOne(id);
      emit('replaced', { name: tt.name });
    } else {
      emit('offline');
    }
  }
}

async function pullOne(id) {
  const { timetable } = await Api.getTimetable(id);
  const state = read();
  const i = state.timetables.findIndex((t) => t.id === id);
  const incoming = migrate({ ...timetable.data, id, name: timetable.name, updatedAt: timetable.updatedAt });
  if (i === -1) state.timetables.push(incoming);
  else state.timetables[i] = incoming;
  state.synced[id] = timetable.updatedAt;
  write(state);
  return incoming;
}

/**
 * Reconcile local and cloud at whole-timetable granularity, newest wins.
 * Called on sign in and on page load while signed in.
 */
export async function syncAll() {
  if (!Api.user) return { pulled: 0, pushed: 0 };
  emit('saving');
  let pulled = 0;
  let pushed = 0;
  try {
    const { timetables: remote } = await Api.listTimetables();
    const remoteById = new Map(remote.map((r) => [r.id, r]));

    for (const r of remote) {
      const local = read().timetables.find((t) => t.id === r.id);
      if (!local || r.updatedAt > local.updatedAt) {
        await pullOne(r.id);
        pulled++;
      }
    }

    for (const local of read().timetables) {
      const r = remoteById.get(local.id);
      if (!r || local.updatedAt > r.updatedAt) {
        await push(local.id);
        pushed++;
      }
    }

    // A first sign in with nothing local and nothing chosen yet.
    const state = read();
    if (!state.activeId && state.timetables.length) {
      state.activeId = state.timetables[0].id;
      write(state);
    }

    emit('saved');
    return { pulled, pushed };
  } catch {
    emit('offline');
    return { pulled, pushed };
  }
}

/** Push anything still waiting on its debounce, before the tab goes away. */
export function flushPending() {
  for (const [id, t] of timers) {
    clearTimeout(t);
    push(id);
  }
  timers.clear();
}

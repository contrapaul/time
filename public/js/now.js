/* The clock, and the arithmetic of time passing.
   The only module allowed to read the current time. */

import { toISO } from './model.js';

export function todayISO() {
  return toISO(new Date());
}

export function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function dayStatus(iso, today) {
  if (iso < today) return 'past';
  if (iso > today) return 'future';
  return 'today';
}

/** 0 before it starts, 1 once it has finished, the fraction through otherwise. */
export function elapsedFraction(instance, nowMin) {
  if (nowMin <= instance.startMin) return 0;
  if (nowMin >= instance.endMin) return 1;
  return (nowMin - instance.startMin) / (instance.endMin - instance.startMin);
}

/**
 * Calls back whenever the minute changes, and immediately on waking.
 *
 * The waking part is the point. This app is left open in a tab for days, so a
 * tab restored on Thursday must not still believe it is Monday. `rolled` says
 * the date itself changed, which means the caller has to re-centre, not just
 * repaint.
 */
export function startClock(onTick) {
  let lastMinute = nowMinutes();
  let lastDate = todayISO();
  let timer = null;

  const fire = (force) => {
    const m = nowMinutes();
    const d = todayISO();
    const rolled = d !== lastDate;
    if (!force && m === lastMinute && !rolled) return;
    lastMinute = m;
    lastDate = d;
    onTick({ nowMin: m, today: d, rolled });
  };

  // Land on the start of the next minute, then settle into a steady beat.
  const schedule = () => {
    clearTimeout(timer);
    const msToNextMinute = 60000 - (Date.now() % 60000);
    timer = setTimeout(() => {
      fire(false);
      schedule();
    }, msToNextMinute + 50);
  };

  const wake = () => {
    if (document.visibilityState === 'visible') fire(false);
  };

  schedule();
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  fire(true);

  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('focus', wake);
  };
}

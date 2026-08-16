/* A made-up school, built around whatever today is, so the view always has
   something to grey out. Development scaffolding and a way for a first-time
   visitor to see what the tool is. Never a default: nothing here is assumed
   about any real user's timetable. */

import { mondayOf, addDays, newTimetable, defaultWeekTypes, flipWeekFrom } from './model.js';
import { todayISO } from './now.js';

const periods = [
  { id: 'reg',   name: 'Registration', start: '08:30', end: '08:40' },
  { id: 'p1',    name: 'Period 1',     start: '08:45', end: '09:45' },
  { id: 'p2',    name: 'Period 2',     start: '09:45', end: '10:45' },
  { id: 'break', name: 'Break',        start: '10:45', end: '11:00' },
  { id: 'p3',    name: 'Period 3',     start: '11:00', end: '12:00' },
  { id: 'lunch', name: 'Lunch',        start: '12:00', end: '12:45' },
  { id: 'p4',    name: 'Period 4',     start: '12:45', end: '13:45' },
  { id: 'p5',    name: 'Period 5',     start: '13:50', end: '14:50' },
  { id: 'p6',    name: 'Period 6',     start: '14:50', end: '15:30' },
];

const C = {
  maths:   '#3d3d3d',
  english: '#3d6b4a',
  science: '#16257d',
  art:     '#6b4570',
  pe:      '#c08a2e',
  reg:     '#a8a8d0',
  meeting: '#29b6e8',
  admin:   '#bf5450',
};

let n = 0;
const e = (name, location, color, extra = {}) => ({
  id: `d${++n}`, name, location, color, detail: '', ...extra,
});

/* Fourteen rotation days: 0-6 is week one, 7-13 is week two, Monday first.
   Deliberately uneven, with free slots, two doubles, a ten-minute
   registration every weekday, and a little happening at the weekend. */
const pattern = {};
for (const d of [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]) {
  pattern[`${d}:reg`] = e('Registration', 'Room 12', C.reg);
}

Object.assign(pattern, {
  '0:p1': e('Maths', 'Room 12', C.maths),
  '0:p3': e('Science', 'Lab 2', C.science),
  '0:p5': e('English', 'Room 8', C.english),

  '1:p2': e('Art', 'Studio', C.art),
  '1:p4': e('Maths', 'Room 12', C.maths),
  '1:p6': e('PE', 'Gym', C.pe),

  // A double: its own times, running straight through Period 2 and Break.
  '2:p1': e('Science', 'Lab 2', C.science, { start: '08:45', end: '10:45' }),
  '2:p4': e('English', 'Room 8', C.english),
  '2:p5': e('Staff meeting', 'Room 1', C.meeting),

  '3:p1': e('English', 'Room 8', C.english),
  '3:p3': e('Maths', 'Room 12', C.maths),
  '3:p4': e('Art', 'Studio', C.art),

  '4:p2': e('PE', 'Gym', C.pe),
  '4:p3': e('Science', 'Lab 2', C.science),
  '4:p6': e('Maths', 'Room 12', C.maths),

  // Saturday of week one.
  '5:p2': e('Saturday club', 'Studio', C.meeting, { start: '09:30', end: '12:00' }),

  '7:p1': e('Art', 'Studio', C.art),
  '7:p3': e('English', 'Room 8', C.english),
  '7:p4': e('Maths', 'Room 12', C.maths),

  '8:p2': e('Science', 'Lab 2', C.science),
  '8:p5': e('Maths', 'Room 12', C.maths),

  '9:p1': e('Maths', 'Room 12', C.maths),
  '9:p3': e('PE', 'Gym', C.pe),
  '9:p4': e('Science', 'Lab 2', C.science),

  // A second double, on the other week.
  '10:p3': e('Art', 'Studio', C.art, { start: '11:00', end: '13:45' }),
  '10:p6': e('English', 'Room 8', C.english),

  '11:p1': e('Science', 'Lab 2', C.science),
  '11:p2': e('English', 'Room 8', C.english),
  '11:p5': e('Art', 'Studio', C.art),

  // Sunday of week two.
  '13:p4': e('Fixture', 'Away', C.pe, { start: '13:00', end: '16:00' }),
});

export function demoTimetable() {
  const today = todayISO();
  const start = addDays(mondayOf(today), -35);
  const end = addDays(mondayOf(today), 7 * 12 + 4);

  const tt = newTimetable({
    name: 'Sample timetable',
    rotationWeeks: 2,
    startDate: start,
    endDate: end,
    periods,
    pattern,
  });

  // Alternate, then flip a week back the way a fortnight of holiday would.
  tt.calendar.weekTypes = flipWeekFrom(defaultWeekTypes(tt), 6, 1);

  // A day off, a half day, a cancelled lesson, and something out of hours.
  const nextMon = addDays(mondayOf(today), 7);
  tt.calendar.dayStates = {
    [addDays(nextMon, 2)]: 'off',
    [addDays(nextMon, 4)]: 'am',
  };
  tt.overrides = {
    [addDays(nextMon, 1)]: { removed: ['1:p4'] },
    [addDays(nextMon, 3)]: {
      added: [e('Parent evening', 'Hall', C.admin, { start: '16:30', end: '19:00' })],
    },
  };

  return tt;
}

# Export to Outlook

A downloadable `.ics` of the resolved timetable, plus a dialogue asking which
periods belong in it. Nothing else.

## Scope

In:

- One `.ics` file, one `VEVENT` per real occurrence, from `startDate` to
  `endDate`.
- A dialogue that asks which periods to include.
- One `Export` button on the bar, next to `Share`.

Out, deliberately:

- No `RRULE`. A two week rotation with `weekTypes`, dated overrides and
  `am`/`pm` partial days does not survive recurrence rules. Flat expansion is
  both simpler and truthful.
- No `METHOD`, no `ORGANIZER`, no `ATTENDEE`. This is a published calendar,
  not an invitation. Nothing is sent to anyone and nobody is asked to accept
  anything.
- No subscription feed, no server work, no auth thinking. `functions/` is
  untouched.
- No colour. iCalendar has no portable colour and Outlook categories are per
  account, so the palette does not make the trip.

## What Outlook does with a second import

It adds a second copy. Import is "add these items", not "reconcile these
items". `UID` plus `SEQUENCE` is the update mechanism, but it belongs to the
scheduling protocol we are staying out of, so re-importing a changed timetable
leaves the old events sitting under the new ones.

The workflow that makes this fine: import into a calendar of its own, and to
re-export, delete that calendar and import again. The dialogue says so in one
line.

Stable UIDs go in anyway. They cost nothing and Apple Calendar and Google
Calendar both do dedupe on them.

## Files

| File | Change |
|---|---|
| `public/js/ics.js` | New. Pure, like `resolve.js`: no DOM, no storage, no clock. |
| `public/js/exportdialog.js` | New. Asks the question, builds the download. |
| `public/js/timetable.js` | One `Export` button, one `onExport?.()` line. |
| `public/js/app.js` | One `onExport()` hook, same shape as `onShare()`. |
| `test/ics.test.js` | New. |

## 1. `js/ics.js`

```js
export function toICS(tt, { periodIds }) // -> string
```

Loops `tt.startDate` to `tt.endDate` with `addDays`, calls `resolveDay(tt, iso)`
for each date, keeps instances whose `periodId` is in `periodIds`, and prints a
`VEVENT` each.

Instances with `periodId === null` are dated one offs from the override layer.
They have no period to select, so they always export.

Per event:

| Field | Source |
|---|---|
| `UID` | `${tt.id}-${iso}-${slotKey ?? id}@time.contrapaul.com` |
| `DTSTAMP` | Passed in, not read from a clock. The module stays pure. |
| `DTSTART` / `DTEND` | Wall time plus date, converted to UTC. See below. |
| `SUMMARY` | `name` |
| `LOCATION` | `location`, omitted when empty |
| `DESCRIPTION` | `detail`, omitted when empty |

Three details that are easy to get wrong:

**UTC, not `TZID`.** `TZID=` without a matching `VTIMEZONE` block makes Outlook
desktop unhappy, and hand writing `VTIMEZONE` with correct DST rules is the one
genuinely fiddly part of this job. Instead convert each wall time to UTC and
emit `20260902T001500Z`. The offset is computed per date from `tt.timezone`
with `Intl.DateTimeFormat(..., { timeZone, timeZoneName: 'longOffset' })`, so a
DST change mid year lands correctly.

**Escaping.** In text fields, `\` `;` `,` become `\\` `\;` `\,` and a newline
becomes `\n`. Nothing else.

**Folding.** Lines longer than 75 octets break with CRLF plus one leading
space. Count octets, not characters, or a name in Chinese folds mid codepoint.
Line endings are CRLF throughout.

## 2. `js/exportdialog.js`

Same shape as `share.js`: builds a `.dlg`, resolves on close.

```
What should Outlook show?

[x] Before School   07:45 - 08:00
[x] HR              08:00 - 08:10
[x] P1              08:15 - 09:10
...

Importing again adds a second copy, so delete the old calendar first.

                                        [ Cancel ]  [ Download ]
```

- The list is `tt.periods` in order, every box ticked. The default is the whole
  truthful schedule; unticking recess is the user's call, not ours.
- The line about importing again is the one piece of subtext in the app, and
  it earns its place: without it people quietly end up with doubled calendars.
- `Download` builds a `Blob`, clicks a synthetic `<a download>`, then revokes
  the object URL. Filename is the timetable name slugged, or `timetable.ics`
  when unnamed.
- Zero ticked disables `Download`.

## 3. Wiring

`timetable.js` gains one button in the owner branch of the bar, after `Share`:

```html
<button class="btn" data-act="export">Export</button>
```

and one line in the click handler:

```js
if (act === 'export') onExport?.();
```

`app.js` gains `onExport() { openExport(tt); }` beside `onShare()`. The shared
view branch of the bar does not get the button.

## 4. Steps

1. `js/ics.js` with the UTC helper, escaping and folding.
   Verify: `test/ics.test.js` covers a fixture timetable with a two week
   rotation, a day off, an `am` day, a dated override, a multi period span, a
   detail containing a comma and a newline, and a period filter that drops
   recess. Assert on exact output lines. `npm test` green.
2. Offset correctness across a DST boundary.
   Verify: a test using `Europe/London` with one date in January and one in
   July, asserting the two `DTSTART` values differ by the right hour.
3. `js/exportdialog.js` and the bar button.
   Verify: by hand in `npm run dev`. Export, untick recess, confirm the file
   downloads, confirm the ticked periods are the ones present.
4. Real import.
   Verify: import the file into a new calendar in Outlook on the web and in
   Outlook desktop. Check a 10 minute homeroom, an entry spanning two periods,
   a day off being empty, and that times land on the right hour.

## Voice

`What should Outlook show?` is the question. Buttons are `Cancel` and
`Download`. No instruction anywhere. No em dashes.

# time.contrapaul.com build plan

A timetable that knows what day it is.

**This is a general tool, not a personal one.** Teachers or students, any school
or none. Nothing about any particular institution is baked into the app: no
default periods, no default subjects, no default rotation. Every schedule comes
from the user through the wizard. Real schedules appear only in `test/` as
fixtures, never as shipped data.

**Desktop only until desktop is finished.** No responsive work, no touch
handling, no phone testing until every phase below is complete. Phone is Phase 7.

---

## 1. Voice

All interface copy is a short question. Never an instruction.

| Instead of | Write |
|---|---|
| Select a time and click to add an event | What do you want to schedule first? |
| Choose your rotation length | One week or two? |
| Enter the periods in your day | How is each day structured? |
| Click days to remove them from the calendar | Which days are you off? |
| Set the event duration | How long? |
| Enter a location | Where? |
| Generate a share link | Who needs to see this? |
| View overlapping free periods | When are you both free? |

No em dashes anywhere, in interface copy or in code comments. No explanatory
subtext under a question unless the question genuinely cannot carry it.

---

## 2. Decisions

| # | Decision |
|---|---|
| 1 | Days are columns, snap-scrolled, today centred. Time runs down each column, block **height** proportional to duration. |
| 2 | One period structure for all days. Every entry can override its own start and end. |
| 3 | Standalone accounts, own D1, bloodbowl auth copied across. |
| 4 | Several timetables, one active. |
| 5 | Main view edits are always this-date-only. Pattern changes happen in a separate editor. |
| 6 | Days off blank the day. Partial days (`am` / `pm`) auto-trim. Nothing shifts. |
| 7 | Auto-sync, debounced ~1.5s. Local is the working copy. |
| 8 | Unlisted secret share link, revocable, no account needed to view. |
| 9 | Desktop first, completely, before any phone work. |
| 10 | **Weeks are seven days.** Weekends are ordinary rotation days, not a special case. Clubs, fixtures and marking all happen on them. |
| 11 | **Zoom moves the day axis, not the time axis.** Zooming out shows more days, never shorter rows. Vertical scale auto-fits the window so the day is always whole. Pinch, or ctrl/command scroll. |
| 12 | **The default view is one whole rotation.** Choose two weeks and you see two weeks. |

---

## 3. What the screenshot changed

Two things, both structural.

**Entries span multiple periods, and it is common.** Wednesday-1 P2+P3 and
Monday-2 P1+P2 are single tall blocks (`DDES`, double design). This is part of
the rotation, not an exception, so spans belong in the pattern rather than in
the dated override layer.

The fix simplifies the model rather than complicating it: **every entry, in the
pattern and in overrides alike, carries optional `start` and `end`**, defaulting
to its slot's period times. One representation everywhere. Feature 7 (an event
shorter or longer than its slot) then costs nothing extra, and the grid derives
coverage by asking which period bands an entry overlaps.

**Entries are multi-line, with several classes and rooms in one block.**

```
Design
T408  T410
9KX (DES)  9GM (DES)  9WB (DES)
```

Modelled as `name`, `location`, and free-text `detail`. Do not build a structured
class-code system.

### The shape a real structure takes

Read off the screenshot as a worked example, not as app data:

```
Before School   07:45 – 08:00   15 min
HR              08:00 – 08:10   10 min
P1              08:15 – 09:10   55 min
P2              09:15 – 10:10   55 min
P3              10:15 – 11:10   55 min
Lunch           11:10 – 11:45   35 min
Lunch Recess    11:45 – 12:10   25 min
P4              12:15 – 13:15   60 min
P5              13:20 – 14:20   60 min
Afternoon Rec.  14:20 – 14:30   10 min
P6              14:30 – 15:30   60 min
```

Eleven bands, 465 minutes, a 6:1 spread between the shortest and longest. What
this tells the build: non-teaching bands (before school, lunch, recess) must be
first-class schedulable periods, ten-minute bands are normal rather than
exceptional, and unlabelled gaps in a school's own grid may be bands a user
wants named. None of it ships as a default.

Also confirmed: Wednesday-1 replaces Homeroom with Assembly, so slot content
varies by rotation day. Already handled. Timezone is `Asia/Shanghai`.

---

## 4. Tiny events

Homeroom and Afternoon Recess are both 10 minutes. **The schedule matches
reality, always, even when that makes an entry too small to read.** No minimum
height, no fudging, no exceptions. Seeing that homeroom is a sliver is the point.

- The vertical scale fits the whole day into the window, so it is always
  visible at once. It is not a user control.
- Below the height that fits one line of text, an entry renders as a **colour
  stripe**: its colour, its full true height, no text.
- Hover expands it over its neighbours (absolute, raised z-index, the column
  below does not reflow) to show name, location and detail.
- Zoom is the horizontal axis: how many days fit on screen. See decision 11.

The stripe is not a fallback for a layout that failed. It is how a 10-minute
event is supposed to look next to a 55-minute one.

---

## 5. Data model

One JSON blob per timetable. localStorage, synced verbatim to D1.

```js
{
  schemaVersion: 2,
  id, name,                          // "2026–2027 Teaching"
  rotationWeeks: 1 | 2,
  startDate: "2026-08-10",
  endDate:   "2027-06-18",
  timezone:  "Asia/Shanghai",
  pxPerMin:  1.6,

  periods: [
    { id:"bs", name:"Before School", start:"07:45", end:"08:00" },
    { id:"hr", name:"HR",            start:"08:00", end:"08:10" },
    { id:"p1", name:"P1",            start:"08:15", end:"09:10" },
    ...
  ],

  // Key is `${dayIndex}:${periodId}`, the entry's STARTING slot.
  // dayIndex 0-6 for one week, 0-13 for two (7-13 = week 2).
  pattern: {
    "0:p2": { id:"e1", name:"Design", location:"T408  T410",
              detail:"9KX (DES)  9GM (DES)  9WB (DES)",
              color:"#3a3a3a" },
    "2:p2": { id:"e2", name:"Design", location:"T408",
              detail:"11QD (DDES)  11SG (DDES)",
              color:"#3a3a3a",
              start:"09:15", end:"11:10" },     // spans P2+P3
    ...
  },

  calendar: {
    weekTypes: [1,2,1,2,2,1,...],               // one per calendar week
    dayStates: { "2026-10-01":"off", "2026-11-13":"am" }
  },

  overrides: {
    "2026-09-18": {
      removed: ["3:p2"],
      patched: { "3:p4": { start:"10:40", end:"12:00" } },
      added:   [ { id:"x1", name:"Parent conferences", location:"Hall",
                   color:"#8a4b2a", start:"13:00", end:"17:00" } ]
    }
  },

  createdAt, updatedAt
}
```

### resolve.js

One pure function. No DOM, no storage, no clock.

```
resolveDay(timetable, isoDate) -> Instance[]
```

1. Outside the date range, return `[]`. Weeks run Monday to Sunday.
2. `dayStates[date] === "off"`, return `[]`.
3. `weekType = rotationWeeks === 1 ? 1 : calendar.weekTypes[weekIndexOf(date)]`
4. `dayIndex = (weekType - 1) * 7 + weekdayIndex(date)`
5. Collect pattern entries for that `dayIndex`. Each resolves its times from its
   own `start`/`end` if present, otherwise from its starting period.
6. `am` / `pm` trims by the cutoff (default 12:00, editable).
7. Apply `overrides[date]`: drop `removed`, merge `patched`, append `added`.
8. Sort by start. Overlaps are legal and render side by side.

Write this first, with `node --test`, before any UI. The view, the year overview,
the overlay comparison and any future import all sit on it, and the week-flip
logic in step 3 is where a bug hides silently until March.

### Why weekTypes is a stored array

Your case: start on week 1, leave for two weeks, return and it should be week 1
again. An explicit per-week array makes that one click.

```
Sep 7  Sep 14  Sep 21  Sep 28          default alternation
  W1     W2      W1      W2
        [ holiday  ]
                        ↓ toggle Sep 28 to W1
  W1     W2      W1      W1  W2  W1     realternates forward
```

Toggling week *i* sets it and re-alternates everything after. A second flip in
May behaves identically. Holiday weeks still consume a number by default; you
correct it with one click on the week you return.

---

## 6. Timetable view

**Scroll engine.** Lift from `edu/tools/greatgames`: flex row,
`scroll-snap-type: x mandatory`, `scroll-snap-align: center`,
`padding-inline: calc(50vw - <col>/2)` so end columns can reach the centre,
scrollbars hidden, and its `centerMostCardIndex()` routine. Drop the infinite
cloning; a school year has ends.

**No virtualisation.** 190 school days by 10 blocks is about 1900 nodes. That
renders fine. Do not build a windowing layer.

Column width ~220px, so roughly six days visible at 1440px.

**Time response**, the reason the tool exists:

- Past days: `filter: grayscale(1)`, reduced opacity, whole column.
- Future days: full colour.
- Today: centred. Elapsed blocks grey, upcoming blocks colour, and the block in
  progress split at the current minute by a hard gradient stop so it fills with
  grey as the lesson runs. A thin rule marks now.
- Recompute on the minute, not the second.
- Recompute on `visibilitychange` and `focus`. You leave this open for days. A
  tab woken on Thursday must not still believe it is Monday.

**Reset button.** Native `scrollIntoView({behavior:"smooth"})` across 200 columns
is capped, instant or stuttering depending on the browser, and will feel wrong.
Write an eased scroll: cubic ease-in-out, duration scaled to distance and clamped
to roughly 450 to 1400ms, so crossing a term reads as travel rather than a jump.
Honour `prefers-reduced-motion` with an instant move.

**Rules.** One hairline where each period begins, and nowhere else. Drawing
the end of a period as well puts two lines around every empty slot, which reads
as a box drawn around nothing.

**Style.** White background. `'Lexend', 'Helvetica Neue', Arial, sans-serif` from
cdnfonts.com, the same source as edu.contrapaul.com because it resolves in China.
Corners 6px, well short of Auditorium's 16px. All colours through custom
properties so theme swaps stay cheap.

**Palette**, taken from your current colour use: charcoal for teaching, lavender
for homeroom and assembly, cyan and navy for meetings, red for department
meetings, pale cream for supervision and advisory. Ten swatches plus a custom
picker.

---

## 7. Wizard

Five panels on the same horizontal snap engine.

1. **One week or two?** Clicking auto-advances.
2. **How is each day structured?** Named periods with times. Validate: no
   zero-length, no overlaps, chronological.
3. **What do you teach, and when?** Blank 5 or 10 day grid. Click a slot to open
   the dialog. Repeat daily fills the other 4 or 9 days. Hover-X removes. Drag an
   entry to copy it.
4. **Which days are you off?** Start and end dates, then paint days off and
   partial days against the school calendar. Week 1/2 toggle above each week,
   rippling forward per §5.
5. Done.

**Gating.** Render only up to the furthest unlocked panel. Nothing exists to the
right, so forward movement is impossible without writing clamping code. On
completing a step, append the next panel then smooth-scroll to it: that is the
slide-in. Back is free. Off-centre panels dim and scale down via the same
centre-most calculation the gallery already uses.

**Slot dialog.** What is it? Where? How long? (1 period, 2 periods, custom).
Which colour? Repeat daily?

**Drag to copy.** Pointer Events, not HTML5 drag-and-drop. Auditorium uses HTML5
DnD, which gives no control over the drag image and no useful ghost. Drag always
copies; moving is copy-then-X. This is the feature that turns eight Grade 12
classes across six slots into a few seconds, so it earns a custom implementation.

---

## 8. Editing in the main view

Every edit here is a dated override. Never touches `pattern`.

- Hover an entry, circle-X top right, removes that instance on that date only.
  Instant, no confirmation. One click for "assembly cancelled my class".
  An undo appears for six seconds afterwards. Not in the original spec, added
  because removing with neither a confirmation nor an undo is a one-way door,
  and it costs the common case nothing.
- Click an empty slot, dialog, writes to `added`.
- Any entry's times are editable, so PD days and parent conferences are just long
  `added` entries.
- The pattern editor is a separate screen from the menu, reusing the wizard's
  step 3 grid, writing to `pattern`.

---

## 9. Backend

Cloudflare Pages plus Functions, mirroring `make/`: `pages_build_output_dir = "."`,
no build step, wrangler the only devDependency.

```
[[d1_databases]]  binding = "DB"  database_name = "time-db"
```

Copied from bloodbowl essentially unchanged: `_lib/crypto.ts` (PBKDF2-SHA256,
100k), `_lib/session.ts` (hashed token, HttpOnly/Secure/SameSite=Lax, rename
`bb_session` to `tt_session`), `_lib/http.ts`, `_lib/ratelimit.ts`,
`_lib/email.ts`, `_middleware.ts`, and all of `auth/`. Resend already has
`send.contrapaul.com` verified, so verification email needs only a new `From`
and the `RESEND_API_KEY` secret on the new Pages project.

Schema is bloodbowl's `users`, `sessions`, `auth_tokens`, `rate_limits` verbatim,
plus:

```sql
CREATE TABLE timetables (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  share_token TEXT,
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX        idx_tt_owner ON timetables(user_id, updated_at DESC);
CREATE UNIQUE INDEX idx_tt_share ON timetables(share_token);
```

```
POST/GET /api/auth/*                copied
GET      /api/timetables
GET/PUT/DELETE /api/timetables/:id
POST/DELETE    /api/timetables/:id/share
GET      /api/shared/:token         read-only, no auth
```

`PUT` carries `baseUpdatedAt` and 409s on a stale write, as `teams/[id].ts` does.
Cap the blob at 400KB, a guard rail rather than a constraint. On a 409 the newer
server copy wins and the user is told; a schedule is too small for silent merge
to be worth the bug surface.

---

## 10. Sharing, overlay, import readiness

`/s/<token>` renders read-only: no remove buttons, no empty slots, clicks do
nothing, and a viewer's own local data is never touched. Creating a link needs
a verified email, because a share link is anonymous hosting on someone else's
domain. Sharing again rotates the token, so a link given to the wrong person
can always be taken back.

Asset paths in `index.html` are absolute. `/s/<token>` is served the same file,
and relative paths would resolve against `/s/`.

Signed-in visitors get an overlay control (Phase 6).

**Overlay compares on time, not on slots.** For each date in the intersection of
both ranges, resolve both sets of instances, build free intervals, intersect.
Correct whether or not two people share a period structure, and it collapses to
plain slot matching when they do, so a colleague at another school still works.
Minimum useful gap filter, default 15 minutes.

The comparison window is every minute either person has anything scheduled in.
Beyond it both are free, but "free at 3am" is not an answer to when two people
can meet. Free time is only computed on dates both timetables cover, and never
drawn on a past day.

Rotation length needs no special handling: because the comparison is by date,
each timetable resolves itself. The only thing it affects is the default zoom,
which uses the longer of the two cycles, so a one-week timetable next to a
two-week one is read over a fortnight.

Both timetables share each day column, theirs in the left lane and yours in the
right, drawn as an outline so the two layers are never confused.

**Import readiness** is enabling only, not building. `schemaVersion` from day
one, and `overrides` is already a general container for dated entries with
arbitrary times. An .ics import writes `added` entries and touches nothing else.
Build no import scaffolding now.

---

## 11. Phases

| Phase | Contents | Done when |
|---|---|---|
| 0 | Repo scaffold, wrangler.toml, D1 created, empty page deployed | The domain serves a page |
| 1 | `resolve.js` plus tests, then the timetable view: day columns, proportional heights, grey-out, now rule, reset scroll, zoom. Reads localStorage; a generic sample timetable stands in until the wizard exists. | The sample renders correctly and greys in real time |
| 2 | The five-step wizard, drag-to-copy, year overview | You can rebuild the fixture through the UI |
| 3 | Main-view editing: hover-X, slot dialog, custom times, pattern editor | You can cancel Thursday's class in one click |
| 4 | Accounts, D1, debounced auto-sync | Two desktop browsers stay in step |
| 5 | Share links | A colleague can open your schedule |
| 6 | Overlay and mutual-free filtering | You can find a shared free period |
| 7 | Phone | Not before 6 is signed off |

Phase 1 ships with your timetable typed in by hand rather than waiting for the
wizard. Shortest path to daily use, and it tests the central bet (height as
duration, today centred, grey creeping across the current lesson) while changing
it is still cheap.

---

## 12. Files

Following `cloud/`, not `make/`: everything served lives in `public/`, so repo
metadata (PLAN.md, wrangler.toml, package.json, migrations) is never published.
Pages Functions stay at the repo root regardless of the output directory.

```
time/
  public/                    <- pages_build_output_dir
    index.html
    css/  base.css  timetable.css  wizard.css  dialog.css
    js/
      model.js        shape, defaults, validation, schemaVersion
      resolve.js      date to instances. pure. the heart.
      store.js        localStorage plus debounced sync
      api.js          fetch wrapper, BBApi's shape
      timetable.js    the scrolling day-column view
      now.js          minute tick, visibilitychange, grey maths
      wizard.js       five-step slider
      grid.js         rotation grid: wizard step 3 and pattern editor
      yearview.js     year at a glance, painting, week toggles
      dragcopy.js     pointer-event drag to copy
      share.js  overlay.js
  functions/api/             <- repo root, not public/
  test/resolve.test.js
  db/migrations/0001_init.sql
  wrangler.toml  package.json  PLAN.md  CLAUDE.md
```

`grid.js` is shared between wizard step 3 and the pattern editor, the same
component writing to the same `pattern` object, which is why decision 5 costs
almost nothing.

---

## 13. Open

1. **Colours.** Palette above is inferred from your screenshot. Confirm or replace.
2. **Partial day cutoff.** Default 12:00, which lands in your Lunch band. Right?
3. **`endDate`.** Assumed to bound the scroll only, nothing happens when the year
   runs out.

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project rules: time

See PLAN.md for the full plan. These are the rules that are easy to break.

## Voice
All interface copy is a **short question**, never an instruction.
"What do you want to schedule first?" not "Select a time and click to add an event."
No explanatory subtext under a question unless the question cannot carry it.

**No em dashes.** Anywhere. Interface copy, comments, commit messages, docs.

## Never fill in the user's content
Fields start empty. Suggestions go in `placeholder`, never in `value`.
Auto-filling "Period 3" forces anyone whose day is not built from numbered
periods to delete a wrong answer before typing the right one, and a name typed
into row 1 must never cascade into rows 2, 3 and 4.

## Wizard panels are built from earlier answers
Going back and changing the rotation or the period list must rebuild the grid
and the year view before the user swipes forward. See `remountDownstream()` in
`wizard.js`. A stale panel is invisible until it is too late.

## Everything the wizard can set must be editable afterwards
The wizard is a first run, not the only run. Periods, pattern and year each
have a sheet reachable from the bar (`periodeditor.js`, `patterneditor.js`,
`yeareditor.js`), and each edits a copy so Cancel really cancels. Adding a new
wizard step means adding its door too, or the only way to change that answer is
to rebuild from scratch.

## Desktop first
No responsive work, no touch handling, no phone testing until Phase 6 is signed
off. Phone is Phase 7. Do not spend time on it early.

## The schedule matches reality
Block height is strictly proportional to duration. No minimum heights. A
10 minute homeroom renders as a 16px colour stripe with no text, and expands on
hover. This is the point of the tool, not a bug to design around.

## Structure
`js/resolve.js` is pure: no DOM, no storage, no clock. Everything else sits on
it. Change it only with tests.

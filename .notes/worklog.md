# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

## Robustness pass (after review feedback)

A reviewer went through the grid and found problems in how it behaves outside the happy
path. This section records what they found and what I changed.

- Second edit while a save is in flight was silently dropped. The old code had a guard that
  returned early if a save was running, so a fast manager lost the second change with no
  message. Now saves go through a queue that drains one at a time, so a queued edit is sent
  instead of dropped.
- A very wide date range rendered every week for every person and could crash the tab. Added
  a cap of 730 days on the backend (`rangeAllowed` in `api/capacity.go`), which returns 400
  past that. The frontend shows the message it gets back.
- An error banner stayed on screen after a later successful save. The save path now clears
  the error when it succeeds.
- A failed refresh left the old grid visible under the new dates. The capacity effect now
  clears `data` on failure, so an error is never shown above numbers from a different range.
- Accessibility: the editor input had no accessible name, and the table had no caption. Added
  `aria-label` on the input (includes the person's name) and a visually hidden `<caption>`.
- Added Go tests (`api/capacity_test.go`): week start calculation across every weekday,
  Monday alignment, seven day spacing, the range cap boundaries, the query invariants that
  keep the weekday filter, and the `PATCH` validation cases.

Still not done, and worth naming: there are no frontend tests, and the save queue gives no
visual sign that a save is waiting.

## Phase 4 (final pass)

- Fresh rebuild (`docker compose down -v` then `up --build`) verified: health returns 500 people, capacity spot-check matches, PATCH round-trips and reflects in capacity, web and proxy both serve 200.
- Wrote `DECISIONS.md`.

## Frontend redesign (after Phase 4)

- Restyled the web app: calm background, centered layout, a header with title and subtitle, and a white card holding the grid.
- Toolbar now has a segmented week nav, styled date inputs, and a live "N people over-allocated" summary with the number in red.
- Table uses light row separators, right-aligned numbers, a sticky header and name column, and red highlighting on over-allocated cells. Added dark mode via `prefers-color-scheme`.
- Added a search bar that filters people by name (case-insensitive).

## Phase 3 (edit weekly hours)

- `PATCH /api/people/{id}` updates `weekly_hours`, requires a non-negative `weeklyHours` in the JSON body, returns the updated person. Bad id or body is 400, unknown person is 404.
- Grid editing: click the "Xh/wk" text in the person column, type a number, Enter or blur saves, Escape cancels.
- After a save the grid patches that person's `weeklyHours` in local state, so over-allocation re-highlights in place. Chose local patch over a full refetch or optimistic update: allocations do not depend on weekly hours, so patching is exact and avoids a refetch.
- Verified through both :8080 and the :3000 proxy, all error cases, and that a change shows up in `/api/capacity`; restored the data afterward.

## Phase 2 (grid)

- Grid now owns its range state; `App.tsx` is a thin shell. Week nav buttons shift the window by 7 days; date inputs jump to any range.
- Cells show "allocated / capacity" and over-allocation (alloc > weeklyHours) is highlighted red. A zero-capacity person with any allocation counts as over.
- Sticky header and sticky first column keep the 500-row table usable.
- Kept the original Dec 29 - Jan 16 default window: it shows the hand-crafted edge cases and real over-allocation.
- Backend tweak: dropped `round(...,3)` on allocations. Probed all person-week groups and every total is already a multiple of 1/8, so rounding was a no-op that read like a precision bug; now returns exact `float8`.

## Phase 1 (capacity endpoint)

- Probed the data before deciding anything. Seed is 500 people and ~126k assignments across 19 months (2025-06-02 to 2026-12-21). The first 10 rows are hand-crafted edge cases (partial weeks, weekend straddling, a zero-capacity person); the rest is a full synthetic dataset.
- Decided `hours_per_day` is literal hours, not FTE. Probe showed busy people land at exactly 40h/week and 180/500 people are over-allocated somewhere, so over-allocation is real under the literal reading.
- Decided weeks are Monday-based (ISO) and only working days (Mon-Fri) count toward allocation.
- Decided capacity is `weekly_hours`, flat every week. There are no hire/leave dates, so prorating capacity does not apply.
- API shape: `{ from, to, weeks[], people[{ id, name, weeklyHours, allocations[] }] }`, with `allocations[i]` aligned to `weeks[i]`.
- Allocation is computed in SQL by expanding each overlapping assignment to days and bucketing with `date_trunc('week')`. Verified against an independent Python reimplementation (matched exactly); error cases return 400; the full range answers in ~0.2s.

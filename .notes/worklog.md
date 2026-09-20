# Worklog

Running notes on how this got built — decisions, assumptions, dead ends, and anything
left unfinished. Append as you go; a line or two per entry is right.

---

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

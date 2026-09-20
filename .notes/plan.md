# Plan

Capacity view: allocated hours vs capacity, per person, per week, over a selectable
date range, with over-allocation obvious and weekly hours editable in place.

## Deliverables (the three TODOs)

- [x] `GET /api/capacity?from=&to=` in `api/capacity.go`
- [ ] `CapacityGrid` in `web/src/CapacityGrid.tsx`
- [ ] `PATCH /api/people/{id}` in `api/people.go`

## Current state

- Stack runs via `docker compose up --build` (db healthy, api on :8080, web on :3000).
- `GET /api/health` returns 500 people, so the seed loaded.
- All three TODOs return placeholders.

## Decisions to make (these feed DECISIONS.md)

1. JSON contract for `/api/capacity` and for the `PATCH` response.
2. Week definition (Monday start, ISO style).
3. Proration: how to split an assignment across weeks when it starts or ends mid week.
4. `hours_per_day`: literal hours vs a fraction of a day (FTE). Values are all eighths.
5. Capacity semantics: flat `weekly_hours` vs prorated to the week.
6. Zero capacity (Eli Nakamura has `weekly_hours = 0`).
7. Over-allocation threshold and how it renders.
8. How the grid stays correct after a `PATCH` (refetch range vs local patch).

## Implementation order

- [x] Phase 1: decide the contract, then implement `handleCapacity` with SQL aggregation.
- [ ] Phase 2: build the grid, week navigation, and date range selection.
- [ ] Phase 3: implement `handleUpdatePerson` and post edit consistency.
- [ ] Phase 4: rebuild, run, and verify the numbers against the raw data.

## Validation

- Rebuild the API after Go changes (`docker compose up --build -d`).
- Hit endpoints with `curl` to check shapes and values.
- Open http://localhost:3000 and eyeball a few cells against `db/seed.sql`.

## Constraints

- Never edit `db/schema.sql`, `db/seed.sql`, `docker-compose.yml`, the Dockerfiles, or the Makefile.
- Commit on a feature branch, no squashing.
- Keep `.notes/worklog.md` current.

## Submission

- [ ] Push to a public GitHub repo on aerrarhiche.
- [ ] Write `DECISIONS.md` (human voice, no em dashes).
- [ ] Submit the repo link.

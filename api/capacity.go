package main

import (
	"net/http"
	"time"
)

const dateLayout = "2006-01-02"

// allocationQuery returns, per person and per week, the hours allocated across
// assignments. Weeks are Monday-based (ISO). Only working days (Mon-Fri) count
// toward allocation, so an assignment that starts or ends mid week, or spans a
// weekend, only contributes for the weekdays it actually covers.
const allocationQuery = `
WITH params AS (
  SELECT $1::date AS lo, $2::date AS hi
),
day_alloc AS (
  SELECT a.person_id,
         date_trunc('week', d.day)::date AS week_start,
         a.hours_per_day
  FROM assignments a
  CROSS JOIN params p
  CROSS JOIN LATERAL generate_series(
           GREATEST(a.start_date, p.lo),
           LEAST(a.end_date, p.hi),
           interval '1 day'
         ) AS d(day)
  WHERE a.start_date <= p.hi
    AND a.end_date >= p.lo
    AND EXTRACT(ISODOW FROM d.day) BETWEEN 1 AND 5
)
SELECT person_id,
       week_start::text AS week,
       sum(hours_per_day)::float8 AS allocated
FROM day_alloc
GROUP BY person_id, week_start
ORDER BY person_id, week_start`

const peopleQuery = `
SELECT id, name, weekly_hours::float8
FROM people
ORDER BY id`

type capacityResponse struct {
	From   string           `json:"from"`
	To     string           `json:"to"`
	Weeks  []string         `json:"weeks"`
	People []capacityPerson `json:"people"`
}

type capacityPerson struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	WeeklyHours float64   `json:"weeklyHours"`
	Allocations []float64 `json:"allocations"`
}

// handleCapacity serves GET /api/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD.
//
// It returns every person in the team (even those with no assignments in the
// range), one entry per week, with the hours allocated to them that week and
// their capacity for it. Capacity is a person's weekly_hours, the same every
// week.
func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	from, err := time.Parse(dateLayout, r.URL.Query().Get("from"))
	if err != nil {
		http.Error(w, "from must be a date in YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	to, err := time.Parse(dateLayout, r.URL.Query().Get("to"))
	if err != nil {
		http.Error(w, "to must be a date in YYYY-MM-DD", http.StatusBadRequest)
		return
	}
	if to.Before(from) {
		http.Error(w, "to must not be before from", http.StatusBadRequest)
		return
	}

	weeks := weekStarts(from, to)

	people, err := s.loadPeople(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	weekIndex := make(map[string]int, len(weeks))
	for i, w := range weeks {
		weekIndex[w] = i
	}
	personIndex := make(map[int]int, len(people))
	for i := range people {
		people[i].Allocations = make([]float64, len(weeks))
		personIndex[people[i].ID] = i
	}

	rows, err := s.db.Query(r.Context(), allocationQuery, from.Format(dateLayout), to.Format(dateLayout))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var personID int
		var week string
		var allocated float64
		if err := rows.Scan(&personID, &week, &allocated); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		pi, ok := personIndex[personID]
		if !ok {
			continue
		}
		wi, ok := weekIndex[week]
		if !ok {
			continue
		}
		people[pi].Allocations[wi] = allocated
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, capacityResponse{
		From:   from.Format(dateLayout),
		To:     to.Format(dateLayout),
		Weeks:  weeks,
		People: people,
	})
}

func (s *server) loadPeople(r *http.Request) ([]capacityPerson, error) {
	rows, err := s.db.Query(r.Context(), peopleQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	people := []capacityPerson{}
	for rows.Next() {
		var p capacityPerson
		if err := rows.Scan(&p.ID, &p.Name, &p.WeeklyHours); err != nil {
			return nil, err
		}
		people = append(people, p)
	}
	return people, rows.Err()
}

// weekStarts returns the Monday of every week that falls at least partly in
// [from, to], formatted as YYYY-MM-DD.
func weekStarts(from, to time.Time) []string {
	out := []string{}
	for d := mondayOf(from); !d.After(to); d = d.AddDate(0, 0, 7) {
		out = append(out, d.Format(dateLayout))
	}
	return out
}

// mondayOf returns the Monday on or before d, matching Postgres'
// date_trunc('week', ...) which starts weeks on Monday.
func mondayOf(d time.Time) time.Time {
	offset := (int(d.Weekday()) + 6) % 7
	return d.AddDate(0, 0, -offset)
}

package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

type updatePersonRequest struct {
	WeeklyHours *float64 `json:"weeklyHours"`
}

type person struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

// handleUpdatePerson serves PATCH /api/people/{id}.
//
// It updates a person's weekly hours. The body is JSON: {"weeklyHours": 40}.
// A valid value is a non-negative number, and 0 is allowed. The updated person
// is returned so the grid can patch its own state without a full refetch.
func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		http.Error(w, "id must be an integer", http.StatusBadRequest)
		return
	}

	var req updatePersonRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "body must be JSON with a weeklyHours number", http.StatusBadRequest)
		return
	}
	if req.WeeklyHours == nil {
		http.Error(w, "weeklyHours is required", http.StatusBadRequest)
		return
	}
	if *req.WeeklyHours < 0 {
		http.Error(w, "weeklyHours must not be negative", http.StatusBadRequest)
		return
	}

	const query = `
UPDATE people
SET weekly_hours = $2
WHERE id = $1
RETURNING id, name, weekly_hours::float8`

	var p person
	err = s.db.QueryRow(r.Context(), query, id, *req.WeeklyHours).Scan(&p.ID, &p.Name, &p.WeeklyHours)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "person not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, p)
}

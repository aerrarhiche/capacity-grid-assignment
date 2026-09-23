package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func mustDate(t *testing.T, s string) time.Time {
	t.Helper()
	d, err := time.Parse(dateLayout, s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return d
}

func TestMondayOf(t *testing.T) {
	// Every day of one week should resolve to the same Monday. 2025-12-29 is a
	// Monday, and 2026-01-04 is the Sunday that closes that week.
	cases := map[string]string{
		"2025-12-29": "2025-12-29", // Monday
		"2025-12-30": "2025-12-29", // Tuesday
		"2025-12-31": "2025-12-29", // Wednesday
		"2026-01-01": "2025-12-29", // Thursday
		"2026-01-02": "2025-12-29", // Friday
		"2026-01-03": "2025-12-29", // Saturday
		"2026-01-04": "2025-12-29", // Sunday
		"2026-01-05": "2026-01-05", // next Monday
	}

	for in, want := range cases {
		got := mondayOf(mustDate(t, in)).Format(dateLayout)
		if got != want {
			t.Errorf("mondayOf(%s) = %s, want %s", in, got, want)
		}
	}
}

func TestWeekStarts(t *testing.T) {
	cases := []struct {
		name string
		from string
		to   string
		want []string
	}{
		{
			name: "the default window is three Monday weeks",
			from: "2025-12-29",
			to:   "2026-01-16",
			want: []string{"2025-12-29", "2026-01-05", "2026-01-12"},
		},
		{
			name: "a range inside a single week returns that one week",
			from: "2026-01-06",
			to:   "2026-01-08",
			want: []string{"2026-01-05"},
		},
		{
			name: "a range that starts mid week still returns the Monday",
			from: "2026-01-07",
			to:   "2026-01-14",
			want: []string{"2026-01-05", "2026-01-12"},
		},
		{
			name: "a range that ends mid week includes the partial week",
			from: "2025-12-29",
			to:   "2026-01-07",
			want: []string{"2025-12-29", "2026-01-05"},
		},
		{
			name: "from and to on the same Monday",
			from: "2026-01-05",
			to:   "2026-01-05",
			want: []string{"2026-01-05"},
		},
		{
			name: "a weekend only range still maps to its week",
			from: "2026-01-03",
			to:   "2026-01-04",
			want: []string{"2025-12-29"},
		},
		{
			name: "from and to on the same Sunday",
			from: "2026-01-04",
			to:   "2026-01-04",
			want: []string{"2025-12-29"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := weekStarts(mustDate(t, tc.from), mustDate(t, tc.to))
			if len(got) != len(tc.want) {
				t.Fatalf("got %d weeks %v, want %d weeks %v", len(got), got, len(tc.want), tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Errorf("week %d = %s, want %s", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestWeekStartsAlwaysMonday(t *testing.T) {
	// Every week we hand to the frontend must be a Monday, because the grid uses
	// it as both a column id and a label.
	from := mustDate(t, "2025-06-02")
	to := mustDate(t, "2026-12-21")

	weeks := weekStarts(from, to)
	if len(weeks) == 0 {
		t.Fatal("expected weeks across the seeded range, got none")
	}

	for _, w := range weeks {
		d := mustDate(t, w)
		if d.Weekday() != time.Monday {
			t.Errorf("week start %s is a %s, want Monday", w, d.Weekday())
		}
	}
}

func TestWeekStartsConsecutiveAndContiguous(t *testing.T) {
	// Weeks must step by exactly seven days with no gap and no repeat, or the
	// allocation columns would line up against the wrong week.
	weeks := weekStarts(mustDate(t, "2025-12-29"), mustDate(t, "2026-02-15"))
	if len(weeks) < 3 {
		t.Fatalf("expected several weeks, got %d", len(weeks))
	}

	for i := 1; i < len(weeks); i++ {
		prev := mustDate(t, weeks[i-1])
		cur := mustDate(t, weeks[i])
		if diff := cur.Sub(prev); diff != 7*24*time.Hour {
			t.Errorf("week %d (%s) is %v after %s, want exactly 7 days", i, weeks[i], diff, weeks[i-1])
		}
	}
}

func TestRangeAllowed(t *testing.T) {
	// maxRangeDays stops very wide ranges from producing a table the browser
	// cannot draw. Boundary behaviour matters, so pin it.
	if maxRangeDays != 730 {
		t.Fatalf("maxRangeDays = %d, the error message and this test assume 730", maxRangeDays)
	}

	cases := []struct {
		name string
		from string
		to   string
		want bool
	}{
		{"one week", "2025-12-29", "2026-01-05", true},
		{"the default window", "2025-12-29", "2026-01-16", true},
		{"same day", "2026-01-05", "2026-01-05", true},
		{"exactly 730 days", "2024-01-01", "2025-12-31", true},
		{"731 days", "2024-01-01", "2026-01-01", false},
		{"ten years", "2016-01-01", "2026-01-01", false},
		{"to before from", "2026-01-05", "2025-12-29", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := rangeAllowed(mustDate(t, tc.from), mustDate(t, tc.to))
			if got != tc.want {
				t.Errorf("rangeAllowed(%s, %s) = %v, want %v", tc.from, tc.to, got, tc.want)
			}
		})
	}
}

func TestAllocationQueryKeepsItsInvariants(t *testing.T) {
	// A guard on the query text. The weekday filter is the whole reason an
	// assignment spanning a weekend is counted correctly, so dropping it should
	// fail loudly rather than silently change every number.
	if !strings.Contains(allocationQuery, "EXTRACT(ISODOW FROM d.day) BETWEEN 1 AND 5") {
		t.Error("allocation query no longer filters to weekdays (ISODOW 1..5)")
	}
	if !strings.Contains(allocationQuery, "date_trunc('week'") {
		t.Error("allocation query no longer buckets by date_trunc('week', ...)")
	}
	if !strings.Contains(allocationQuery, "GREATEST(a.start_date, p.lo)") {
		t.Error("allocation query no longer clips assignments to the range start")
	}
	if !strings.Contains(allocationQuery, "LEAST(a.end_date, p.hi)") {
		t.Error("allocation query no longer clips assignments to the range end")
	}
}

// handleUpdatePerson validates its input before it ever touches the database,
// so the validation half is testable with a nil pool.
func TestUpdatePersonValidation(t *testing.T) {
	cases := []struct {
		name       string
		pathID     string
		body       string
		wantStatus int
	}{
		{"bad id", "abc", `{"weeklyHours":10}`, http.StatusBadRequest},
		{"malformed json", "1", `{`, http.StatusBadRequest},
		{"missing field", "1", `{}`, http.StatusBadRequest},
		{"negative hours", "1", `{"weeklyHours":-1}`, http.StatusBadRequest},
		{"null field", "1", `{"weeklyHours":null}`, http.StatusBadRequest},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &server{db: nil}
			req := httptest.NewRequest(http.MethodPatch, "/api/people/"+tc.pathID, strings.NewReader(tc.body))
			req.SetPathValue("id", tc.pathID)
			rec := httptest.NewRecorder()

			s.handleUpdatePerson(rec, req)

			if rec.Code != tc.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", rec.Code, tc.wantStatus, rec.Body.String())
			}
		})
	}
}

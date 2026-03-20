package internal

import (
	"testing"
)

func TestInferTypes(t *testing.T) {
	tests := []struct {
		name    string
		headers []string
		rows    [][]string
		want    []string
	}{
		// ── BIGINT ──────────────────────────────────────────────────────────────
		{
			name:    "plain integers",
			headers: []string{"id"},
			rows:    [][]string{{"1"}, {"2"}, {"100"}, {"9999"}},
			want:    []string{"BIGINT"},
		},
		{
			name:    "integers with commas (thousands separator)",
			headers: []string{"population"},
			rows:    [][]string{{"1,000"}, {"2,500,000"}, {"300"}},
			want:    []string{"BIGINT"},
		},
		{
			name:    "negative integers",
			headers: []string{"delta"},
			rows:    [][]string{{"-1"}, {"-999"}, {"0"}},
			want:    []string{"BIGINT"},
		},

		// ── DOUBLE ──────────────────────────────────────────────────────────────
		{
			name:    "plain floats",
			headers: []string{"price"},
			rows:    [][]string{{"3.14"}, {"2.71"}, {"1.0"}},
			want:    []string{"DOUBLE"},
		},
		{
			name:    "floats with commas",
			headers: []string{"amount"},
			rows:    [][]string{{"1,234.56"}, {"99.9"}, {"0.01"}},
			want:    []string{"DOUBLE"},
		},
		{
			name:    "currency USD",
			headers: []string{"revenue"},
			rows:    [][]string{{"$1.50"}, {"$200.00"}, {"$0.99"}},
			want:    []string{"DOUBLE"},
		},
		{
			name:    "currency EUR",
			headers: []string{"cost"},
			rows:    [][]string{{"€9.99"}, {"€1,200.00"}},
			want:    []string{"DOUBLE"},
		},
		{
			name:    "percentage",
			headers: []string{"rate"},
			rows:    [][]string{{"5.5%"}, {"12%"}, {"0.25%"}},
			want:    []string{"DOUBLE"},
		},
		{
			name:    "mixed int and float → DOUBLE",
			headers: []string{"val"},
			rows:    [][]string{{"1"}, {"2"}, {"3.5"}},
			want:    []string{"DOUBLE"},
		},
		{
			name:    "negative floats",
			headers: []string{"temp"},
			rows:    [][]string{{"-1.5"}, {"-0.01"}, {"32.0"}},
			want:    []string{"DOUBLE"},
		},

		// ── DATE ────────────────────────────────────────────────────────────────
		{
			name:    "ISO date YYYY-MM-DD",
			headers: []string{"dob"},
			rows:    [][]string{{"1990-06-15"}, {"2000-01-01"}, {"2023-12-31"}},
			want:    []string{"DATE"},
		},
		{
			name:    "date DD/MM/YYYY",
			headers: []string{"date"},
			rows:    [][]string{{"15/06/1990"}, {"01/01/2000"}},
			want:    []string{"DATE"},
		},
		{
			name:    "date DD-MM-YYYY",
			headers: []string{"date"},
			rows:    [][]string{{"15-06-1990"}, {"01-01-2000"}},
			want:    []string{"DATE"},
		},
		{
			name:    "date DD Month YYYY",
			headers: []string{"date"},
			rows:    [][]string{{"30 July 1966"}, {"3 Jan 2020"}, {"15 December 1999"}},
			want:    []string{"DATE"},
		},
		{
			name:    "date Month DD YYYY",
			headers: []string{"date"},
			rows:    [][]string{{"July 30, 1966"}, {"January 3 2020"}},
			want:    []string{"DATE"},
		},
		{
			name:    "date Month YYYY",
			headers: []string{"month"},
			rows:    [][]string{{"January 2006"}, {"March 2024"}},
			want:    []string{"DATE"},
		},
		{
			name:    "datetime ISO 8601",
			headers: []string{"created_at"},
			rows:    [][]string{{"2024-01-15T09:30:00"}, {"2023-06-01T00:00:00"}},
			want:    []string{"DATE"},
		},
		{
			name:    "datetime with space separator",
			headers: []string{"ts"},
			rows:    [][]string{{"2024-01-15 09:30:00"}, {"2023-06-01 00:00"}},
			want:    []string{"DATE"},
		},
		{
			name:    "datetime DD/MM/YYYY HH:MM",
			headers: []string{"ts"},
			rows:    [][]string{{"15/06/1990 14:30"}, {"01/01/2000 08:00:00"}},
			want:    []string{"DATE"},
		},

		// ── TEXT ────────────────────────────────────────────────────────────────
		{
			name:    "plain text",
			headers: []string{"name"},
			rows:    [][]string{{"Alice"}, {"Bob"}, {"Charlie"}},
			want:    []string{"TEXT"},
		},
		{
			name:    "mixed text and numbers → TEXT",
			headers: []string{"code"},
			rows:    [][]string{{"A1"}, {"B2"}, {"C3"}},
			want:    []string{"TEXT"},
		},
		{
			name:    "empty cells → TEXT",
			headers: []string{"opt"},
			rows:    [][]string{{""}, {""}, {""}},
			want:    []string{"TEXT"},
		},
		{
			name:    "number that looks date-like but isn't",
			headers: []string{"zip"},
			rows:    [][]string{{"90210"}, {"10001"}, {"30301"}},
			want:    []string{"BIGINT"},
		},

		// ── MULTI-COLUMN ────────────────────────────────────────────────────────
		{
			name:    "multi-column: id, price, name, joined",
			headers: []string{"id", "price", "name", "joined"},
			rows: [][]string{
				{"1", "$9.99", "Alice", "2020-01-15"},
				{"2", "$49.99", "Bob", "2021-06-30"},
				{"3", "$0.50", "Carol", "2019-12-01"},
			},
			want: []string{"BIGINT", "DOUBLE", "TEXT", "DATE"},
		},
		{
			name:    "multi-column: rank, score, label, event_date",
			headers: []string{"rank", "score", "label", "event_date"},
			rows: [][]string{
				{"1", "98.5", "Gold", "15 March 2023"},
				{"2", "87.0", "Silver", "16 March 2023"},
				{"3", "76.3", "Bronze", "17 March 2023"},
			},
			want: []string{"BIGINT", "DOUBLE", "TEXT", "DATE"},
		},

		// ── EDGE CASES ──────────────────────────────────────────────────────────
		{
			name:    "sparse column (some empty rows)",
			headers: []string{"opt"},
			rows:    [][]string{{"42"}, {""}, {"100"}, {""}},
			want:    []string{"BIGINT"},
		},
		{
			name:    "single row",
			headers: []string{"x"},
			rows:    [][]string{{"3.14"}},
			want:    []string{"DOUBLE"},
		},
		{
			name:    "text that contains date substring should NOT be DATE",
			headers: []string{"note"},
			rows:    [][]string{{"Meeting on 2024-01-01 was great"}, {"Call on 2024-01-02 confirmed"}},
			want:    []string{"TEXT"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := InferTypes(tc.headers, tc.rows)
			for i, w := range tc.want {
				if got[i] != w {
					t.Errorf("col[%d] %q: got %q, want %q", i, tc.headers[i], got[i], w)
				}
			}
		})
	}
}

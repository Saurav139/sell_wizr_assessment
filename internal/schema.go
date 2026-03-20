package internal

import (
	"regexp"
	"strconv"
	"strings"
)

// reDate matches any date-like or datetime-like value (anchored).
// Covers: YYYY-MM-DD, DD/MM/YYYY, DD Month YYYY, Month DD YYYY,
//
//	YYYY-MM-DDTHH:MM, YYYY-MM-DD HH:MM:SS, etc.
var reDate = regexp.MustCompile(
	`(?i)^(` +
		// date+time variants (date part followed by time)
		`\d{1,4}[-/]\d{1,2}[-/]\d{1,4}[\sT]\d{2}:\d{2}(:\d{2})?|` +
		`\d{1,2}\s+[a-z]+\s+\d{2,4}[\sT]\d{2}:\d{2}(:\d{2})?|` +
		`[a-z]+\s+\d{1,2},?\s+\d{2,4}[\sT]\d{2}:\d{2}(:\d{2})?|` +
		// date-only variants
		`\d{4}[-/]\d{1,2}[-/]\d{1,2}|` + // YYYY-MM-DD
		`\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|` + // DD-MM-YYYY, MM/DD/YYYY
		`\d{1,2}\s+[a-z]+\s+\d{2,4}|` +    // 30 July 1966
		`[a-z]+\s+\d{1,2},?\s+\d{2,4}|` +  // July 30, 1966
		`[a-z]+\s+\d{4}` +                  // January 2006
		`)$`,
)

// Column holds the inferred type and nullability for a single column.
type Column struct {
	Type     string
	Nullable bool
}

// InferColumns returns the inferred type and nullability for each column.
// Precedence: BIGINT → DOUBLE → DATE → TEXT
// A column is nullable if any row has a blank value for it.
func InferColumns(headers []string, rows [][]string) []Column {
	cols := make([]Column, len(headers))

	for col := range headers {
		allInt    := true
		allFloat  := true
		allDate   := true
		hasValues := false
		nullable  := false

		for _, row := range rows {
			if col >= len(row) || strings.TrimSpace(row[col]) == "" {
				nullable = true
				continue
			}
			v := strings.TrimSpace(row[col])
			// Skip repeated header rows (Wikipedia injects these mid-table).
			if strings.EqualFold(v, headers[col]) {
				continue
			}
			hasValues = true

			nv := cleanNumeric(v)
			if _, err := strconv.ParseInt(nv, 10, 64); err != nil {
				allInt = false
			}
			if _, err := strconv.ParseFloat(nv, 64); err != nil {
				allFloat = false
			}
			if allDate && !reDate.MatchString(v) {
				allDate = false
			}
		}

		var typ string
		if !hasValues {
			typ = "TEXT"
		} else {
			switch {
			case allInt:
				typ = "BIGINT"
			case allFloat:
				typ = "DOUBLE"
			case allDate:
				typ = "DATE"
			default:
				typ = "TEXT"
			}
		}
		cols[col] = Column{Type: typ, Nullable: nullable}
	}

	return cols
}

// InferTypes is kept for backward compatibility with existing tests.
func InferTypes(headers []string, rows [][]string) []string {
	cols := InferColumns(headers, rows)
	types := make([]string, len(cols))
	for i, c := range cols {
		types[i] = c.Type
	}
	return types
}

// CastRow converts a raw string row into typed Go values using the inferred types.
// BIGINT → int64, DOUBLE → float64, everything else stays string.
// Empty values become nil.
func CastRow(row []string, types []string) []any {
	vals := make([]any, len(row))
	for i, v := range row {
		if strings.TrimSpace(v) == "" {
			vals[i] = nil
			continue
		}
		t := "TEXT"
		if i < len(types) {
			t = types[i]
		}
		switch t {
		case "BIGINT":
			if n, err := strconv.ParseInt(cleanNumeric(v), 10, 64); err == nil {
				vals[i] = n
			} else {
				vals[i] = v
			}
		case "DOUBLE":
			if f, err := strconv.ParseFloat(cleanNumeric(v), 64); err == nil {
				vals[i] = f
			} else {
				vals[i] = v
			}
		default:
			vals[i] = v
		}
	}
	return vals
}

func cleanNumeric(s string) string {
	// Strip common currency/formatting characters before numeric parsing.
	s = strings.NewReplacer("$", "", "€", "", "£", "", "¥", "", ",", "").Replace(s)
	s = strings.TrimPrefix(s, "+")
	s = strings.TrimPrefix(s, "#")
	s = strings.TrimSuffix(s, "%")
	s = strings.TrimSuffix(s, ".")

	// Handle parentheses for negative values: (1234.5) → -1234.5
	if strings.HasPrefix(s, "(") && strings.HasSuffix(s, ")") {
		s = "-" + s[1:len(s)-1]
	}

	// Strip magnitude suffixes: B/bn (billion), M/mn (million), T/tr (trillion), K (thousand)
	upper := strings.ToUpper(strings.TrimSpace(s))
	for _, suffix := range []string{"BN", "MN", "TR", "B", "M", "T", "K"} {
		if strings.HasSuffix(upper, suffix) {
			s = strings.TrimSpace(s[:len(s)-len(suffix)])
			break
		}
	}

	return strings.TrimSpace(s)
}

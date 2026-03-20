package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type queryRequest struct {
	SQL string `json:"sql"`
}

type queryResponse struct {
	Columns []string   `json:"columns"`
	Rows    [][]string `json:"rows"`
}

type tableInfo struct {
	Name     string `json:"name"`
	RowCount int    `json:"row_count"`
}

func HandleQuery(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req queryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "invalid request body", http.StatusBadRequest)
			return
		}

		q := strings.TrimSpace(req.SQL)
		if !strings.EqualFold(strings.Fields(q)[0], "SELECT") {
			jsonError(w, "only SELECT statements are allowed", http.StatusBadRequest)
			return
		}

		s.mu.RLock()
		db := s.db
		s.mu.RUnlock()
		if db == nil {
			jsonError(w, "no database connection — start the consumer first", http.StatusServiceUnavailable)
			return
		}

		rows, err := db.QueryContext(r.Context(), q)
		if err != nil {
			jsonError(w, "query failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		cols, err := rows.Columns()
		if err != nil {
			jsonError(w, "column fetch failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		var result [][]string
		for rows.Next() {
			vals := make([]interface{}, len(cols))
			ptrs := make([]interface{}, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				continue
			}
			row := make([]string, len(cols))
			for i, v := range vals {
				switch t := v.(type) {
				case []byte:
					row[i] = string(t)
				case nil:
					row[i] = ""
				default:
					row[i] = fmt.Sprintf("%v", t)
				}
			}
			result = append(result, row)
		}

		jsonOK(w, queryResponse{Columns: cols, Rows: result})
	}
}

func HandleTruncate(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Table string `json:"table"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Table == "" {
			jsonError(w, "table name required", http.StatusBadRequest)
			return
		}
		s.mu.RLock()
		db := s.db
		s.mu.RUnlock()
		if db == nil {
			jsonError(w, "no database connection", http.StatusServiceUnavailable)
			return
		}
		// DROP instead of TRUNCATE so the schema is also reset — the consumer
		// recreates the table fresh from the Kafka message types on next ingest.
		if _, err := db.ExecContext(r.Context(), fmt.Sprintf("DROP TABLE IF EXISTS `%s`", req.Table)); err != nil {
			jsonError(w, "drop table failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		jsonOK(w, map[string]string{"status": "ok"})
	}
}

func HandleTables(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.RLock()
		db := s.db
		s.mu.RUnlock()
		if db == nil {
			jsonOK(w, map[string][]tableInfo{"tables": {}})
			return
		}

		rows, err := db.QueryContext(r.Context(), "SHOW TABLES")
		if err != nil {
			jsonError(w, "show tables failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var tables []tableInfo
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				continue
			}
			var count int
			db.QueryRowContext(r.Context(), fmt.Sprintf("SELECT COUNT(*) FROM `%s`", name)).Scan(&count)
			tables = append(tables, tableInfo{Name: name, RowCount: count})
		}

		if tables == nil {
			tables = []tableInfo{}
		}
		jsonOK(w, map[string][]tableInfo{"tables": tables})
	}
}

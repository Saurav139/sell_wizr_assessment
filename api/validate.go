package api

import (
	"encoding/json"
	"net/http"

	"github.com/sell-wizr/table-streamer/internal"
)

type validateRequest struct {
	URL        string `json:"url"`
	TableIndex int    `json:"table_index"`
}

type schemaColumn struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Nullable bool   `json:"nullable"`
}

type validateResponse struct {
	TableCount int            `json:"table_count"`
	Schema     []schemaColumn `json:"schema"`
	Preview    [][]string     `json:"preview"`
	RowCount   int            `json:"row_count"`
}

func HandleValidate(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req validateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "invalid request body", http.StatusBadRequest)
			return
		}
		if req.URL == "" {
			jsonError(w, "url is required", http.StatusBadRequest)
			return
		}

		body, err := internal.Fetch(req.URL, 3)
		if err != nil {
			jsonError(w, "fetch failed: "+err.Error(), http.StatusBadGateway)
			return
		}

		tables, err := internal.ParseTables(body)
		if err != nil {
			jsonError(w, "parse failed: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if len(tables) == 0 {
			jsonError(w, "no HTML tables found on page", http.StatusUnprocessableEntity)
			return
		}

		idx := req.TableIndex
		if idx < 0 || idx >= len(tables) {
			idx = 0
		}
		t := tables[idx]

		inferred := internal.InferColumns(t.Headers, t.Rows)
		schema := make([]schemaColumn, len(t.Headers))
		for i, h := range t.Headers {
			schema[i] = schemaColumn{Name: h, Type: inferred[i].Type, Nullable: inferred[i].Nullable}
		}

		preview := t.Rows
		if len(preview) > 10 {
			preview = preview[:10]
		}

		jsonOK(w, validateResponse{
			TableCount: len(tables),
			Schema:     schema,
			Preview:    preview,
			RowCount:   len(t.Rows),
		})
	}
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

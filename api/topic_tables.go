package api

import (
	"encoding/json"
	"net/http"
)

// HandleTopicTables returns a map of topic → []tableName for all topics
// that have had at least one successful produce run.
func HandleTopicTables(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(s.TopicTablesSnapshot())
	}
}

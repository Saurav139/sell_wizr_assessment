package api

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

type AppConfig struct {
	KafkaBrokers []string `json:"kafka_brokers"`
	KafkaTopics  []string `json:"kafka_topics"`
	DBDSN        string   `json:"db_dsn"`
}

// ResolveConfig reads infrastructure config from environment variables,
// falling back to safe local-dev defaults.
// KAFKA_TOPICS accepts a comma-separated list, e.g. "topic-a,topic-b,topic-c".
// KAFKA_TOPIC (singular) is the legacy fallback for a single topic.
func ResolveConfig() AppConfig {
	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		brokers = "localhost:9092"
	}
	topics := os.Getenv("KAFKA_TOPICS")
	if topics == "" {
		topics = os.Getenv("KAFKA_TOPIC")
	}
	if topics == "" {
		topics = "table-records,table-records1"
	}
	dsn := os.Getenv("MYSQL_DSN")
	if dsn == "" {
		dsn = "root:@tcp(localhost:3306)/tabledata?parseTime=true"
	}
	return AppConfig{
		KafkaBrokers: strings.Split(brokers, ","),
		KafkaTopics:  strings.Split(topics, ","),
		DBDSN:        dsn,
	}
}

// HandleConfig returns resolved infrastructure config to the frontend.
func HandleConfig(_ *AppState) http.HandlerFunc {
	cfg := ResolveConfig()
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cfg)
	}
}

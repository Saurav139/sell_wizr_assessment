package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/sell-wizr/table-streamer/api"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	cfg := api.ResolveConfig()
	log.Printf("kafka_brokers=%s  kafka_topics=%s  db_dsn=%s",
		strings.Join(cfg.KafkaBrokers, ","),
		strings.Join(cfg.KafkaTopics, ","),
		cfg.DBDSN,
	)

	state := api.NewAppState()
	defer state.CloseDB()

	mux := http.NewServeMux()

	mux.HandleFunc("/api/config", api.HandleConfig(state))
	mux.HandleFunc("/api/validate", api.HandleValidate(state))

	mux.HandleFunc("/api/producer/start", api.HandleProducerStart(state))
	mux.HandleFunc("/api/producer/stop", api.HandleProducerStop(state))
	mux.HandleFunc("/api/producer/status", api.HandleProducerStatus(state))
	mux.HandleFunc("/api/producer/stream", api.HandleProducerStream(state))

	mux.HandleFunc("/api/consumer/start", api.HandleConsumerStart(state))
	mux.HandleFunc("/api/consumer/stop", api.HandleConsumerStop(state))
	mux.HandleFunc("/api/consumer/status", api.HandleConsumerStatus(state))
	mux.HandleFunc("/api/consumer/stream", api.HandleConsumerStream(state))

	mux.HandleFunc("/api/query", api.HandleQuery(state))
	mux.HandleFunc("/api/tables", api.HandleTables(state))
	mux.HandleFunc("/api/truncate", api.HandleTruncate(state))
	mux.HandleFunc("/api/topic-tables", api.HandleTopicTables(state))

	// Serve React build from web/dist
	fs := http.FileServer(http.Dir("web/dist"))
	mux.Handle("/", fs)

	handler := api.Recovery(api.Logger(api.CORS(mux)))

	log.Printf("server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}

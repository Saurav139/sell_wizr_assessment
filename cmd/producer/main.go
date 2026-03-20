package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/segmentio/kafka-go"
	"github.com/sell-wizr/table-streamer/internal"
)

// KafkaRow is the message schema published to Kafka.
type KafkaRow struct {
	Table   string   `json:"table"`
	Headers []string `json:"headers"`
	Types   []string `json:"types"`
	Values  []string `json:"values"`
}

func main() {
	url := getEnv("SOURCE_URL", "https://www.scrapethissite.com/pages/forms/")
	tableIdx := getEnvInt("TABLE_INDEX", 0)
	tableName := getEnv("TABLE_NAME", "hockey_teams")
	brokers := strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ",")
	topic := getEnv("KAFKA_TOPIC", "table-records")
	maxRetries := getEnvInt("MAX_RETRIES", 3)

	log.Printf("fetching %s", url)
	body, err := internal.Fetch(url, maxRetries)
	if err != nil {
		log.Fatal(err)
	}

	tables, err := internal.ParseTables(body)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("found %d tables", len(tables))

	if tableIdx >= len(tables) {
		log.Fatalf("TABLE_INDEX %d out of range (found %d tables)", tableIdx, len(tables))
	}
	t := tables[tableIdx]
	log.Printf("using table index %d: %d columns, %d rows", tableIdx, len(t.Headers), len(t.Rows))

	types := internal.InferTypes(t.Headers, t.Rows)
	log.Printf("inferred schema: %v", formatSchema(t.Headers, types))

	w := kafka.NewWriter(kafka.WriterConfig{
		Brokers:  brokers,
		Topic:    topic,
		Balancer: &kafka.LeastBytes{},
	})
	defer w.Close()

	ctx := context.Background()
	published := 0

	for _, row := range t.Rows {
		msg := KafkaRow{
			Table:   tableName,
			Headers: t.Headers,
			Types:   types,
			Values:  row,
		}
		data, err := json.Marshal(msg)
		if err != nil {
			log.Printf("marshal error: %v", err)
			continue
		}
		if err := w.WriteMessages(ctx, kafka.Message{Value: data}); err != nil {
			log.Printf("kafka write error: %v", err)
			continue
		}
		published++
	}

	log.Printf("published %d rows to topic %q", published, topic)
}

func formatSchema(headers, types []string) string {
	var parts []string
	for i, h := range headers {
		parts = append(parts, fmt.Sprintf("%s:%s", h, types[i]))
	}
	return strings.Join(parts, ", ")
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return def
}

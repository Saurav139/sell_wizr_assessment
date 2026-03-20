package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/segmentio/kafka-go"
	"github.com/sell-wizr/table-streamer/internal"
)

// KafkaRow mirrors the producer's message schema.
type KafkaRow struct {
	Table   string   `json:"table"`
	Headers []string `json:"headers"`
	Types   []string `json:"types"`
	Values  []any    `json:"values"`
}

func main() {
	brokers := strings.Split(getEnv("KAFKA_BROKERS", "localhost:9092"), ",")
	topic := getEnv("KAFKA_TOPIC", "table-records")
	group := getEnv("CONSUMER_GROUP", "table-consumer")
	dsn := getEnv("DB_DSN", "root:password@tcp(localhost:3306)/tabledata?parseTime=true")
	batchSize := getEnvInt("BATCH_SIZE", 50)

	db, err := internal.OpenDB(dsn)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer db.Close()
	log.Println("connected to database")

	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers: brokers,
		Topic:   topic,
		GroupID: group,
	})
	defer r.Close()
	log.Printf("consuming from topic %q (group=%s)", topic, group)

	ctx := context.Background()

	tableCreated := map[string]bool{}
	batch := []KafkaRow{}
	inserted := 0

	flush := func() {
		if len(batch) == 0 {
			return
		}
		// Group by table (in practice all rows share the same table).
		byTable := map[string][]KafkaRow{}
		for _, row := range batch {
			byTable[row.Table] = append(byTable[row.Table], row)
		}
		for table, rows := range byTable {
			values := make([][]any, len(rows))
			for i, r := range rows {
				values[i] = r.Values
			}
			if ins, _, err := internal.InsertRows(db, table, rows[0].Headers, values); err != nil {
				log.Printf("insert error for table %s: %v", table, err)
			} else {
				inserted += ins
				log.Printf("inserted %d rows into %s (total %d)", ins, table, inserted)
			}
		}
		batch = batch[:0]
	}

	for {
		m, err := r.ReadMessage(ctx)
		if err != nil {
			log.Printf("read error: %v", err)
			break
		}

		var row KafkaRow
		dec := json.NewDecoder(bytes.NewReader(m.Value))
		dec.UseNumber()
		if err := dec.Decode(&row); err != nil {
			log.Printf("unmarshal error: %v", err)
			continue
		}

		// Create the table once per table name.
		if !tableCreated[row.Table] {
			if err := internal.CreateTable(db, row.Table, row.Headers, row.Types); err != nil {
				log.Fatalf("create table %s: %v", row.Table, err)
			}
			log.Printf("ensured table %q with %d columns", row.Table, len(row.Headers))
			tableCreated[row.Table] = true
		}

		batch = append(batch, row)
		if len(batch) >= batchSize {
			flush()
		}
	}

	flush() // drain remaining
	log.Printf("done — total inserted: %d", inserted)
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

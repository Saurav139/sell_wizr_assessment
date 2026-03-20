package api

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/segmentio/kafka-go"
	"github.com/sell-wizr/table-streamer/internal"
)

type startProducerRequest struct {
	URL          string         `json:"url"`
	TableIndex   int            `json:"table_index"`
	TableName    string         `json:"table_name"`
	Schema       []schemaColumn `json:"schema"`
	KafkaBrokers []string       `json:"kafka_brokers"`
	KafkaTopic   string         `json:"kafka_topic"`
	MaxRetries   int            `json:"max_retries"`
	BatchSize    int            `json:"batch_size"`
}

type kafkaRow struct {
	RunID   string   `json:"run_id"` // unique per producer invocation
	Table   string   `json:"table"`
	Headers []string `json:"headers"`
	Types   []string `json:"types"`
	Values  []string `json:"values"`
}

func HandleProducerStart(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req startProducerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, "invalid request body", http.StatusBadRequest)
			return
		}

		if len(req.KafkaBrokers) == 0 {
			req.KafkaBrokers = []string{"localhost:9092"}
		}
		if req.KafkaTopic == "" {
			req.KafkaTopic = "table-records"
		}
		if req.MaxRetries == 0 {
			req.MaxRetries = 3
		}
		if req.BatchSize <= 0 {
			req.BatchSize = 50
		}

		s.mu.Lock()
		if s.producer.status == StatusRunning {
			s.mu.Unlock()
			jsonError(w, "producer already running", http.StatusConflict)
			return
		}
		hub := internal.NewHub()
		ctx, cancel := context.WithCancel(context.Background())
		s.producer.status = StatusRunning
		s.producer.cancel = cancel
		s.producer.hub = hub
		s.producer.rowsPublished = 0
		s.producer.errCount = 0
		s.mu.Unlock()

		go runProducer(ctx, s, hub, req)

		jsonOK(w, map[string]string{"status": "started"})
	}
}

func HandleProducerStop(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		s.mu.Lock()
		if s.producer.cancel != nil {
			s.producer.cancel()
		}
		s.mu.Unlock()
		jsonOK(w, map[string]string{"status": "stopped"})
	}
}

func HandleProducerStatus(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.RLock()
		status := s.producer.status
		published := s.producer.rowsPublished
		errCount := s.producer.errCount
		s.mu.RUnlock()
		jsonOK(w, map[string]interface{}{
			"status":        string(status),
			"rows_published": published,
			"errors":        errCount,
		})
	}
}

func HandleProducerStream(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		w.Header().Set("Connection", "keep-alive")

		s.mu.RLock()
		hub := s.producer.hub
		s.mu.RUnlock()

		ch := hub.Subscribe()
		defer hub.Unsubscribe(ch)

		for {
			select {
			case msg, ok := <-ch:
				if !ok {
					fmt.Fprintf(w, "data: %s\n\n", `{"level":"done","msg":"stream ended","ts":"`+time.Now().UTC().Format(time.RFC3339)+`"}`)
					flusher.Flush()
					return
				}
				fmt.Fprintf(w, "data: %s\n\n", msg)
				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	}
}

// ensureCompactTopic sets cleanup.policy=compact on the topic so Kafka
// retains only the latest message per key, preventing bloat on re-streams.
func ensureCompactTopic(brokers []string, topic string) error {
	client := &kafka.Client{Addr: kafka.TCP(brokers...)}
	_, err := client.AlterConfigs(context.Background(), &kafka.AlterConfigsRequest{
		Resources: []kafka.AlterConfigRequestResource{{
			ResourceType: kafka.ResourceTypeTopic,
			ResourceName: topic,
			Configs: []kafka.AlterConfigRequestConfig{{
				Name:  "cleanup.policy",
				Value: "compact",
			}},
		}},
	})
	return err
}

func runProducer(ctx context.Context, s *AppState, hub *internal.Hub, req startProducerRequest) {
	logger := log.New(internal.NewHubWriter(hub, "info"), "", 0)
	setStatus := func(st workerStatus) {
		s.mu.Lock()
		s.producer.status = st
		s.mu.Unlock()
	}
	defer hub.Close()

	// Unique ID for this produce run — stamped on every message so the
	// consumer can filter to only this batch and ignore accumulated history.
	runID := fmt.Sprintf("%d", time.Now().UnixNano())
	s.SetLastRunID(req.KafkaTopic, runID)
	logger.Printf("run_id=%s", runID)

	if err := ensureCompactTopic(req.KafkaBrokers, req.KafkaTopic); err != nil {
		logger.Printf("warn: could not set compact policy on topic: %v", err)
	} else {
		logger.Printf("topic %q cleanup.policy=compact", req.KafkaTopic)
	}

	logger.Printf("fetching %s", req.URL)
	body, err := internal.Fetch(req.URL, req.MaxRetries)
	if err != nil {
		log.New(internal.NewHubWriter(hub, "error"), "", 0).Printf("fetch failed: %v", err)
		setStatus(StatusError)
		return
	}

	tables, err := internal.ParseTables(body)
	if err != nil || len(tables) == 0 {
		log.New(internal.NewHubWriter(hub, "error"), "", 0).Printf("no tables found")
		setStatus(StatusError)
		return
	}

	idx := req.TableIndex
	if idx >= len(tables) {
		idx = 0
	}
	t := tables[idx]
	logger.Printf("found table with %d rows, %d columns", len(t.Rows), len(t.Headers))

	// Use user-accepted schema if provided.
	headers := t.Headers
	types := internal.InferTypes(t.Headers, t.Rows)
	if len(req.Schema) == len(t.Headers) {
		for i, col := range req.Schema {
			headers[i] = col.Name
			types[i] = col.Type
		}
	}

	typeParts := make([]string, len(headers))
	for i := range headers {
		typeParts[i] = headers[i] + ":" + types[i]
	}
	logger.Printf("schema: %s", strings.Join(typeParts, ", "))

	writer := &kafka.Writer{
		Addr:     kafka.TCP(req.KafkaBrokers...),
		Topic:    req.KafkaTopic,
		Balancer: &kafka.Hash{}, // consistent partition per key — required for log compaction
	}
	defer writer.Close()

	errLogger := log.New(internal.NewHubWriter(hub, "error"), "", 0)
	addPublished := func(n int) {
		s.mu.Lock()
		s.producer.rowsPublished += n
		s.mu.Unlock()
	}
	addErrors := func(n int) {
		s.mu.Lock()
		s.producer.errCount += n
		s.mu.Unlock()
	}

	batch := make([]kafka.Message, 0, req.BatchSize)
	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := writer.WriteMessages(ctx, batch...); err != nil {
			errLogger.Printf("write failed: %v", err)
			addErrors(len(batch))
		} else {
			addPublished(len(batch))
		}
		batch = batch[:0]
	}

	for _, row := range t.Rows {
		select {
		case <-ctx.Done():
			flush()
			s.mu.RLock()
			pub := s.producer.rowsPublished
			s.mu.RUnlock()
			logger.Printf("producer stopped by user after %d rows", pub)
			setStatus(StatusDone)
			return
		default:
		}

		msg := kafkaRow{Table: req.TableName, Headers: headers, Types: types, Values: row}
		data, err := json.Marshal(msg)
		if err != nil {
			addErrors(1)
			continue
		}
		h := sha256.Sum256([]byte(strings.Join(row, "|")))
		key := fmt.Sprintf("%x", h)
		batch = append(batch, kafka.Message{Key: []byte(key), Value: data})
		if len(batch) >= req.BatchSize {
			flush()
		}
	}
	flush()

	s.mu.RLock()
	pub := s.producer.rowsPublished
	errs := s.producer.errCount
	s.mu.RUnlock()
	logger.Printf("published %d rows to topic %q (%d errors)", pub, req.KafkaTopic, errs)
	if pub > 0 {
		s.RecordTopicTable(req.KafkaTopic, req.TableName)
	}
	setStatus(StatusDone)
}

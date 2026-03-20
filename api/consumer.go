package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/segmentio/kafka-go"
	"github.com/sell-wizr/table-streamer/internal"
)

type startConsumerRequest struct {
	KafkaBrokers []string `json:"kafka_brokers"`
	KafkaTopic   string   `json:"kafka_topic"`
	DBDSN        string   `json:"db_dsn"`
	BatchSize    int      `json:"batch_size"`
}

type consumerStatusResponse struct {
	Status       string `json:"status"`
	RowsInserted int    `json:"rows_inserted"`
	DupsSkipped  int    `json:"dups_skipped"`
	Table        string `json:"table"`
}

func HandleConsumerStart(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req startConsumerRequest
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
		if req.DBDSN == "" {
			req.DBDSN = "root:@tcp(localhost:3306)/tabledata?parseTime=true"
		}
		if req.BatchSize == 0 {
			req.BatchSize = 50
		}

		s.mu.Lock()
		if s.consumer.status == StatusRunning {
			s.mu.Unlock()
			jsonError(w, "consumer already running", http.StatusConflict)
			return
		}
		hub := internal.NewHub()
		ctx, cancel := context.WithCancel(context.Background())
		s.consumer.status = StatusRunning
		s.consumer.cancel = cancel
		s.consumer.hub = hub
		s.consumer.rowsInserted = 0
		s.consumer.dupsSkipped = 0
		s.consumer.table = ""
		s.mu.Unlock()

		runID := s.GetLastRunID(req.KafkaTopic)
		go runConsumer(ctx, s, hub, req, runID)

		jsonOK(w, map[string]string{"status": "started"})
	}
}

func HandleConsumerStop(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		s.mu.Lock()
		if s.consumer.cancel != nil {
			s.consumer.cancel()
		}
		s.mu.Unlock()
		jsonOK(w, map[string]string{"status": "stopped"})
	}
}

func HandleConsumerStatus(s *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.RLock()
		resp := consumerStatusResponse{
			Status:       string(s.consumer.status),
			RowsInserted: s.consumer.rowsInserted,
			DupsSkipped:  s.consumer.dupsSkipped,
			Table:        s.consumer.table,
		}
		s.mu.RUnlock()
		jsonOK(w, resp)
	}
}

func HandleConsumerStream(s *AppState) http.HandlerFunc {
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
		hub := s.consumer.hub
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

type incomingRow struct {
	RunID   string   `json:"run_id"`
	Table   string   `json:"table"`
	Headers []string `json:"headers"`
	Types   []string `json:"types"`
	Values  []any    `json:"values"`
}

func runConsumer(ctx context.Context, s *AppState, hub *internal.Hub, req startConsumerRequest, expectedRunID string) {
	logger := log.New(internal.NewHubWriter(hub, "info"), "", 0)
	errLogger := log.New(internal.NewHubWriter(hub, "error"), "", 0)
	setStatus := func(st workerStatus) {
		s.mu.Lock()
		s.consumer.status = st
		s.mu.Unlock()
	}
	defer hub.Close()

	db, err := s.GetOrOpenDB(req.DBDSN)
	if err != nil {
		errLogger.Printf("db connect failed: %v", err)
		setStatus(StatusError)
		return
	}
	logger.Printf("connected to database")

	// Use a unique consumer group per run so StartOffset: FirstOffset is
	// always honoured (no stale committed offset) and all partitions are read.
	// Consumer groups are the only way kafka-go reads all partitions; without
	// one it only reads partition 0, missing messages distributed by the Hash balancer.
	groupID := fmt.Sprintf("tablepipe-%d", time.Now().UnixNano())
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     req.KafkaBrokers,
		Topic:       req.KafkaTopic,
		GroupID:     groupID,
		StartOffset: kafka.FirstOffset,
	})
	defer reader.Close()
	logger.Printf("consuming from topic %q (group=%s)", req.KafkaTopic, groupID)
	if expectedRunID != "" {
		logger.Printf("filtering to run_id=%s", expectedRunID)
	} else {
		logger.Printf("no run_id set — consuming all messages (duplicates skipped via INSERT IGNORE)")
	}

	tableCreated  := map[string]bool{}
	tableHeaders  := map[string][]string{}
	tableSkipLogged := map[string]bool{}
	batch := []incomingRow{}
	totalInserted := 0
	skippedRunID := 0

	flush := func() {
		if len(batch) == 0 {
			return
		}
		byTable := map[string][]incomingRow{}
		for _, row := range batch {
			byTable[row.Table] = append(byTable[row.Table], row)
		}
		for table, rows := range byTable {
			values := make([][]any, len(rows))
			for i, r := range rows {
				values[i] = r.Values
			}
			ins, skipped, err := internal.InsertRows(db, table, rows[0].Headers, values)
			if err != nil {
				errLogger.Printf("insert error for %s: %v", table, err)
			} else {
				totalInserted += ins
				s.mu.Lock()
				s.consumer.rowsInserted = totalInserted
				s.consumer.dupsSkipped += skipped
				s.consumer.table = table
				s.mu.Unlock()
				if ins > 0 {
					logger.Printf("inserted %d rows into %s (total %d)", ins, table, totalInserted)
				} else if skipped > 0 && !tableSkipLogged[table] {
					logger.Printf("all rows already exist in %s — duplicates skipped", table)
					tableSkipLogged[table] = true
				}
			}
		}
		batch = batch[:0]
	}

	msgCh := make(chan kafka.Message, req.BatchSize)
	readErr := make(chan error, 1)

	go func() {
		for {
			m, err := reader.FetchMessage(ctx)
			if err != nil {
				readErr <- err
				return
			}
			msgCh <- m
		}
	}()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	hasRead := false
	startedAt := time.Now()

loop:
	for {
		select {
		case m := <-msgCh:
			hasRead = true
			var row incomingRow
			dec := json.NewDecoder(bytes.NewReader(m.Value))
			dec.UseNumber()
			if err := dec.Decode(&row); err != nil {
				errLogger.Printf("unmarshal error: %v", err)
				continue
			}
			// Skip messages from previous producer runs.
			if expectedRunID != "" && row.RunID != expectedRunID {
				skippedRunID++
				continue
			}
			if !tableCreated[row.Table] {
				if err := internal.CreateTable(db, row.Table, row.Headers, row.Types); err != nil {
					errLogger.Printf("create table %s: %v", row.Table, err)
					setStatus(StatusError)
					return
				}
				logger.Printf("ensured table %q with %d columns", row.Table, len(row.Headers))
				tableCreated[row.Table] = true
				tableHeaders[row.Table] = row.Headers
			} else if !headersMatch(tableHeaders[row.Table], row.Headers) {
				errLogger.Printf("schema mismatch for table %q: expected %v, got %v — row skipped", row.Table, tableHeaders[row.Table], row.Headers)
				continue
			}
			batch = append(batch, row)
			if len(batch) >= req.BatchSize {
				flush()
			}

		case <-ticker.C:
			flush()
			if hasRead && reader.Stats().Lag == 0 {
				if skippedRunID > 0 {
					logger.Printf("skipped %d messages from previous producer runs", skippedRunID)
				}
				logger.Printf("caught up — no more messages in topic")
				break loop
			}
			// If no message received within 15s the topic is likely empty or unreachable.
			if !hasRead && time.Since(startedAt) > 15*time.Second {
				errLogger.Printf("no messages received after 15s — topic may be empty, produce first")
				setStatus(StatusError)
				return
			}

		case err := <-readErr:
			if ctx.Err() != nil {
				logger.Printf("consumer stopped by user")
			} else {
				errLogger.Printf("read error: %v", err)
			}
			break loop
		}
	}

	flush()
	logger.Printf("done — total inserted: %d", totalInserted)
	setStatus(StatusDone)
}

func headersMatch(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

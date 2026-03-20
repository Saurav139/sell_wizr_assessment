package api

import (
	"context"
	"database/sql"
	"sync"

	"github.com/sell-wizr/table-streamer/internal"
)

type workerStatus string

const (
	StatusIdle    workerStatus = "idle"
	StatusRunning workerStatus = "running"
	StatusDone    workerStatus = "done"
	StatusError   workerStatus = "error"
)

type workerState struct {
	status        workerStatus
	cancel        context.CancelFunc
	hub           *internal.Hub
	rowsInserted  int
	rowsPublished int
	errCount      int
	dupsSkipped   int
	table         string
}

// AppState is the single shared mutable state for the server.
type AppState struct {
	mu          sync.RWMutex
	db          *sql.DB
	dbDSN       string
	producer    workerState
	consumer    workerState
	topicTables map[string]map[string]bool // topic → set of table names produced to it
}

func NewAppState() *AppState {
	return &AppState{
		producer:    workerState{status: StatusIdle, hub: internal.NewHub()},
		consumer:    workerState{status: StatusIdle, hub: internal.NewHub()},
		topicTables: make(map[string]map[string]bool),
	}
}

// RecordTopicTable notes that tableName was produced to topic.
func (s *AppState) RecordTopicTable(topic, tableName string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.topicTables[topic] == nil {
		s.topicTables[topic] = make(map[string]bool)
	}
	s.topicTables[topic][tableName] = true
}

// TopicTablesSnapshot returns a copy of the topic→tables map as topic→[]string.
func (s *AppState) TopicTablesSnapshot() map[string][]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make(map[string][]string, len(s.topicTables))
	for topic, tables := range s.topicTables {
		list := make([]string, 0, len(tables))
		for t := range tables {
			list = append(list, t)
		}
		out[topic] = list
	}
	return out
}

// GetOrOpenDB returns an existing DB connection or opens a new one.
func (s *AppState) GetOrOpenDB(dsn string) (*sql.DB, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil && s.dbDSN == dsn {
		return s.db, nil
	}
	db, err := internal.OpenDB(dsn)
	if err != nil {
		return nil, err
	}
	if s.db != nil {
		s.db.Close()
	}
	s.db = db
	s.dbDSN = dsn
	return db, nil
}

func (s *AppState) CloseDB() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		s.db.Close()
		s.db = nil
	}
}

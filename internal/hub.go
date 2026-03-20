package internal

import (
	"fmt"
	"sync"
	"time"
)

// Hub broadcasts log lines to all subscribed SSE clients.
type Hub struct {
	mu      sync.Mutex
	clients map[chan string]struct{}
	closed  bool
}

func NewHub() *Hub {
	return &Hub{clients: make(map[chan string]struct{})}
}

// Subscribe registers a new SSE client and returns its channel.
func (h *Hub) Subscribe() chan string {
	ch := make(chan string, 64)
	h.mu.Lock()
	if !h.closed {
		h.clients[ch] = struct{}{}
	} else {
		close(ch)
	}
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes a client channel.
func (h *Hub) Unsubscribe(ch chan string) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
}

// Broadcast sends a message to all subscribers. Non-blocking per client.
func (h *Hub) Broadcast(msg string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- msg:
		default:
		}
	}
}

// Close marks the hub as closed and closes all client channels.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.closed = true
	for ch := range h.clients {
		close(ch)
	}
}

// HubWriter implements io.Writer, wrapping each Write as a broadcast event.
type HubWriter struct {
	hub   *Hub
	level string
}

func NewHubWriter(hub *Hub, level string) *HubWriter {
	return &HubWriter{hub: hub, level: level}
}

func (w *HubWriter) Write(p []byte) (int, error) {
	msg := fmt.Sprintf(`{"level":%q,"msg":%q,"ts":%q}`,
		w.level, string(p), time.Now().UTC().Format(time.RFC3339))
	w.hub.Broadcast(msg)
	return len(p), nil
}

package internal

import (
	"fmt"
	"sync"
	"time"
)

const replayBufSize = 500

// Hub broadcasts log lines to all subscribed SSE clients.
// It keeps a rolling replay buffer so that clients who connect after the
// producer/consumer has already started receive all previously-emitted lines.
type Hub struct {
	mu      sync.Mutex
	clients map[chan string]struct{}
	closed  bool
	replay  []string // ring buffer of the last replayBufSize messages
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[chan string]struct{}),
		replay:  make([]string, 0, replayBufSize),
	}
}

// Subscribe registers a new SSE client.  All buffered messages are sent
// immediately so that late-connecting clients see the full history.
func (h *Hub) Subscribe() chan string {
	ch := make(chan string, 128)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		close(ch)
		return ch
	}
	// Replay buffered messages to the new subscriber.
	for _, msg := range h.replay {
		select {
		case ch <- msg:
		default:
		}
	}
	h.clients[ch] = struct{}{}
	return ch
}

// Unsubscribe removes a client channel.
func (h *Hub) Unsubscribe(ch chan string) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
}

// Broadcast sends a message to all subscribers and appends it to the replay buffer.
func (h *Hub) Broadcast(msg string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	// Append to replay buffer, dropping oldest entry when full.
	if len(h.replay) >= replayBufSize {
		h.replay = h.replay[1:]
	}
	h.replay = append(h.replay, msg)
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

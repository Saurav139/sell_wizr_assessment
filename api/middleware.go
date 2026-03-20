package api

import (
	"log"
	"net/http"
	"runtime/debug"
	"time"
)

// CORS adds permissive CORS headers for local development.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// responseRecorder captures the HTTP status code written by a handler.
type responseRecorder struct {
	http.ResponseWriter
	status int
}

func (rr *responseRecorder) WriteHeader(code int) {
	rr.status = code
	rr.ResponseWriter.WriteHeader(code)
}

// Logger logs every request: method, path, status code, and duration.
// SSE streaming endpoints (/stream) are skipped to avoid noisy keep-alive lines.
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip per-message noise from SSE stream endpoints.
		if len(r.URL.Path) >= 7 && r.URL.Path[len(r.URL.Path)-6:] == "stream" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		rr := &responseRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rr, r)
		log.Printf("%s %s → %d (%s)", r.Method, r.URL.Path, rr.status, time.Since(start).Round(time.Millisecond))
	})
}

// Recovery catches panics in any handler, logs a stack trace, and returns 500.
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("PANIC: %v\n%s", err, debug.Stack())
				http.Error(w, "internal server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

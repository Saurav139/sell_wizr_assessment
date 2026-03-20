.PHONY: server dev dist build up down tidy producer consumer

# Build the React frontend into web/dist (served by the Go server)
dist:
	cd web && npm install && npm run build

# Build all Go binaries
build: dist
	go build -o table-streamer ./cmd/server
	go build ./cmd/producer ./cmd/consumer

# Run the Go server (requires web/dist to be built first)
server:
	go run ./cmd/server

# Run the Vite dev server and Go backend together
dev:
	cd web && npm run dev &
	go run ./cmd/server

# Docker helpers
up:
	docker-compose up -d

down:
	docker-compose down

tidy:
	go mod tidy

# Standalone producer/consumer CLI entrypoints
producer:
	go run ./cmd/producer

consumer:
	go run ./cmd/consumer

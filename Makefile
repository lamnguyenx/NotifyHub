.PHONY: web web-dev sv cli test test-bg clean

# Web assets
web:
	cd web && bun run build

web-dev:
	cd web && bun run dev

# Server and client
sv:
	python -m notifyhub.server --port 9080

cli:
	python -m notifyhub.cli --port 9080 "Hello"

# Testing
test:
	./run_tests.sh

test-bg: web
	@echo "Starting server in background for testing..."
	python -m notifyhub.server --port 9080 &
	@echo "Server started. Run tests, then use 'make clean' to stop server."

# Cleanup background processes
clean:
	@echo "Cleaning up background processes..."
	pkill -f "notifyhub.server" 2>/dev/null || true
	pkill -f "bun run dev" 2>/dev/null || true
	@echo "Cleanup complete."
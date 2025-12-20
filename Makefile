.PHONY: web web-dev sv cli test test-ui test-ui-debug test-chrome test-all test-bg clean install-plugin remove-plugin

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

test-ui:
	export CDP_WEBSOCKET_ENDPOINT=`curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl` && npx playwright test

test-ui-debug:
	export CDP_WEBSOCKET_ENDPOINT=`curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl` && echo "CDP_WEBSOCKET_ENDPOINT: $$CDP_WEBSOCKET_ENDPOINT" && npx playwright test --headed

test-chrome:
	npx tsx tests/ui/utils/test_chrome_connection.ts

test-all: test test-ui

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

# OpenCode plugin management
install-plugin:
	@echo "Installing NotifyHub plugin to OpenCode..."
	mkdir -p ~/.config/opencode/plugin
	cp chat_plugins/opencode/notifyhub-plugin.ts ~/.config/opencode/plugin/
	@echo "Plugin installed! Start NotifyHub server with 'make sv'"

remove-plugin:
	@echo "Removing NotifyHub plugin from OpenCode..."
	rm -f ~/.config/opencode/plugin/notifyhub-plugin.ts
	@echo "Plugin removed."
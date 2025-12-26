.PHONY: backend frontend frontend-dev noti chrome test-all test-chrome test-backend test-ui test-ui-debug install-plugin remove-plugin test-bg clean

# -----------------------------------
#            Production
# -----------------------------------
backend:
	python -m notifyhub.server --port 9080

frontend:
	cd web && bun run build

# -----------------------------------
#            Development
# -----------------------------------
frontend-dev:
	cd web && bun run dev

noti:
	python -m notifyhub.cli --port 9080 "Hello"

chrome:
	open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-dev-profile

# -----------------------------------
#             Testing
# -----------------------------------
test-all: test-chrome test-backend test-frontend

test-chrome:
	npx tsx tests/ui/utils/test_chrome_connection.ts

test-backend:
	python -m pytest tests/ -v

test-frontend:
	export CDP_WEBSOCKET_ENDPOINT=`curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl` && echo "CDP_WEBSOCKET_ENDPOINT: $$CDP_WEBSOCKET_ENDPOINT" && npx playwright test --headed

# -----------------------------------
#        Plugin Management
# -----------------------------------
install-plugin:
	@echo "Installing NotifyHub plugin to OpenCode..."
	mkdir -p ~/.config/opencode/plugin
	cp chat_plugins/opencode/notifyhub-plugin.ts ~/.config/opencode/plugin/
	@echo "Plugin installed! Start NotifyHub server with 'make backend'"

remove-plugin:
	@echo "Removing NotifyHub plugin from OpenCode..."
	rm -f ~/.config/opencode/plugin/notifyhub-plugin.ts
	@echo "Plugin removed."
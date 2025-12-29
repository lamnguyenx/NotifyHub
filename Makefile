.PHONY: backend frontend frontend-dev frontend-deps noti chrome test-all test-chrome test-backend test-frontend test-frontend-dev install-plugin remove-plugin test-bg clean

# -----------------------------------
#            Dependencies
# -----------------------------------
frontend-deps:
	cd notifyhub/frontend && bun install

# -----------------------------------
#            Production
# -----------------------------------
backend:
	python -m notifyhub.backend.backend --port 9080

frontend:
	cd notifyhub/frontend && bun run build

# -----------------------------------
#            Development
# -----------------------------------
frontend-dev:
	cd notifyhub/frontend && bun run dev

noti:
	python -m notifyhub.cli --port 9080 "Hello"

chrome:
	open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-dev-profile

# -----------------------------------
#             Testing
# -----------------------------------
test-all: test-chrome test-backend test-frontend test-frontend-dev

test-chrome:
	cd notifyhub/frontend && npx tsx __tests__/ui/utils/test_chrome_connection.ts

test-backend:
	python -m pytest notifyhub/backend/__tests__/ -v

test-frontend:
	cd notifyhub/frontend && export CDP_WEBSOCKET_ENDPOINT=`curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl` && echo "CDP_WEBSOCKET_ENDPOINT: $$CDP_WEBSOCKET_ENDPOINT" && npx playwright test --headed

test-frontend-dev:
	cd notifyhub/frontend && export BASE_URL=http://localhost:9070 && export CDP_WEBSOCKET_ENDPOINT=`curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl` && echo "CDP_WEBSOCKET_ENDPOINT: $$CDP_WEBSOCKET_ENDPOINT" && npx playwright test --headed

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
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
	./local/noti.sh "make noti"

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
	cd notifyhub/frontend && ./__tests__/run.sh prod

test-frontend-dev:
	cd notifyhub/frontend && ./__tests__/run.sh dev

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
.PHONY: backend frontend frontend-hotload frontend-deps noti chrome test-all test-chrome test-backend test-frontend test-frontend-hotload install-plugin remove-plugin test-bg clean fe fh beh t tb tf tfh tc

# -----------------------------------
#            Dependencies
# -----------------------------------
frontend-deps fed:
	cd src/notifyhub/frontend && bun install

# -----------------------------------
#            Static
# -----------------------------------
backend be:
	python -m notifyhub.backend.backend --port 9080

frontend fe:
	cd src/notifyhub/frontend && bun run build

# -----------------------------------
#            Hotload
# -----------------------------------
frontend-hotload fehl:
	cd src/notifyhub/frontend && bun run dev

noti:
	./local/noti.sh "make noti"

chrome:
	open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-dev-profile

# -----------------------------------
#             Testing
# -----------------------------------
test-all ta: test-chrome test-backend test-frontend test-frontend-hotload

test-chrome tc:
	cd src/notifyhub/frontend && npx tsx __tests__/ui/utils/test_chrome_connection.ts

test-backend tbe:
	python -m pytest notifyhub/backend/__tests__/ -v

test-frontend tfe:
	cd src/notifyhub/frontend && ./__tests__/run.py prod

test-frontend-hotload tfehl:
	cd src/notifyhub/frontend && ./__tests__/run.py dev

# -----------------------------------
#        Plugin Management
# -----------------------------------
install-plugin:
	@echo "Installing NotifyHub plugin to OpenCode..."
	mkdir -p ~/.config/opencode/plugin
	cp src/notifyhub/plugins/opencode/notifyhub-plugin.ts ~/.config/opencode/plugin/
	@echo "Plugin installed! Start NotifyHub server with 'make backend'"

remove-plugin:
	@echo "Removing NotifyHub plugin from OpenCode..."
	rm -f ~/.config/opencode/plugin/notifyhub-plugin.ts
	@echo "Plugin removed."

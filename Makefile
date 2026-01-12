.PHONY: backend frontend frontend-hotload frontend-deps plugin-deps noti chrome test-all test-chrome test-backend test-frontend test-frontend-hotload install-plugin remove-plugin test-bg clean fe fh beh t tb tf tfh tc

# -----------------------------------
#            Dependencies
# -----------------------------------
frontend-deps fed:
	cd src/notifyhub/frontend && bun install

plugin-deps:
	cd src/notifyhub/plugins/opencode && npm install

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
	mkdir -p exp/chrome-dev-profile && \
	open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=${PWD}/exp/chrome-dev-profile

# -----------------------------------
#             Testing
# -----------------------------------
test-all ta: test-chrome test-backend test-frontend test-frontend-hotload

test-chrome tc:
	cd src/notifyhub/frontend && npx tsx __tests__/ui/utils/test_chrome_connection.ts

test-backend tbe:
	python -m pytest src/notifyhub/backend/__tests__/ -v

test-frontend tfe:
	cd src/notifyhub/frontend && ./__tests__/run.py prod

test-frontend-hotload tfehl:
	cd src/notifyhub/frontend && ./__tests__/run.py dev

# -----------------------------------
#        Plugin Management
# -----------------------------------
check-plugin:
	ls -ltra ~/.config/opencode/plugin/

install-plugin:
	@echo "Installing NotifyHub plugin to OpenCode..."
	mkdir -p ~/.config/opencode/plugin
	gln -sfvrn src/notifyhub/plugins/opencode/notifyhub-plugin.ts ~/.config/opencode/plugin/notifyhub-plugin.ts
	gln -sfvrn src/notifyhub/notifyhub-push.py ~/.config/opencode/plugin/notifyhub-push.py
	gln -sfvrn src/notifyhub/plugins/opencode/opencode-trace.py ~/.config/opencode/plugin/opencode-trace.py
	@echo "Plugin installed! Start NotifyHub server with 'make backend'"

uninstall-plugin remove-plugin rm-plugin:
	@echo "Removing NotifyHub plugin from OpenCode..."
	rm ~/.config/opencode/plugin/notifyhub-plugin.ts
	rm ~/.config/opencode/plugin/notifyhub-push.py
	rm ~/.config/opencode/plugin/opencode-trace.py
	@echo "Plugin removed."

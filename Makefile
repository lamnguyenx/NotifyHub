.PHONY: backend config-md cm e2e-key e2ekey e2e-status e2es plugin-deps test-all ta test-backend tbe install-plugin install-plugin-copy remove-plugin install-plugin-ssh install-plugin-claude remove-plugin-claude install-plugin-codex remove-plugin-codex noti send-simple-bark ssb send-backend-bark sbb tui-deps td tui tui-prototype tp tui-typecheck ttc tui-test tt

# -----------------------------------
#            Dependencies
# -----------------------------------
plugin-deps:
	cd src/notifyhub/plugins/opencode && npm install

# -----------------------------------
#              Config
# -----------------------------------
config-md cm:
	python -c "from confstack import generate_config_markdown; from notifyhub.config import NotifyHubConfig; generate_config_markdown(NotifyHubConfig, 'notifyhub')"

# -----------------------------------
#            E2E encryption
# -----------------------------------
e2e-key e2ekey:
	python -m notifyhub.crypto --gen-key --write-default

e2e-status e2es:
	@python -m notifyhub.crypto --status || true

# -----------------------------------
#          Static Services
# -----------------------------------
backend be:
	@lsof -ti:$$(python -c "from confstack import confstackify; from notifyhub.config import NotifyHubConfig; print(confstackify(NotifyHubConfig, 'notifyhub').backend.port)") | xargs -r kill 2>/dev/null; true
	python -m notifyhub.backend.backend

# -----------------------------------
#              TUI
# -----------------------------------
tui-deps td:
	cd src/notifyhub/tui && bun install

tui:
	@python -m notifyhub.crypto --status 2>/dev/null || true
	cd src/notifyhub/tui && bun src/index.tsx

tui-prototype tp:
	cd src/notifyhub/tui && bun --watch src/prototype.tsx

tui-typecheck ttc:
	cd src/notifyhub/tui && bun run typecheck

tui-test tt:
	cd src/notifyhub/tui && bun test

noti:
	./local/noti.sh "make noti"

send-simple-bark ssb: ARGS?=Test from make send-simple-bark
send-simple-bark ssb:
	@./local/send-simple-bark.py '$(ARGS)'

send-backend-bark sbb: ARGS?=Test from make send-backend-bark [\#opencode.question]
send-backend-bark sbb:
	@./local/send-backend-noti.py '$(ARGS)'

# -----------------------------------
#             Testing
# -----------------------------------
test-all ta test-backend tbe:
	python -m pytest tests/notifyhub -v

# -----------------------------------
#        Plugin Management
# -----------------------------------
check-plugin:
	ls -ltra ~/.config/opencode/plugin/

# Install the shared push CLI before registering hooks that use it.
install-plugin: install-plugin-copy
	$(MAKE) install-plugin-claude install-plugin-codex

install-plugin-symlink:
	@echo "Installing NotifyHub plugin to OpenCode..."
	mkdir -p ~/.config/opencode/plugin
	for file in notifyhub-plugin.ts notifyhub-push.py; do \
		./bach_lite.sh archive ~/.config/opencode/plugin/$$file; \
	done
	gln -sfvrn src/notifyhub/plugins/opencode/notifyhub-plugin.ts ~/.config/opencode/plugin/notifyhub-plugin.ts
	gln -sfvrn src/notifyhub/cli/cli.py ~/.config/opencode/plugin/notifyhub-push.py
	ls -ltra ~/.config/opencode/plugin/
	@echo "Plugin installed! Start NotifyHub server with 'make backend'"

install-plugin-copy:
	@echo "Installing NotifyHub plugin to OpenCode (copying files)..."
	mkdir -p ~/.config/opencode/plugin
	for file in notifyhub-plugin.ts notifyhub-push.py; do \
		./bach_lite.sh archive ~/.config/opencode/plugin/$$file; \
	done
	cp src/notifyhub/plugins/opencode/notifyhub-plugin.ts ~/.config/opencode/plugin/
	cp src/notifyhub/cli/cli.py ~/.config/opencode/plugin/notifyhub-push.py
	ls -ltra ~/.config/opencode/plugin/
	@echo "Plugin installed! Start NotifyHub server with 'make backend'"

# Interactive: pick integrations (multi-select) and SSH hosts (multi-select,
# from ~/.ssh/config), then stream the plugin files + agent hook installs over
# one tar-over-ssh connection per host (same layout as `make install-plugin`).
# Only `Host` lines marked '# notifyhub' are offered (wildcards expand, e.g.
# `Host wsk* # notifyhub`); with no markers every host stays eligible.
#   make install-plugin-ssh
#   make install-plugin-ssh ARGS="--all --dry-run"
#   make install-plugin-ssh ARGS="-t opencode -H nuc,pp"
install-plugin-ssh:
	@bun local/install-plugin-ssh.ts $(ARGS)

uninstall-plugin remove-plugin rm-plugin:
	@echo "Removing NotifyHub plugin from OpenCode..."
	rm -f ~/.config/opencode/plugin/notifyhub-plugin.ts
	rm -f ~/.config/opencode/plugin/notifyhub-push.py
	rm -f ~/.config/opencode/plugin/opencode-trace.py
	@echo "Plugin removed."

install-plugin-claude:
	@echo "Installing NotifyHub hooks for Claude Code..."
	cd src/notifyhub/plugins/claude && python3 install.py

uninstall-plugin-claude remove-plugin-claude:
	@echo "Removing NotifyHub hooks from Claude Code..."
	cd src/notifyhub/plugins/claude && python3 install.py --remove

install-plugin-codex:
	@echo "Installing NotifyHub hooks for OpenAI Codex..."
	cd src/notifyhub/plugins/codex && python3 install.py

uninstall-plugin-codex remove-plugin-codex:
	@echo "Removing NotifyHub hooks from OpenAI Codex..."
	cd src/notifyhub/plugins/codex && python3 install.py --remove

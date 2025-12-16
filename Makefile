.PHONY: web

web:
	cd web && bun run build

web-dev:
	cd web && bun run dev

sv:
	python -m notifyhub.server --port 9080

cli:
	python -m notifyhub.cli --port 9080 "Hello"
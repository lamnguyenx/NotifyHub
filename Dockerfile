# Build frontend
FROM node:18-alpine AS frontend

ARG NPM_EXTRA_ARGS
ARG PIP_EXTRA_ARGS
# bun has no npm-style --no-ssl-check flag; it honours
# NODE_TLS_REJECT_UNAUTHORIZED instead. Set this to 0 when npm needs
# NPM_EXTRA_ARGS=--no-ssl-check (e.g. behind a TLS-intercepting proxy).
ARG BUN_TLS_REJECT_UNAUTHORIZED

WORKDIR /app

    COPY src/notifyhub/frontend/package*.json ./

    RUN --mount=type=cache,target=/root/.npm \
        --mount=type=cache,target=/root/.bun/install/cache \
        npm install -g bun ${NPM_EXTRA_ARGS} && \
        NODE_TLS_REJECT_UNAUTHORIZED=${BUN_TLS_REJECT_UNAUTHORIZED:-1} bun install

    COPY src/notifyhub/frontend/ .

    RUN bun run build


# Production Python backend
FROM python:3.11-slim as backend

ARG NPM_EXTRA_ARGS
ARG PIP_EXTRA_ARGS

WORKDIR /app

    COPY pyproject.toml .

    COPY src/ ./src/

    RUN --mount=type=cache,target=/root/.cache/pip \
        pip install ${PIP_EXTRA_ARGS} -e .

    COPY --from=frontend /app/static ./src/notifyhub/frontend/static/

EXPOSE 9080

CMD ["/bin/bash"]

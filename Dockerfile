# Build frontend
FROM node:18-alpine AS frontend

ARG NPM_EXTRA_ARGS
ARG PIP_EXTRA_ARGS

WORKDIR /app

    COPY src/notifyhub/frontend/package*.json ./

    RUN --mount=type=cache,target=/root/.npm \
        npm install -g bun ${NPM_EXTRA_ARGS} && \
        bun install ${NPM_EXTRA_ARGS}

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

# Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app

    COPY src/notifyhub/frontend/package*.json ./

    RUN --mount=type=cache,target=/root/.npm \
        npm install -g bun && \
        bun install

    COPY src/notifyhub/frontend/ .

    RUN bun run build


# Production Python backend
FROM python:3.11-slim

WORKDIR /app

    COPY pyproject.toml .

    COPY src/ ./src/

    RUN --mount=type=cache,target=/root/.cache/pip \
        pip install --no-cache-dir -e .

    COPY --from=frontend-builder /app/static ./src/notifyhub/frontend/static/

EXPOSE 9080

CMD ["/bin/bash"]

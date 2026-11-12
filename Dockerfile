# Production Python backend
FROM python:3.11-slim as backend

ARG PIP_EXTRA_ARGS

WORKDIR /app

    COPY pyproject.toml .

    COPY src/ ./src/

    RUN --mount=type=cache,target=/root/.cache/pip \
        pip install ${PIP_EXTRA_ARGS} -e .

EXPOSE 9080

CMD ["/bin/bash"]

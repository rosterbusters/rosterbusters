FROM python:3.12

ENV PYTHONUNBUFFERED=1

WORKDIR /app/

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

# Place executables in the environment at the front of the path
ENV PATH="/app/.venv/bin:$PATH"

# Compile bytecode
ENV UV_COMPILE_BYTECODE=1

# uv Cache
ENV UV_LINK_MODE=copy

# Copy dependency files first (for layer caching)
COPY ./pyproject.toml ./uv.lock /app/

# Install dependencies (without the project itself)
RUN uv sync --frozen --no-install-project

ENV PYTHONPATH=/app

COPY ./scripts /app/scripts
COPY ./alembic.ini /app/
COPY ./google_oauth_credentials.json /app/
COPY ./app /app/app
COPY ./tests /app/tests

# Sync the project (installs the project itself)
RUN uv sync --frozen

CMD ["fastapi", "run", "--workers", "4", "app/main.py"]

# Backend image. Build context is backend/. Started by docker-compose.yml.
FROM python:3.14-slim

ENV PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

RUN pip install --no-cache-dir uv

WORKDIR /app
COPY . .
RUN uv sync --frozen --no-dev

EXPOSE 8000
CMD ["sh", "docker-entrypoint.sh"]

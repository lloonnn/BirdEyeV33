#!/bin/sh
# Container start: migrate, seed an empty database once, then serve.
# A clean start is "docker compose down -v". Nothing here resets data.
set -e

alembic upgrade head

# Seed only when the defects table has no rows.
if python -c "
import sys
from sqlalchemy import text
from bird_eye.db import make_engine
from bird_eye.settings import get_settings
with make_engine(get_settings().database_url).connect() as conn:
    sys.exit(1 if conn.execute(text('SELECT count(*) FROM defects')).scalar_one() else 0)
"; then
    echo "Database is empty: seeding invented data."
    python scripts/seed.py
else
    echo "Database has defects: not seeding."
fi

echo "Bird Eye is running"
echo "Dashboard: http://localhost:3000"
echo "API:       http://localhost:8000"
exec uvicorn bird_eye.main:app --host 0.0.0.0 --port 8000

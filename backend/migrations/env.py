"""Alembic environment. The URL comes from sqlalchemy.url if set (tests), else from Settings."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from bird_eye.settings import get_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

url = config.get_main_option("sqlalchemy.url") or get_settings().database_url

engine = create_engine(url)
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()
engine.dispose()

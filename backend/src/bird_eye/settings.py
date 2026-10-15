"""Backend configuration, read from backend/.env with defaults here.

Every threshold is a config value (decision 26), never hard-coded in the logic.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BIRDEYE_", env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://birdeye:birdeye@localhost:5432/birdeye"
    test_database_url: str = "postgresql+psycopg://birdeye:birdeye@localhost:5432/birdeye_test"

    # Browser origins allowed to call the API (decision 80).
    cors_origins: list[str] = ["http://localhost:3000"]

    # Crops on local disk behind the storage interface (decision 34).
    crop_dir: str = "./data/crops"
    crop_url_prefix: str = "/crops"

    # Timestamps in responses are written in this zone, so they carry the +08:00 offset.
    local_timezone: str = "Asia/Kuala_Lumpur"

    # Ingest limits.
    max_crop_bytes: int = 200_000  # starting value, to be tuned
    max_records_per_batch: int = 200  # starting value, to be tuned
    max_future_skew_minutes: float = 5  # starting value, to be tuned

    # GET /defects.
    defects_limit_default: int = 500  # starting value, to be tuned
    defects_limit_max: int = 1000  # starting value, to be tuned

    # Urgency terms, each from 0 to 1.
    type_term_pothole: float = 1.0  # starting value, to be tuned
    type_term_crack: float = 0.5  # starting value, to be tuned
    age_full_days: float = 30  # starting value, to be tuned

    # Urgency weights start equal (decision 45).
    weight_type: float = 0.25  # starting value, to be tuned
    weight_size: float = 0.25  # starting value, to be tuned
    weight_location: float = 0.25  # starting value, to be tuned
    weight_age: float = 0.25  # starting value, to be tuned

    # Band cut-offs (decision 65).
    band_high_min: float = 0.66  # starting value, to be tuned
    band_medium_min: float = 0.33  # starting value, to be tuned

    def type_term(self, defect_type: str) -> float:
        return self.type_term_pothole if defect_type == "pothole" else self.type_term_crack


@lru_cache
def get_settings() -> Settings:
    return Settings()

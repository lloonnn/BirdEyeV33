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

    # /dev routes (clean passes, draft work orders) exist only when this is on. Not part of the contract.
    dev_endpoints_enabled: bool = False

    # Merge and passes.
    merge_radius_m: float = 8  # starting value, to be tuned
    pass_gap_minutes: float = 60  # starting value, to be tuned
    passes_to_verify: int = 3  # starting value, to be tuned
    # Repair confirmation through the /dev clean pass endpoint (decisions 40 and 41).
    clean_passes_to_confirm: int = 3  # starting value, to be tuned
    clean_pass_min_days: int = 2  # starting value, to be tuned
    # Reviews queued per rejected defect per Malaysia calendar day (by captured_at).
    rejected_spot_reviews_per_day: int = 1  # starting value, to be tuned

    # Urgency terms, each from 0 to 1.
    type_term_pothole: float = 1.0  # starting value, to be tuned
    type_term_crack: float = 0.5  # starting value, to be tuned
    # Box area, as a share of the frame, that scores 1.0 on the size term.
    size_area_max: float = 0.05  # starting value, to be tuned
    age_full_days: float = 30  # starting value, to be tuned

    # Location term: invented points for the test area (no road segments in the prototype).
    # A relative path is read from the directory the server runs in, backend/.
    location_points_file: str = "config/test_area_points.toml"
    location_radius_school_m: float = 300  # starting value, to be tuned
    location_radius_main_road_m: float = 20  # starting value, to be tuned
    location_radius_junction_m: float = 30  # starting value, to be tuned

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

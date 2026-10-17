"""Development data maintenance: reset before the demo."""

from sqlalchemy import Engine, text

from bird_eye.storage import CropStorage

# Every application table. Later phases add theirs here.
APP_TABLES = ("defect_history", "clean_passes", "reviews", "work_order_defects", "work_orders", "defects", "sightings")


def reset_all(engine: Engine, storage: CropStorage) -> tuple[int, int]:
    """Empty every application table and delete every stored crop. Returns (defects, crops) removed."""
    with engine.begin() as conn:
        defects = conn.execute(text("SELECT count(*) FROM defects")).scalar_one()
        conn.execute(text(f"TRUNCATE {', '.join(APP_TABLES)} RESTART IDENTITY CASCADE"))
    return defects, storage.delete_all()

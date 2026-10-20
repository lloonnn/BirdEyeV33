from pathlib import Path

from bird_eye.maintenance import reset_all
from tests.conftest import count, make_record, post_batch


def test_reset_empties_tables_and_crops(client, engine, settings):
    post_batch(client, [make_record("x-1"), make_record("x-2", band="review")])
    assert count(engine, "sightings") == 2
    reset_all(engine, client.app.state.storage)
    assert count(engine, "sightings") == 0
    assert count(engine, "defects") == 0
    assert list(Path(settings.crop_dir).iterdir()) == []

import json
from datetime import timedelta

from tests.conftest import CROP, FROZEN_NOW, count, make_record, post_batch


def test_same_batch_twice_stores_one_sighting(client, engine):
    batch = [make_record("test-0001")]
    first = post_batch(client, batch)
    second = post_batch(client, batch)
    assert first.status_code == 200 and first.json() == {"accepted": 1, "duplicates": 0}
    assert second.status_code == 200 and second.json() == {"accepted": 0, "duplicates": 1}
    assert count(engine, "sightings") == 1
    assert count(engine, "defects") == 1


def test_duplicate_client_id_inside_one_batch(client, engine):
    response = post_batch(client, [make_record("dup"), make_record("dup")])
    assert response.json() == {"accepted": 1, "duplicates": 1}
    assert count(engine, "sightings") == 1


def test_invalid_record_rejects_whole_batch_422(client, engine):
    response = post_batch(client, [make_record("ok-1"), make_record("bad-1", confidence=1.5)])
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert count(engine, "sightings") == 0


def test_missing_crop_part_422(client, engine):
    response = post_batch(client, [make_record("c-1", crop_file="other.jpg")])
    assert response.status_code == 422
    assert count(engine, "sightings") == 0


def test_review_band_stored_without_defect(client, engine):
    response = post_batch(client, [make_record("r-1", band="review", confidence=0.5)])
    assert response.json() == {"accepted": 1, "duplicates": 0}
    assert count(engine, "sightings") == 1
    assert count(engine, "defects") == 0


def test_bbox_value_outside_0_to_1_422(client, engine):
    assert post_batch(client, [make_record("b-1", bbox=[0.2, 0.5, 1.2, 0.9])]).status_code == 422
    assert post_batch(client, [make_record("b-2", bbox=[-0.1, 0.5, 0.4, 0.9])]).status_code == 422
    assert count(engine, "sightings") == 0


def test_bbox_x2_not_greater_than_x1_422(client, engine):
    assert post_batch(client, [make_record("b-3", bbox=[0.6, 0.5, 0.6, 0.9])]).status_code == 422
    assert count(engine, "sightings") == 0


def test_bbox_y2_not_greater_than_y1_422(client, engine):
    assert post_batch(client, [make_record("b-4", bbox=[0.2, 0.9, 0.4, 0.5])]).status_code == 422
    assert count(engine, "sightings") == 0


def test_captured_at_far_in_future_rejects_batch_422(client, engine):
    too_far = (FROZEN_NOW + timedelta(minutes=10)).isoformat()
    within = (FROZEN_NOW + timedelta(minutes=4)).isoformat()
    assert post_batch(client, [make_record("f-1", captured_at=too_far)]).status_code == 422
    assert count(engine, "sightings") == 0
    response = post_batch(client, [make_record("f-2", captured_at=within)])
    assert response.json() == {"accepted": 1, "duplicates": 0}


def test_crop_saved_under_client_id_and_served(client):
    post_batch(client, [make_record("serve-1")])
    response = client.get("/crops/serve-1.jpg")
    assert response.status_code == 200
    assert response.content.startswith(b"\xff\xd8\xff")


def post_raw_records(client, records_json: str):
    return client.post(
        "/detections/batch",
        data={"records": records_json},
        files=[("crop.jpg", ("crop.jpg", CROP, "image/jpeg"))],
    )


def test_nan_and_infinity_in_records_rejected_422(client, engine):
    good = json.dumps(make_record("n-1"))
    in_known_field = good.replace('"confidence": 0.91', '"confidence": Infinity')
    in_ignored_field = good[:-1] + ', "extra": NaN}'
    in_nested_field = good[:-1] + ', "extra": {"x": [-Infinity]}}'
    for body in (in_known_field, in_ignored_field, in_nested_field):
        assert "Infinity" in body or "NaN" in body
        response = post_raw_records(client, f"[{body}]")
        assert response.status_code == 422, body
        assert isinstance(response.json()["detail"], list)
    assert count(engine, "sightings") == 0
    assert post_raw_records(client, f"[{good}]").json() == {"accepted": 1, "duplicates": 0}

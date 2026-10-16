from bird_eye.urgency import band
from tests.conftest import at, defects, only_defect, post_batch, make_record, moved, sight

SCHOOL = {"lat": 3.1900, "lon": 101.5200}  # from tests/data/test_points.toml


def test_school_point_in_location_reasons(client):
    record = make_record("u-1", captured_at=at(14, 9), defect_point=moved(**SCHOOL, north_m=250))
    post_batch(client, [record])
    defect = only_defect(client)
    assert defect["location_reasons"] == ["school"]
    assert defect["urgency_terms"]["location"] == 1.0


def test_far_from_points_has_no_location_reason(client):
    sight(client, "u-1", at(14, 9))
    defect = only_defect(client)
    assert defect["location_reasons"] == []
    assert defect["urgency_terms"]["location"] == 0.0


def test_terms_and_urgency_between_0_and_1(client):
    sight(client, "u-1", at(1, 9), bbox=[0.0, 0.0, 1.0, 1.0])  # whole frame: size capped at 1
    sight(client, "u-2", at(14, 9), north_m=50, bbox=[0.40, 0.55, 0.45, 0.60], defect_type="crack")
    found = {d["type"]: d for d in defects(client)}
    assert found["pothole"]["urgency_terms"]["size"] == 1.0
    # 0.05 * 0.05 = 0.0025 of the frame, against size_area_max 0.05.
    assert found["crack"]["urgency_terms"]["size"] == 0.05
    assert found["crack"]["urgency_terms"]["type"] == 0.5
    for defect in found.values():
        assert 0 <= defect["urgency"] <= 1
        assert all(0 <= v <= 1 for v in defect["urgency_terms"].values())


def test_band_follows_cutoffs(settings):
    assert band(settings.band_high_min, settings) == "high"
    assert band(settings.band_high_min - 0.0001, settings) == "medium"
    assert band(settings.band_medium_min, settings) == "medium"
    assert band(settings.band_medium_min - 0.0001, settings) == "low"
    assert band(1.0, settings) == "high" and band(0.0, settings) == "low"

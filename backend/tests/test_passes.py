from datetime import datetime, timedelta

from bird_eye.passes import count_passes
from tests.conftest import BASE, at, make_record, moved, only_defect, post_batch, sight


def test_three_passes_verify(client):
    for i, (hh, mm) in enumerate([(9, 0), (10, 5), (11, 10)]):
        sight(client, f"p-{i}", at(14, hh, mm))
    assert only_defect(client)["status"] == "verified"


def test_one_pass_stays_detected(client):
    for i, (hh, mm) in enumerate([(9, 0), (9, 20), (9, 50)]):
        sight(client, f"p-{i}", at(14, hh, mm))
    assert only_defect(client)["status"] == "detected"


def test_two_passes_stays_detected(client):
    for i, (hh, mm) in enumerate([(9, 0), (9, 50), (10, 40)]):
        sight(client, f"p-{i}", at(14, hh, mm))
    assert only_defect(client)["status"] == "detected"


def test_two_devices_within_hour_count_as_one_pass(client):
    sight(client, "p-1", at(14, 9, 0), device_id="car-01")
    sight(client, "p-2", at(14, 9, 10), device_id="car-02")
    sight(client, "p-3", at(14, 10, 5), device_id="car-02")
    sight(client, "p-4", at(14, 10, 15), device_id="car-01")
    defect = only_defect(client)
    assert defect["sighting_count"] == 4
    assert defect["status"] == "detected"  # two passes, not four


def test_out_of_order_batch_counts_by_captured_at(client):
    # One late batch holding 11:10 and 09:00, then 10:05 alone: three passes by captured_at.
    late = [
        make_record("p-3", captured_at=at(14, 11, 10), defect_point=moved(**BASE)),
        make_record("p-1", captured_at=at(14, 9, 0), defect_point=moved(**BASE, north_m=1)),
    ]
    assert post_batch(client, late).json() == {"accepted": 2, "duplicates": 0}
    assert only_defect(client)["status"] == "detected"
    sight(client, "p-2", at(14, 10, 5))
    defect = only_defect(client)
    assert defect["status"] == "verified"
    assert defect["first_seen"] == at(14, 9, 0)


def test_count_passes_anchors_to_pass_start():
    t0 = datetime(2026, 10, 14, 9, 0)
    gap = timedelta(hours=1)
    minutes = lambda *ms: [t0 + timedelta(minutes=m) for m in ms]  # noqa: E731
    assert count_passes(minutes(0, 65, 130), gap) == 3
    assert count_passes(minutes(0, 20, 50), gap) == 1
    assert count_passes(minutes(0, 50, 100), gap) == 2
    assert count_passes(minutes(0, 50, 100, 150), gap) == 2
    assert count_passes([], gap) == 0

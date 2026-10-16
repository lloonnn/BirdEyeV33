from tests.conftest import BASE, at, defects, moved, only_defect, sight


def test_sightings_5m_apart_make_one_defect(client):
    sight(client, "m-1", at(14, 9))
    sight(client, "m-2", at(14, 9, 1), north_m=5)
    defect = only_defect(client)
    assert defect["sighting_count"] == 2


def test_sightings_12m_apart_make_two_defects(client):
    sight(client, "m-1", at(14, 9))
    sight(client, "m-2", at(14, 9, 1), north_m=12)
    assert len(defects(client)) == 2


def test_same_spot_different_type_makes_two_defects(client):
    sight(client, "m-1", at(14, 9), defect_type="pothole")
    sight(client, "m-2", at(14, 9, 1), defect_type="crack")
    assert sorted(d["type"] for d in defects(client)) == ["crack", "pothole"]


def test_position_is_average_of_sightings(client):
    sight(client, "m-1", at(14, 9))
    sight(client, "m-2", at(14, 9, 1), north_m=4, east_m=4)
    sight(client, "m-3", at(14, 9, 2), north_m=-1, east_m=2)
    defect = only_defect(client)
    # Mean offset is (1 m north, 2 m east).
    assert abs(defect["lat"] - (BASE["lat"] + 1 / 111_320)) < 1e-7
    expected = moved(BASE["lat"], BASE["lon"], north_m=1, east_m=2)
    assert abs(defect["lon"] - expected["lon"]) < 1e-7


def test_best_crop_is_highest_confidence(client):
    sight(client, "m-1", at(14, 9), confidence=0.85)
    sight(client, "m-2", at(14, 9, 1), north_m=2, confidence=0.97)
    assert only_defect(client)["crop_url"] == "/crops/m-2.jpg"

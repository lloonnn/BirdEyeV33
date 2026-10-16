from tests.conftest import at, count, defects, only_defect, sight


def pending(client):
    return client.get("/reviews").json()


def answer(client, review_id, **body):
    return client.post(f"/reviews/{review_id}", json=body)


def test_review_shape_and_status_filter(client):
    sight(client, "v-1", at(14, 9), band="review", confidence=0.5, defect_type="crack")
    body = pending(client)
    assert len(body) == 1
    review = body[0]
    assert set(review) == {"id", "status", "sighting"} and review["status"] == "pending"
    assert review["sighting"]["client_id"] == "v-1"
    assert review["sighting"]["band"] == "review"
    assert review["sighting"]["crop_url"] == "/crops/v-1.jpg"
    assert review["sighting"]["captured_at"] == at(14, 9)  # as uploaded
    assert client.get("/reviews", params={"status": "answered"}).json() == []
    assert client.get("/reviews", params={"status": "other"}).status_code == 422
    assert count(client.app.state.engine, "defects") == 0  # a review-band record creates no defect
    answer(client, review["id"], answer="not_defect")
    assert pending(client) == []
    assert [r["status"] for r in client.get("/reviews", params={"status": "answered"}).json()] == ["answered"]


def test_correct_merges_like_save_band(client):
    sight(client, "v-1", at(14, 9))
    sight(client, "v-2", at(14, 9, 20), north_m=3, band="review", confidence=0.5)
    assert only_defect(client)["sighting_count"] == 1  # the review-band record waits
    response = answer(client, pending(client)[0]["id"], answer="correct")
    assert response.status_code == 200 and response.json()["status"] == "answered"
    assert only_defect(client)["sighting_count"] == 2

    # With no defect there yet, a correct answer creates one.
    sight(client, "v-3", at(14, 10), north_m=100, band="review", confidence=0.5)
    answer(client, pending(client)[0]["id"], answer="correct")
    assert len(defects(client)) == 2


def test_review_answered_correct_counts_toward_passes(client):
    sight(client, "v-1", at(14, 9, 0))
    sight(client, "v-2", at(14, 10, 30), band="review", confidence=0.5)
    answer(client, pending(client)[0]["id"], answer="correct")
    sight(client, "v-3", at(14, 12, 0))
    defect = only_defect(client)
    assert defect["sighting_count"] == 3
    assert defect["status"] == "verified"  # 09:00, 10:30 and 12:00 are three passes


def test_wrong_class_without_class_422(client):
    sight(client, "v-1", at(14, 9), band="review", confidence=0.5)
    review_id = pending(client)[0]["id"]
    assert answer(client, review_id, answer="wrong_class").status_code == 422
    assert answer(client, review_id, answer="wrong_class", **{"class": "drain"}).status_code == 422
    assert answer(client, review_id, answer="maybe").status_code == 422
    assert len(pending(client)) == 1  # still waiting


def test_wrong_class_merges_with_corrected_class(client):
    sight(client, "v-1", at(14, 9), band="review", confidence=0.5, defect_type="crack")
    response = answer(client, pending(client)[0]["id"], answer="wrong_class", **{"class": "pothole"})
    assert response.status_code == 200 and response.json()["status"] == "answered"
    assert only_defect(client)["type"] == "pothole"
    # The review still shows the record as uploaded.
    assert client.get("/reviews", params={"status": "answered"}).json()[0]["sighting"]["defect_type"] == "crack"


def test_not_defect_marks_negative_creates_nothing(client, engine):
    from sqlalchemy import text

    sight(client, "v-1", at(14, 9), band="review", confidence=0.5)
    assert answer(client, pending(client)[0]["id"], answer="not_defect").status_code == 200
    assert count(engine, "defects") == 0
    with engine.connect() as conn:
        assert conn.execute(text("SELECT negative_example FROM sightings")).scalar_one() is True


def test_answer_twice_409(client):
    sight(client, "v-1", at(14, 9), band="review", confidence=0.5)
    review_id = pending(client)[0]["id"]
    assert answer(client, review_id, answer="not_defect").status_code == 200
    again = answer(client, review_id, answer="correct")
    assert again.status_code == 409 and isinstance(again.json()["detail"], str)
    assert count(client.app.state.engine, "defects") == 0


def test_unknown_review_404(client):
    assert answer(client, 999999, answer="correct").status_code == 404

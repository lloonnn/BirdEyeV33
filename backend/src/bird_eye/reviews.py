"""Reviews: unsure detections, and sightings near a rejected defect, waiting for a supervisor."""


from sqlalchemy import Connection, text

from bird_eye import clock
from bird_eye.errors import ConflictError, NotFoundError
from bird_eye.merge import lock_merges, merge_sighting
from bird_eye.schemas import Review
from bird_eye.settings import Settings
from bird_eye.storage import CropStorage


def queue_review(conn: Connection, settings: Settings, sighting_id: int) -> None:
    """Queue a review for a freshly merged sighting, if it needs one.

    - near a Rejected defect (save or review band): a rejected-spot review, at most
      rejected_spot_reviews_per_day per rejected defect per Malaysia calendar day of captured_at;
      further sightings that day create nothing;
    - otherwise a review-band sighting: a normal review;
    - otherwise nothing.
    """
    s = conn.execute(
        text("SELECT band, near_rejected_defect_id, captured_at FROM sightings WHERE id = :id"),
        {"id": sighting_id},
    ).one()
    rejected_id = s.near_rejected_defect_id
    if rejected_id is None and s.band != "review":
        return
    if rejected_id is not None:
        already = conn.execute(
            text(
                """
                SELECT count(*) FROM reviews r JOIN sightings o ON o.id = r.sighting_id
                WHERE r.rejected_defect_id = :rejected
                  AND (o.captured_at AT TIME ZONE :tz)::date
                      = (CAST(:captured_at AS timestamptz) AT TIME ZONE :tz)::date
                """
            ),
            {"rejected": rejected_id, "tz": settings.local_timezone, "captured_at": s.captured_at},
        ).scalar_one()
        if already >= settings.rejected_spot_reviews_per_day:
            return
    conn.execute(
        text("INSERT INTO reviews (sighting_id, rejected_defect_id) VALUES (:sighting_id, :rejected)"),
        {"sighting_id": sighting_id, "rejected": rejected_id},
    )


_SELECT = """
SELECT r.id, r.status, s.record, s.crop_key
FROM reviews r JOIN sightings s ON s.id = r.sighting_id
"""


def _to_review(row, storage: CropStorage) -> Review:
    return Review(
        id=row["id"],
        status=row["status"],
        sighting={**row["record"], "crop_url": storage.url(row["crop_key"])},
    )


def list_reviews(conn: Connection, storage: CropStorage, status: str) -> list[Review]:
    rows = conn.execute(
        text(_SELECT + " WHERE r.status = :status ORDER BY r.id"), {"status": status}
    ).mappings().all()
    return [_to_review(r, storage) for r in rows]


def get_review(conn: Connection, storage: CropStorage, review_id: int) -> Review:
    row = conn.execute(text(_SELECT + " WHERE r.id = :id"), {"id": review_id}).mappings().one_or_none()
    if row is None:
        raise NotFoundError(f"Review {review_id} not found")
    return _to_review(row, storage)


def answer_review(
    conn: Connection,
    settings: Settings,
    storage: CropStorage,
    review_id: int,
    answer: str,
    defect_class: str | None,
) -> Review:
    """Apply a supervisor's answer.

    correct: merge as a save-band record. wrong_class: set the sighting's type, then merge.
    not_defect: keep the crop as a negative training example; no defect is created or changed.
    A rejected-spot review that is merged creates its new defect linked to the rejected one.
    """
    lock_merges(conn)  # an answer merges, so it takes the same lock as ingest
    review = conn.execute(
        text("SELECT status, sighting_id, rejected_defect_id FROM reviews WHERE id = :id FOR UPDATE"),
        {"id": review_id},
    ).one_or_none()
    if review is None:
        raise NotFoundError(f"Review {review_id} not found")
    if review.status == "answered":
        raise ConflictError(f"Review {review_id} is already answered")

    if answer == "not_defect":
        conn.execute(
            text("UPDATE sightings SET negative_example = true WHERE id = :id"), {"id": review.sighting_id}
        )
    else:
        if answer == "wrong_class":
            conn.execute(
                text("UPDATE sightings SET defect_type = :type WHERE id = :id"),
                {"type": defect_class, "id": review.sighting_id},
            )
        merge_sighting(
            conn,
            settings,
            review.sighting_id,
            as_review_answer=True,
            related_defect_id=review.rejected_defect_id,
        )
    conn.execute(
        text(
            "UPDATE reviews SET status = 'answered', answer = :answer, answer_class = :cls, "
            "answered_at = :now WHERE id = :id"
        ),
        {
            "answer": answer,
            "cls": defect_class if answer == "wrong_class" else None,
            "now": clock.now(),
            "id": review_id,
        },
    )
    return get_review(conn, storage, review_id)

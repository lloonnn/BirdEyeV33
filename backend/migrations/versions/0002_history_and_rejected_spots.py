"""Defect history and the rejected-spot link on sightings, Phase 2.

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE defect_history (
            id                bigserial PRIMARY KEY,
            defect_id         bigint NOT NULL REFERENCES defects (id),
            status            text NOT NULL CHECK (status IN
                                ('detected', 'verified', 'scheduled', 'fixed', 'confirmed', 'rejected')),
            at                timestamptz NOT NULL,
            -- Database only; not in any response (decided 15 Oct).
            related_defect_id bigint REFERENCES defects (id),
            note              text
        )
        """
    )
    op.execute("CREATE INDEX defect_history_defect_id_idx ON defect_history (defect_id, id)")
    op.execute("ALTER TABLE sightings ADD COLUMN near_rejected_defect_id bigint REFERENCES defects (id)")


def downgrade() -> None:
    op.execute("ALTER TABLE sightings DROP COLUMN near_rejected_defect_id")
    op.execute("DROP TABLE defect_history")

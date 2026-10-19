"""Reviews and work orders, Phase 3.

Revision ID: 0003
Revises: 0002
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE reviews (
            id                bigserial PRIMARY KEY,
            sighting_id       bigint NOT NULL UNIQUE REFERENCES sightings (id),
            status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered')),
            answer            text CHECK (answer IN ('correct', 'wrong_class', 'not_defect')),
            answer_class      text CHECK (answer_class IN ('pothole', 'crack')),
            answered_at       timestamptz,
            -- Database only; not in any response (decided 15 Oct).
            rejected_defect_id bigint REFERENCES defects (id),
            created_at        timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX reviews_status_idx ON reviews (status, id)")
    op.execute("CREATE INDEX reviews_rejected_defect_idx ON reviews (rejected_defect_id)")
    op.execute(
        """
        CREATE TABLE work_orders (
            id          bigserial PRIMARY KEY,
            status      text NOT NULL DEFAULT 'pending_approval'
                          CHECK (status IN ('pending_approval', 'approved', 'rejected', 'done')),
            crew_type   text NOT NULL,
            description text NOT NULL,
            created_at  timestamptz NOT NULL DEFAULT now(),
            approved_at timestamptz,
            invented    boolean NOT NULL DEFAULT false
        )
        """
    )
    op.execute(
        """
        CREATE TABLE work_order_defects (
            work_order_id bigint NOT NULL REFERENCES work_orders (id) ON DELETE CASCADE,
            defect_id     bigint NOT NULL REFERENCES defects (id),
            PRIMARY KEY (work_order_id, defect_id)
        )
        """
    )
    op.execute(
        "ALTER TABLE defects ADD CONSTRAINT defects_work_order_fk "
        "FOREIGN KEY (work_order_id) REFERENCES work_orders (id)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE defects DROP CONSTRAINT defects_work_order_fk")
    op.execute("DROP TABLE work_order_defects")
    op.execute("DROP TABLE work_orders")
    op.execute("DROP TABLE reviews")

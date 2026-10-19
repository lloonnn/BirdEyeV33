"""Clean passes for the /dev confirmation path, Phase 4.

Revision ID: 0004
Revises: 0003
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE clean_passes (
            id         bigserial PRIMARY KEY,
            defect_id  bigint NOT NULL REFERENCES defects (id),
            at         timestamptz NOT NULL,
            cycle      integer NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX clean_passes_defect_idx ON clean_passes (defect_id, cycle)")


def downgrade() -> None:
    op.execute("DROP TABLE clean_passes")

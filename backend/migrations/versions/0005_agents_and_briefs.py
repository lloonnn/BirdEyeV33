"""Agent runs, tool call log and briefs, Phase 5.

Revision ID: 0005
Revises: 0004
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE agent_runs (
            id          bigserial PRIMARY KEY,
            agent       text NOT NULL,
            started_at  timestamptz NOT NULL,
            finished_at timestamptz,
            steps       integer NOT NULL DEFAULT 0,
            outcome     text CHECK (outcome IN ('ok', 'step_limit', 'error')),
            error       text
        )
        """
    )
    op.execute(
        """
        CREATE TABLE agent_tool_calls (
            run_id bigint NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
            step   integer NOT NULL,
            tool   text NOT NULL,
            args   jsonb NOT NULL,
            result jsonb NOT NULL
        )
        """
    )
    op.execute("CREATE INDEX agent_tool_calls_run_idx ON agent_tool_calls (run_id, step)")
    op.execute(
        """
        CREATE TABLE briefs (
            id         bigserial PRIMARY KEY,
            created_at timestamptz NOT NULL,
            text       text NOT NULL,
            agent_run_id bigint REFERENCES agent_runs (id)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE brief_defects (
            brief_id  bigint NOT NULL REFERENCES briefs (id) ON DELETE CASCADE,
            defect_id bigint NOT NULL REFERENCES defects (id),
            PRIMARY KEY (brief_id, defect_id)
        )
        """
    )
    op.execute("ALTER TABLE work_orders ADD COLUMN agent_run_id bigint REFERENCES agent_runs (id)")


def downgrade() -> None:
    op.execute("ALTER TABLE work_orders DROP COLUMN agent_run_id")
    op.execute("DROP TABLE brief_defects")
    op.execute("DROP TABLE briefs")
    op.execute("DROP TABLE agent_tool_calls")
    op.execute("DROP TABLE agent_runs")

"""Defects and sightings, Phase 1.

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute(
        """
        CREATE TABLE defects (
            id               bigserial PRIMARY KEY,
            type             text NOT NULL CHECK (type IN ('pothole', 'crack')),
            status           text NOT NULL CHECK (status IN
                               ('detected', 'verified', 'scheduled', 'fixed', 'confirmed', 'rejected')),
            geog             geography(Point, 4326) NOT NULL,
            first_seen       timestamptz NOT NULL,
            last_seen        timestamptz NOT NULL,
            type_term        double precision NOT NULL DEFAULT 0,
            size_term        double precision NOT NULL DEFAULT 0,
            location_term    double precision NOT NULL DEFAULT 0,
            location_reasons text[] NOT NULL DEFAULT '{}',
            best_sighting_id bigint,
            work_order_id    bigint,
            confirmed_at     timestamptz,
            cycle            integer NOT NULL DEFAULT 1,
            invented         boolean NOT NULL DEFAULT false
        )
        """
    )
    op.execute(
        """
        CREATE TABLE sightings (
            id               bigserial PRIMARY KEY,
            client_id        text NOT NULL UNIQUE,
            device_id        text NOT NULL,
            captured_at      timestamptz NOT NULL,
            defect_type      text NOT NULL CHECK (defect_type IN ('pothole', 'crack')),
            confidence       double precision NOT NULL,
            band             text NOT NULL CHECK (band IN ('save', 'review')),
            record           jsonb NOT NULL,
            defect_geog      geography(Point, 4326) NOT NULL,
            crop_key         text NOT NULL,
            defect_id        bigint REFERENCES defects (id),
            cycle            integer,
            negative_example boolean NOT NULL DEFAULT false,
            received_at      timestamptz NOT NULL DEFAULT now(),
            invented         boolean NOT NULL DEFAULT false
        )
        """
    )
    op.execute(
        "ALTER TABLE defects ADD CONSTRAINT defects_best_sighting_fk "
        "FOREIGN KEY (best_sighting_id) REFERENCES sightings (id)"
    )
    op.execute("CREATE INDEX defects_geog_idx ON defects USING gist (geog)")
    op.execute("CREATE INDEX sightings_defect_geog_idx ON sightings USING gist (defect_geog)")
    op.execute("CREATE INDEX sightings_defect_id_idx ON sightings (defect_id)")


def downgrade() -> None:
    op.execute("ALTER TABLE defects DROP CONSTRAINT defects_best_sighting_fk")
    op.execute("DROP TABLE sightings")
    op.execute("DROP TABLE defects")

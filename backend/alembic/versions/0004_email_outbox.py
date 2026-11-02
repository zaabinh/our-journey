"""Add the email outbox and the activity-email opt-out."""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("email_notifications", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "email_outbox",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("dedupe_key", sa.String(200), nullable=False, unique=True),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("album_id", sa.String(36), nullable=True),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("category IN ('security','activity')"),
        sa.CheckConstraint("status IN ('pending','sent','failed','skipped')"),
    )


def downgrade():
    op.drop_table("email_outbox")
    op.drop_column("users", "email_notifications")

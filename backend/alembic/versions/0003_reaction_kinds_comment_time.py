"""Add distinct moved/care reactions and timestamps for new comments."""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("comments", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    op.drop_constraint("reactions_kind_check", "reactions", type_="check")
    op.create_check_constraint(
        "reactions_kind_check",
        "reactions",
        "kind IN ('heart','like','happy','wow','sad','moved','care')",
    )


def downgrade():
    if (
        op.get_bind()
        .execute(sa.text("SELECT 1 FROM reactions WHERE kind IN ('moved','care') LIMIT 1"))
        .scalar()
    ):
        raise RuntimeError("Downgrade would discard moved/care reactions; migrate them explicitly first")
    op.drop_constraint("reactions_kind_check", "reactions", type_="check")
    op.create_check_constraint(
        "reactions_kind_check", "reactions", "kind IN ('heart','like','happy','wow','sad')"
    )
    op.drop_column("comments", "created_at")

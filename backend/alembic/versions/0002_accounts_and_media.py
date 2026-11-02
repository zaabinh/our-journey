"""Add account verification tokens and user/album media references."""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users", sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.true())
    )
    op.alter_column("users", "email_verified", server_default=None)
    op.add_column("users", sa.Column("avatar_photo_id", sa.String(36), nullable=True))
    op.create_foreign_key("fk_users_avatar_photo", "users", "photos", ["avatar_photo_id"], ["id"])
    op.add_column("albums", sa.Column("cover_photo_id", sa.String(36), nullable=True))
    op.create_foreign_key("fk_albums_cover_photo", "albums", "photos", ["cover_photo_id"], ["id"])
    op.alter_column("photos", "memory_id", existing_type=sa.String(36), nullable=True)
    op.alter_column("memories", "date", existing_type=sa.Date(), nullable=True)
    op.add_column("memories", sa.Column("date_label", sa.Text(), nullable=True))
    op.add_column("photos", sa.Column("owner_id", sa.String(36), nullable=True))
    op.create_foreign_key("fk_photos_owner", "photos", "users", ["owner_id"], ["id"])
    op.create_index("ix_photos_owner_id", "photos", ["owner_id"])
    op.create_check_constraint(
        "ck_photos_single_parent",
        "photos",
        "(memory_id IS NOT NULL AND owner_id IS NULL) OR (memory_id IS NULL AND owner_id IS NOT NULL)",
    )
    op.create_table(
        "account_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("purpose", sa.String(24), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("purpose IN ('verify_email','reset_password')"),
    )
    op.create_index("ix_account_tokens_user_id", "account_tokens", ["user_id"])


def downgrade():
    op.drop_index("ix_account_tokens_user_id", table_name="account_tokens")
    op.drop_table("account_tokens")
    op.drop_column("memories", "date_label")
    op.alter_column("memories", "date", existing_type=sa.Date(), nullable=False)
    op.drop_constraint("ck_photos_single_parent", "photos", type_="check")
    op.drop_index("ix_photos_owner_id", table_name="photos")
    op.drop_constraint("fk_photos_owner", "photos", type_="foreignkey")
    op.drop_column("photos", "owner_id")
    op.alter_column("photos", "memory_id", existing_type=sa.String(36), nullable=False)
    op.drop_constraint("fk_albums_cover_photo", "albums", type_="foreignkey")
    op.drop_column("albums", "cover_photo_id")
    op.drop_constraint("fk_users_avatar_photo", "users", type_="foreignkey")
    op.drop_column("users", "avatar_photo_id")
    op.drop_column("users", "email_verified")

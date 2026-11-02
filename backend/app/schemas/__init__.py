import re
from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class Register(Body):
    email: str = Field(min_length=3, max_length=254)
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value.strip()):
            raise ValueError("Invalid email")
        return value.strip().lower()

    @field_validator("username")
    @classmethod
    def username_normalized(cls, value):
        return value.lower()

    @field_validator("display_name")
    @classmethod
    def display_nonblank(cls, value):
        if not value.strip():
            raise ValueError("Required")
        return value.strip()


class Login(Body):
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class AccountTokenRequest(Body):
    token: str = Field(min_length=32, max_length=200)


class EmailRequest(Body):
    email: str = Field(min_length=3, max_length=254)


class PasswordReset(AccountTokenRequest):
    password: str = Field(min_length=10, max_length=128)


class Profile(Body):
    display_name: str = Field(min_length=1, max_length=100)


class AlbumCreate(Body):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)


class AlbumEdit(AlbumCreate):
    expected_version: int = Field(ge=1)
    cover_photo_id: str | None = None


Role = Literal["contributor", "viewer"]


class MemberEdit(Body):
    role: Role


class InviteCreate(Body):
    role: Role
    hours: int = Field(default=48, ge=1, le=168)
    max_uses: int = Field(default=10, ge=1, le=100)


class Redeem(Body):
    secret: str = Field(min_length=8, max_length=200)


class MemoryCreate(Body):
    title: str = Field(min_length=1, max_length=200)
    date: Date | None = None
    date_label: str | None = Field(default=None, max_length=200)
    location: str = Field(default="", max_length=300)
    note: str = Field(default="", max_length=20000)
    animations: dict[Literal["heart", "gift"], bool] = Field(default_factory=dict)


class MemoryEdit(MemoryCreate):
    expected_version: int = Field(ge=1)


class Reorder(Body):
    ids: list[str] = Field(min_length=1, max_length=1000)
    expected_version: int = Field(ge=1)


class PhotoReorder(Body):
    ids: list[str] = Field(min_length=1, max_length=10)
    expected_version: int = Field(ge=1)


class CommentCreate(Body):
    body: str = Field(min_length=1, max_length=4000)


class CommentEdit(CommentCreate):
    expected_version: int = Field(ge=1)


class ReactionSet(Body):
    kind: Literal["heart", "like", "happy", "wow", "sad"]

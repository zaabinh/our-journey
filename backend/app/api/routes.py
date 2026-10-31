from fastapi import APIRouter
from .auth import router as auth_router
from .albums import router as albums_router
from .memories import router as memories_router
from .social import router as social_router

router = APIRouter()
for child in (auth_router, albums_router, memories_router, social_router):
    router.include_router(child)

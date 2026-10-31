from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from .api import routes
from .config import settings
from .db import SessionLocal


@asynccontextmanager
async def lifespan(app):
    settings().validate_runtime()
    yield


app = FastAPI(title="Our Journey API", version="0.1.0", lifespan=lifespan)
app.include_router(routes.router, prefix="/api/v1")


@app.middleware("http")
async def request_metadata(request: Request, call_next):
    request.state.request_id = str(uuid4())
    if request.method in {"POST", "PUT", "PATCH"}:
        chunks = []
        total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > settings().max_upload_bytes + 1024 * 1024:
                return JSONResponse(
                    {
                        "error": {
                            "code": "REQUEST_TOO_LARGE",
                            "message": "Request body exceeds the limit",
                            "request_id": request.state.request_id,
                        }
                    },
                    status_code=413,
                )
            chunks.append(chunk)
        request._body = b"".join(chunks)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


def error(request, status, code, message, fields=None, headers=None):
    value = {"code": code, "message": message, "request_id": request.state.request_id}
    if fields:
        value["fields"] = fields
    return JSONResponse({"error": value}, status_code=status, headers=headers)


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    detail = (
        exc.detail
        if isinstance(exc.detail, dict)
        else {"code": "REQUEST_FAILED", "message": str(exc.detail)}
    )
    return error(request, exc.status_code, **detail, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Never echo input values, especially passwords or invitation secrets.
    fields = [{"field": ".".join(map(str, e["loc"])), "message": e["msg"]} for e in exc.errors()]
    return error(request, 422, "VALIDATION_ERROR", "Invalid request", fields=fields)


@app.exception_handler(IntegrityError)
async def conflict(request, exc):
    return error(request, 409, "CONFLICT", "The operation conflicts with existing data")


@app.get("/health/live")
def live():
    return {"status": "ok"}


@app.get("/health/ready")
def ready():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        return JSONResponse({"status": "unavailable"}, status_code=503)

from fastapi import HTTPException


def fail(status, code, message, headers=None):
    raise HTTPException(status, detail={"code": code, "message": message}, headers=headers)

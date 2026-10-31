from pathlib import Path

import boto3

from .config import settings


class LocalStorage:
    def __init__(self):
        self.root = Path(settings().local_storage_path).resolve()

    def path(self, key):
        result = (self.root / key).resolve()
        if not result.is_relative_to(self.root) or result == self.root:
            raise ValueError("Invalid storage key")
        return result

    def put(self, key, data, mime):
        path = self.path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def delete(self, key):
        self.path(key).unlink(missing_ok=True)

    def read(self, key):
        return self.path(key).read_bytes()


class R2Storage:
    def __init__(self):
        s = settings()
        self.bucket = s.r2_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=s.r2_endpoint,
            region_name="auto",
            aws_access_key_id=s.r2_access_key,
            aws_secret_access_key=s.r2_secret_key,
        )

    def put(self, key, data, mime):
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=mime)

    def delete(self, key):
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def sign(self, key):
        return self.client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=120
        )


def storage():
    return R2Storage() if settings().storage_driver == "r2" else LocalStorage()

"""Crop storage behind an interface, so object storage can replace local disk later (decision 34)."""

from pathlib import Path
from typing import Protocol


class CropStorage(Protocol):
    def save(self, key: str, data: bytes) -> None: ...

    def url(self, key: str) -> str: ...

    def delete_all(self) -> int: ...


class LocalDiskStorage:
    def __init__(self, directory: str | Path, url_prefix: str) -> None:
        self.directory = Path(directory)
        self.url_prefix = url_prefix.rstrip("/")
        self.directory.mkdir(parents=True, exist_ok=True)

    def save(self, key: str, data: bytes) -> None:
        # Keys are built by the server from a validated client_id, never from a part name.
        (self.directory / key).write_bytes(data)

    def url(self, key: str) -> str:
        return f"{self.url_prefix}/{key}"

    def delete_all(self) -> int:
        count = 0
        for path in self.directory.iterdir():
            if path.is_file():
                path.unlink()
                count += 1
        return count

"""What passes between the loop and a model; no google-genai import here."""

from dataclasses import dataclass
from typing import Any


@dataclass
class Call:
    name: str
    args: dict[str, Any]


@dataclass
class ToolResult:
    name: str
    result: dict[str, Any]

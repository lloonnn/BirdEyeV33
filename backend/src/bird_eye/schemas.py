"""Request and response models, copied from docs/api-contract.md v0."""

from datetime import datetime
from typing import Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator

DefectType = Literal["pothole", "crack"]
DefectStatus = Literal["detected", "verified", "scheduled", "fixed", "confirmed", "rejected"]
DEFECT_STATUSES: tuple[str, ...] = DefectStatus.__args__
UrgencyBand = Literal["high", "medium", "low"]
LocationReason = Literal["school", "main_road", "junction"]


# Detection record (POST /detections/batch)


class LatLon(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class Vehicle(LatLon):
    gps_accuracy_m: float = Field(ge=0)
    heading_deg: float = Field(ge=0, le=360)
    speed_kmh: float = Field(ge=0)


class DetectionRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # The client_id names the crop file on disk, so it is limited to safe characters.
    client_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-][A-Za-z0-9._-]*$")
    device_id: str = Field(min_length=1)
    captured_at: AwareDatetime
    defect_type: DefectType
    confidence: float = Field(ge=0, le=1)
    band: Literal["save", "review"]
    # [x1, y1, x2, y2], normalised 0 to 1 against the full camera frame, origin top left
    # (manager decision 15 Oct).
    bbox: list[float] = Field(min_length=4, max_length=4)
    vehicle: Vehicle
    distance_ahead_m: float = Field(ge=0)
    defect_point: LatLon
    model_version: str = Field(min_length=1)
    urgent: bool
    crop_file: str = Field(min_length=1)

    @field_validator("bbox")
    @classmethod
    def bbox_in_frame(cls, value: list[float]) -> list[float]:
        if any(v < 0 or v > 1 for v in value):
            raise ValueError("bbox values must be from 0 to 1")
        x1, y1, x2, y2 = value
        if x2 <= x1:
            raise ValueError("bbox x2 must be greater than x1")
        if y2 <= y1:
            raise ValueError("bbox y2 must be greater than y1")
        return value


class BatchResult(BaseModel):
    accepted: int
    duplicates: int


# Defect object (GET /defects)


class UrgencyTerms(BaseModel):
    type: float
    size: float
    location: float
    age: float


class Defect(BaseModel):
    id: int
    type: DefectType
    status: DefectStatus
    urgency: float
    urgency_band: UrgencyBand
    urgency_terms: UrgencyTerms
    lat: float
    lon: float
    first_seen: datetime
    last_seen: datetime
    sighting_count: int
    crop_url: str | None
    segment_id: int | None
    work_order_id: int | None
    confirmed_at: datetime | None
    location_reasons: list[LocationReason]



# GET /defects/{id}


class DefectSighting(BaseModel):
    id: int
    captured_at: datetime
    confidence: float
    crop_url: str
    device_id: str


class HistoryEntry(BaseModel):
    status: DefectStatus
    at: datetime


class DefectDetail(Defect):
    sightings: list[DefectSighting]
    history: list[HistoryEntry]


# Reviews


class ReviewAnswer(BaseModel):
    """Body of POST /reviews/{id}. `class` is required for wrong_class and ignored otherwise."""

    model_config = ConfigDict(populate_by_name=True)

    answer: Literal["correct", "wrong_class", "not_defect"]
    class_: DefectType | None = Field(default=None, alias="class")

    @model_validator(mode="after")
    def wrong_class_needs_class(self) -> "ReviewAnswer":
        if self.answer == "wrong_class" and self.class_ is None:
            raise ValueError("class is required when answer is wrong_class")
        return self


class Review(BaseModel):
    id: int
    status: Literal["pending", "answered"]
    # The detection record as uploaded, plus crop_url.
    sighting: dict[str, Any]


# Work orders

WorkOrderStatus = Literal["pending_approval", "approved", "rejected", "done"]


class WorkOrder(BaseModel):
    id: int
    status: WorkOrderStatus
    crew_type: str
    description: str
    defect_ids: list[int]
    created_at: datetime
    approved_at: datetime | None


class WorkOrderPatch(BaseModel):
    """Body of PATCH /work-orders/{id}. A field left out, or null, does not change."""

    description: str | None = None
    crew_type: str | None = None
    # In the prototype defect_ids may only remove defects (decision 89).
    defect_ids: list[int] | None = None


class DevWorkOrderCreate(BaseModel):
    """Body of POST /dev/work-orders. Dev only; not part of the contract."""

    defect_ids: list[int] = Field(min_length=1)
    crew_type: str = Field(min_length=1)
    description: str = Field(min_length=1)

"""The FastAPI app. Run with: uv run uvicorn bird_eye.main:app --host 0.0.0.0 --port 8000"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from bird_eye.db import make_engine
from bird_eye.errors import install_handlers
from bird_eye.routes import brief, defects, detections, dev, reviews, work_orders
from bird_eye.settings import Settings, get_settings
from bird_eye.storage import LocalDiskStorage


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Bird Eye v33 backend", version="0.1.0")
    app.state.settings = settings
    app.state.engine = make_engine(settings.database_url)
    app.state.storage = LocalDiskStorage(settings.crop_dir, settings.crop_url_prefix)

    # The dashboard calls the backend directly from the browser (decision 80).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    app.include_router(brief.router)
    app.include_router(defects.router)
    app.include_router(detections.router)
    app.include_router(reviews.router)
    app.include_router(work_orders.router)
    if settings.dev_endpoints_enabled:
        app.include_router(dev.router)
    install_handlers(app)
    app.mount(settings.crop_url_prefix, StaticFiles(directory=settings.crop_dir), name="crops")
    return app


app = create_app()

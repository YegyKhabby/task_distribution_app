import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from routers import people, tasks, schedule, assignments, distribute, distribution, absences, impact, reallocations, makeup, calendar, responsible_persons, actual

app = FastAPI(title="Task Distribution API", version="1.0.0")

app.add_middleware(GZipMiddleware, minimum_size=500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(people.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(schedule.router, prefix="/api")
app.include_router(assignments.router, prefix="/api")
app.include_router(distribute.router, prefix="/api")
app.include_router(distribution.router, prefix="/api")
app.include_router(absences.router, prefix="/api")
app.include_router(impact.router, prefix="/api")
app.include_router(reallocations.router, prefix="/api")
app.include_router(makeup.router, prefix="/api")
app.include_router(calendar.router, prefix="/api")
app.include_router(responsible_persons.router, prefix="/api")
app.include_router(actual.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve React frontend if dist/ exists (server deployment)
_dist = os.path.join(os.path.dirname(__file__), "dist")
if os.path.isdir(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(os.path.join(_dist, "index.html"))

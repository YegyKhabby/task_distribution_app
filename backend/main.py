from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import people, tasks, schedule, assignments, distribute, distribution, absences, impact, reallocations, makeup, calendar

app = FastAPI(title="Task Distribution API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(people.router)
app.include_router(tasks.router)
app.include_router(schedule.router)
app.include_router(assignments.router)
app.include_router(distribute.router)
app.include_router(distribution.router)
app.include_router(absences.router)
app.include_router(impact.router)
app.include_router(reallocations.router)
app.include_router(makeup.router)
app.include_router(calendar.router)


@app.get("/health")
def health():
    return {"status": "ok"}

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import engine, Base
from api.agents import router as agents_router
from api.tasks import router as tasks_router
from api.auth import router as auth_router
from api.ws import router as ws_router
from api.builder import router as builder_router
from api.reports import router as reports_router
from api.admin import router as admin_router
from api.loot import router as loot_router
from api.profiles import router as profiles_router
from api.pivot import router as pivot_router
from api.intelligence import router as intel_router
from api.persistence import router as persistence_router
from models.event import OperationEvent  # ensure table is created
from models.persistence import PersistenceEntry  # ensure table is created
from core.crypto import init_crypto

Base.metadata.create_all(bind=engine)
init_crypto()

app = FastAPI(title="Nyx C2", version="0.3.0", docs_url="/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(agents_router)
app.include_router(tasks_router)
app.include_router(ws_router)
app.include_router(builder_router)
app.include_router(reports_router)
app.include_router(admin_router)
app.include_router(loot_router)
app.include_router(profiles_router)
app.include_router(pivot_router)
app.include_router(intel_router)
app.include_router(persistence_router)

@app.get("/")
def root():
    return {"name": "Nyx C2 Server", "version": "1.2.0", "status": "online"}

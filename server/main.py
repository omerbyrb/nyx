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

@app.get("/")
def root():
    return {"name": "Nyx C2 Server", "version": "0.5.0", "status": "online"}

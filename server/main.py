from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import engine, Base
from api.agents import router as agents_router
from api.tasks import router as tasks_router
from api.auth import router as auth_router
from api.ws import router as ws_router
from api.builder import router as builder_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Nyx C2", version="0.2.0", docs_url="/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(agents_router)
app.include_router(tasks_router)
app.include_router(ws_router)
app.include_router(builder_router)

@app.get("/")
def root():
    return {"name": "Nyx C2 Server", "version": "0.2.0", "status": "online"}

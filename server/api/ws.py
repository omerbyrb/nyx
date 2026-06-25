from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from core.ws_manager import manager

router = APIRouter(tags=["websocket"])

@router.websocket("/ws/agents/{agent_id}")
async def agent_ws(agent_id: str, websocket: WebSocket):
    await manager.connect(agent_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(agent_id, websocket)

@router.websocket("/ws/all")
async def all_ws(websocket: WebSocket):
    await manager.connect("__all__", websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect("__all__", websocket)

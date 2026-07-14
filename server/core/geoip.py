"""
GeoIP enrichment — resolves agent IP addresses to country, city, ISP, lat/lon.
Uses ip-api.com (free, no API key, 45 req/min rate limit).
Falls back to MaxMind GeoLite2 if the DB file is present.
"""

import json
import urllib.request
from typing import Optional

_IPAPI_URL = "http://ip-api.com/json/{ip}?fields=status,country,countryCode,city,isp,lat,lon,query"
_TIMEOUT   = 5  # seconds


def lookup(ip: str) -> Optional[dict]:
    """
    Returns geo info for an IP, or None on failure.
    Result keys: country, country_code, city, isp, lat, lon
    """
    if not ip or ip in ("127.0.0.1", "::1", "unknown"):
        return {"country": "Localhost", "country_code": "LO", "city": "", "isp": "", "lat": 0.0, "lon": 0.0}

    # Try MaxMind GeoLite2 first (offline, accurate)
    result = _maxmind_lookup(ip)
    if result:
        return result

    # Fall back to ip-api.com
    try:
        url = _IPAPI_URL.format(ip=ip)
        with urllib.request.urlopen(url, timeout=_TIMEOUT) as resp:
            data = json.loads(resp.read())
        if data.get("status") != "success":
            return None
        return {
            "country":      data.get("country", ""),
            "country_code": data.get("countryCode", ""),
            "city":         data.get("city", ""),
            "isp":          data.get("isp", ""),
            "lat":          data.get("lat", 0.0),
            "lon":          data.get("lon", 0.0),
        }
    except Exception:
        return None


def _maxmind_lookup(ip: str) -> Optional[dict]:
    """Try GeoLite2-City.mmdb if available."""
    try:
        import geoip2.database  # type: ignore
        import os

        db_paths = [
            "/usr/share/GeoIP/GeoLite2-City.mmdb",
            "/var/lib/GeoIP/GeoLite2-City.mmdb",
            os.path.expanduser("~/GeoLite2-City.mmdb"),
        ]
        for path in db_paths:
            if os.path.exists(path):
                with geoip2.database.Reader(path) as reader:
                    r = reader.city(ip)
                    return {
                        "country":      r.country.name or "",
                        "country_code": r.country.iso_code or "",
                        "city":         r.city.name or "",
                        "isp":          "",
                        "lat":          float(r.location.latitude or 0),
                        "lon":          float(r.location.longitude or 0),
                    }
    except Exception:
        pass
    return None


def flag_emoji(country_code: str) -> str:
    """Convert ISO country code to flag emoji (e.g. 'US' → '🇺🇸')."""
    if len(country_code) != 2:
        return "🌐"
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in country_code.upper())

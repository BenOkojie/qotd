# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime, timezone
import os, json, aiohttp

from upstash_redis import Redis as UpstashRedis
try:
    from dotenv import load_dotenv, find_dotenv
    load_dotenv(find_dotenv())
except Exception:
    pass

# -------------------- Config --------------------
API_TIMEOUT = 15  # seconds
CORS_ALLOWED = os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")

UPSTASH_URL = os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("UPSTASH_REDIS_URL")
UPSTASH_TOKEN = os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("UPSTASH_REDIS_TOKEN")
if not UPSTASH_URL or not UPSTASH_TOKEN:
    raise RuntimeError(
        "Missing Upstash REST creds. Set UPSTASH_REDIS_REST_URL and "
        "UPSTASH_REDIS_REST_TOKEN in your environment."
    )

# -------------------- App & Redis --------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED,
    allow_methods=["*"],
    allow_headers=["*"],
)

redis = UpstashRedis(url=UPSTASH_URL, token=UPSTASH_TOKEN)

def rkey(date_str: str) -> str:
    return f"quote:{date_str}"

def to_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()

def format_date_or_400(date: str) -> datetime:
    try:
        return datetime.fromisoformat(date)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

async def fetch_zenquotes(is_today: bool) -> dict:
    """Call ZenQuotes. Today -> /today, other days -> /random."""
    url = "https://zenquotes.io/api/today" if is_today else "https://zenquotes.io/api/random"
    async with aiohttp.ClientSession() as s:
        async with s.get(url, timeout=API_TIMEOUT) as resp:
            text = await resp.text()
            if resp.status != 200:
                raise HTTPException(status_code=502, detail=f"ZenQuotes {resp.status}: {text[:160]}")
            try:
                data = json.loads(text)
            except Exception:
                raise HTTPException(status_code=502, detail=f"ZenQuotes non-JSON: {text[:160]}")
            if not isinstance(data, list) or not data:
                raise HTTPException(status_code=502, detail="Unexpected ZenQuotes payload")
            item = data[0]
            return {
                "text": (item.get("q") or "").strip(),
                "author": (item.get("a") or "Unknown").strip(),
            }

# -------------------- Endpoints --------------------
@app.get("/health")
def health():
    """Quick Redis probe using a tiny hash write/read."""
    try:
        redis.hset("qotd:health", values={"ok": "1", "ts": to_iso_now()})  # <-- values=
        probe = redis.hgetall("qotd:health")
        return {"ok": probe.get("ok") == "1"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"ok": False, "error": str(e)})

# IMPORTANT: route is /quote (Vercel will expose it at /api/quote)
@app.get("/quote")
async def get_quote(date: str):
    """
    Fetch quote for a given YYYY-MM-DD.
    - Try Redis hash first (HGETALL).
    - On miss: fetch from ZenQuotes, then HSET (no TTL).
    Response shape:
      { date, text, author, source, stored_at }
    """
    dt = format_date_or_400(date)
    key = rkey(date)

    # 1) Try cache (hash)
    try:
        cached = redis.hgetall(key)  # dict or {}
        if cached and cached.get("text") and cached.get("author"):
            return {
                "date": date,
                "text": cached["text"],
                "author": cached["author"],
                "source": cached.get("source", "zenquotes"),
                "stored_at": cached.get("stored_at"),
            }
    except Exception as e:
        # Don't hard-fail on Redis read errors—log and continue to fetch
        print("Redis HGETALL error:", e, flush=True)

    # 2) Miss -> fetch
    is_today = dt.date() == datetime.now(timezone.utc).date()
    q = await fetch_zenquotes(is_today=is_today)

    payload = {
        "date": date,
        "text": q["text"],
        "author": q["author"],
        "source": "zenquotes",
        "stored_at": to_iso_now(),
    }

    # 3) Store as hash (write once by convention; no TTL)
    try:
        redis.hset(key, values={   # <-- values=
            "text": str(payload["text"]),
            "author": str(payload["author"]),
            "source": str(payload["source"]),
            "stored_at": str(payload["stored_at"]),
        })
    except Exception as e:
        print("Redis HSET error:", e, flush=True)

    return payload

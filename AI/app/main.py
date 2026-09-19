import asyncio
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException

from app.database import get_connection
from app.routers import citations, ingest, query, review, scholar, writing, zotero
from app.services.embedder import get_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[{datetime.utcnow().isoformat()}] Loading embedding model...")
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, get_model)
        print(f"[{datetime.utcnow().isoformat()}] Embedding model ready.")
    except Exception as e:
        print(f"[{datetime.utcnow().isoformat()}] WARNING: Embedding model failed to load: {e}")
    yield


app = FastAPI(title="ResearchMind AI Service", lifespan=lifespan)

app.include_router(ingest.router)
app.include_router(query.router)
app.include_router(scholar.router)
app.include_router(review.router)
app.include_router(writing.router)
app.include_router(citations.router)
app.include_router(zotero.router)


@app.get("/health")
def health():
    # Verify DB connection
    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1")
    except Exception as e:
        print(f"[{datetime.utcnow().isoformat()}] Health check DB failure: {e}")
        raise HTTPException(status_code=503, detail="Database connection unavailable") from e
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

import os
from fastapi import FastAPI, Header, HTTPException

app = FastAPI(title="NKP AI Service", docs_url=None, redoc_url=None)

TOKEN = os.environ.get("AI_SERVICE_TOKEN", "")


@app.get("/health")
def health(authorization: str | None = Header(default=None)):
    # Internal service: require a bearer token. Not intended for public exposure.
    if not TOKEN or authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"status": "ok"}

import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from starlette.status import HTTP_401_UNAUTHORIZED

load_dotenv()

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")
AI_SERVICE_API_KEY = os.getenv("AI_SERVICE_API_KEY")
NODE_ENV = os.getenv("NODE_ENV", "development")

if NODE_ENV == "production" and not AI_SERVICE_API_KEY:
    raise RuntimeError("AI_SERVICE_API_KEY is required in production")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient()
    yield
    await app.state.http.aclose()


app = FastAPI(title="PKM AI Service", version="0.1.0", lifespan=lifespan)


def verify_api_key(x_api_key: str | None = Header(None)):
    if AI_SERVICE_API_KEY and x_api_key != AI_SERVICE_API_KEY:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key"
        )
    return True


class HealthResponse(BaseModel):
    status: str
    version: str


@app.get("/health", response_model=HealthResponse)
async def health():
    return {"status": "ok", "version": "0.1.0"}


class EmbedRequest(BaseModel):
    text: str


class EmbedResponse(BaseModel):
    embedding: list[float]
    dimensions: int


@app.post("/embed", response_model=EmbedResponse, dependencies=[Depends(verify_api_key)])
async def embed(req: EmbedRequest):
    # Walking skeleton: deterministic stub embedding.
    dims = 384
    vec = [float(ord(c) % 100) / 100.0 for c in req.text[:dims]]
    if len(vec) < dims:
        vec.extend([0.0] * (dims - len(vec)))
    return {"embedding": vec, "dimensions": dims}


class AskRequest(BaseModel):
    prompt: str


class AskResponse(BaseModel):
    answer: str


@app.post("/ask", response_model=AskResponse, dependencies=[Depends(verify_api_key)])
async def ask(req: AskRequest):
    # v1 stub: a real deployment would route this to a configured model.
    # The prompt already contains the grounded note context and citations.
    return {
        "answer": "I reviewed the cited notes above, but this v1 instance does not have a configured language model. Please check the cited sources directly."
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)

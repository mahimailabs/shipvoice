from fastapi import APIRouter

from src.api.endpoints.agents import router as agents_router
from src.api.endpoints.deployment import router as deployment_router
from src.api.endpoints.livekit import router as livekit_router
from src.api.endpoints.token import router as token_router

routers = APIRouter(prefix="/v1")
routers.include_router(token_router)
routers.include_router(agents_router)
routers.include_router(deployment_router)
routers.include_router(livekit_router)

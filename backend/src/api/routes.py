from fastapi import APIRouter

from src.api.endpoints.agents import router as agents_router
from src.api.endpoints.calls import router as calls_router
from src.api.endpoints.deployment import router as deployment_router
from src.api.endpoints.internal_calls import router as internal_calls_router
from src.api.endpoints.internal_livekit import router as internal_livekit_router
from src.api.endpoints.livekit import router as livekit_router
from src.api.endpoints.token import router as token_router

routers = APIRouter(prefix="/v1")
routers.include_router(token_router)
routers.include_router(agents_router)
routers.include_router(calls_router)
routers.include_router(deployment_router)
routers.include_router(livekit_router)
routers.include_router(internal_livekit_router)
routers.include_router(internal_calls_router)

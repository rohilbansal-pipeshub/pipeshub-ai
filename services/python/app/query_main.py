import uvicorn
from fastapi import FastAPI, Depends, Request, HTTPException, status
from fastapi.responses import JSONResponse 
from app.setups.query_setup import AppContainer
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from app.api.routes.search import router as search_router
from app.api.routes.chatbot import router as chatbot_router
from app.api.routes.records import router as records_router
from app.api.middlewares.auth import authMiddleware

from app.utils.logger import logger

container = AppContainer()

async def initialize_container(container: AppContainer) -> bool:
    """Initialize container resources"""
    logger.info("🚀 Initializing application resources")

    try:
        # Connect to ArangoDB and Redis
        logger.info("Connecting to ArangoDB")
        arango_service = await container.arango_service()
        if arango_service:
            arango_connected = await arango_service.connect()
            if not arango_connected:
                raise Exception("Failed to connect to ArangoDB")
            logger.info("✅ Connected to ArangoDB")
        else:
            raise Exception("Failed to connect to ArangoDB")
        
        return True

    except Exception as e:
        logger.error(f"❌ Failed to initialize resources: {str(e)}")
        raise

async def get_initialized_container() -> AppContainer:
    """Dependency provider for initialized container"""
    logger.debug("🔄 Getting initialized container")
    if not hasattr(get_initialized_container, 'initialized'):
        logger.debug("🔧 First-time container initialization")
        await initialize_container(container)
        container.wire(modules=[
            "app.api.routes.search",
            "app.api.routes.chatbot",
            "app.modules.retrieval.retrieval_service",
            "app.modules.retrieval.retrieval_arango"
        ])
        get_initialized_container.initialized = True
        logger.debug("✅ Container initialization complete")
    return container

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager for FastAPI"""
    logger.debug("🚀 Starting retrieval application")
    
    # Initialize container
    app_container = await get_initialized_container()
    # Store container in app state for access in dependencies
    app.container = app_container
    yield
    
    logger.debug("🔄 Shutting down retrieval application")

# Create FastAPI app with lifespan
app = FastAPI(
    title="Retrieval API",
    description="API for retrieving information from vector store",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
    dependencies=[Depends(get_initialized_container)]
)

EXCLUDE_PATHS = []

@app.middleware("http")
async def authenticate_requests(request: Request, call_next):
    # Check if path should be excluded from authentication
    if any(request.url.path.startswith(path) for path in EXCLUDE_PATHS):
        return await call_next(request)
    
    try:
        # Apply authentication
        authenticated_request = await authMiddleware(request)
        # Continue with the request
        response = await call_next(authenticated_request)
        return response
        
    except HTTPException as exc:
        # Handle authentication errors
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )
    except Exception as exc:
        # Handle unexpected errors
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"}
        )
# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes from routes.py
app.include_router(search_router, prefix="/api/v1")
app.include_router(chatbot_router, prefix="/api/v1")
app.include_router(records_router, prefix="/api/v1")

def run(host: str = "0.0.0.0", port: int = 8000, reload: bool = True):
    """Run the application"""
    uvicorn.run(
        "app.query_main:app",
        host=host,
        port=port,
        log_level="info",
        reload=reload
    )

if __name__ == "__main__":
    run() 
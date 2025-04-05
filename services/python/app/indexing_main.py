import uvicorn
import asyncio
from fastapi import FastAPI
from app.utils.logger import create_logger
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from app.setups.indexing_setup import AppContainer, initialize_container

logger = create_logger(__name__)

container = AppContainer()
container_lock = asyncio.Lock()

async def get_initialized_container() -> AppContainer:
    """Dependency provider for initialized container"""
    if not hasattr(get_initialized_container, 'initialized'):
        async with container_lock:
            if not hasattr(get_initialized_container, 'initialized'):  # Double-check inside lock
                logger.debug("🔧 First-time container initialization")
                await initialize_container(container)
                container.wire(modules=[
                    "app.modules.retrieval.retrieval_service"
                ])
                get_initialized_container.initialized = True
                logger.debug("✅ Container initialization complete")
    return container

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context manager for FastAPI"""
    logger.info("🚀 Starting application")
    container = await get_initialized_container()
    app.container = container
    consumer = await container.kafka_consumer()
    consume_task = asyncio.create_task(consumer.consume_messages())

    yield
        # Shutdown
    logger.info("🔄 Shutting down application")
    consumer.stop()
    # Cancel the consume task
    consume_task.cancel()
    try:
        await consume_task
    except asyncio.CancelledError:
        logger.info("Kafka consumer task cancelled")

app = FastAPI(
    lifespan=lifespan,
    title="Vector Search API",
    description="API for semantic search and document retrieval with Kafka consumer",
    version="1.0.0"
)

def run(host: str = "0.0.0.0", port: int = 8091, reload: bool = True):
    """Run the application"""
    logger.info(f"🚀 Running Application on {host}:{port}")

    uvicorn.run(
        "app.indexing_main:app",
        host=host,
        port=port,
        log_level="info",
        reload=reload
    )

if __name__ == "__main__":
    run(reload=False)

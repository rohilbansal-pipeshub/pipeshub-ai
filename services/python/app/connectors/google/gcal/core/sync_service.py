"""Base and specialized sync services for Google Calendar synchronization"""

# pylint: disable=E1101, W0718, W0719
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
import asyncio
import uuid
from typing import Dict, List, Optional
import json

from app.config.arangodb_constants import CollectionNames
from app.utils.logger import logger
from app.connectors.google.core.arango_service import ArangoService
from app.connectors.google.gcal.core.gcal_admin_service import GCalAdminService
from app.connectors.google.gcal.core.gcal_user_service import GCalUserService
from app.connectors.core.kafka_service import KafkaService
from app.config.configuration_service import ConfigurationService


class GCalSyncProgress:
    """Class to track sync progress"""

    def __init__(self):
        self.total_calendars = 0
        self.processed_calendars = 0
        self.percentage = 0
        self.status = "initializing"
        self.lastUpdatedTimestampAtSource = datetime.now(timezone.utc).isoformat()


class BaseGCalSyncService(ABC):
    """Base class for Calendar sync services"""

    def __init__(
        self,
        config: ConfigurationService,
        arango_service: ArangoService,
        kafka_service: KafkaService,
        celery_app
    ):
        self.config = config
        self.arango_service = arango_service
        self.kafka_service = kafka_service
        self.celery_app = celery_app
        self.progress = GCalSyncProgress()

        # Common state
        self._pause_event = asyncio.Event()
        self._pause_event.set()
        self._stop_requested = False

        # Locks
        self._sync_lock = asyncio.Lock()
        self._transition_lock = asyncio.Lock()
        self._progress_lock = asyncio.Lock()

        # Configuration
        self._sync_task = None
        self.batch_size = 50

    @abstractmethod
    async def connect_services(self) -> bool:
        """Connect to required services"""
        pass

    @abstractmethod
    async def initialize(self, org_id: str) -> bool:
        """Initialize sync service"""
        pass

    async def disconnect(self, user_service: GCalUserService = None) -> bool:
        """Disconnect from all services"""
        async with self._transition_lock:
            try:
                logger.info("🚀 Disconnecting from app.services.modules")
                self._stop_requested = True

                # Wait for current operations to complete
                if self._sync_lock.locked():
                    async with self._sync_lock:
                        pass

                if user_service:
                    await user_service.disconnect()
                await self.arango_service.disconnect()

                # Reset states
                self._stop_requested = False  # Reset for next run

                logger.info("✅ Successfully disconnected from app.services.modules")
                return True

            except Exception as e:
                logger.error(
                    "❌ Failed to disconnect from app.services.modules: %s", str(e))
                return False


class GCalSyncEnterpriseService(BaseGCalSyncService):
    """Sync service for enterprise setup using admin service"""

    def __init__(
        self,
        config: ConfigurationService,
        gcal_admin_service: GCalAdminService,
        arango_service: ArangoService,
        kafka_service: KafkaService,
        celery_app
    ):
        super().__init__(config, arango_service, kafka_service, celery_app)
        self.gcal_admin_service = gcal_admin_service

    async def connect_services(self) -> bool:
        """Connect to services for enterprise setup"""
        try:
            logger.info("🚀 Connecting to enterprise services")

            # Connect to Google Calendar Admin
            if not await self.gcal_admin_service.connect_admin():
                raise Exception("Failed to connect to Calendar Admin API")

            # Connect to ArangoDB and Redis
            if not await self.arango_service.connect():
                raise Exception("Failed to connect to ArangoDB")

            logger.info("✅ Enterprise services connected successfully")
            return True

        except Exception as e:
            logger.error("❌ Enterprise service connection failed: %s", str(e))
            return False

    async def initialize(self, org_id: str) -> bool:
        """Initialize enterprise sync service"""
        try:
            logger.info("🚀 Initializing enterprise sync service")
            if not await self.connect_services():
                return False

            users = []
            groups = []

            # List and store enterprise users
            source_users = await self.gcal_admin_service.list_enterprise_users(org_id)
            for user in source_users:
                if not await self.arango_service.get_entity_id_by_email(user['email']):
                    logger.info("New user found!")
                    users.append(user)

            if users:
                logger.info("🚀 Found %s users", len(users))
                await self.arango_service.batch_upsert_nodes(users, collection=CollectionNames.USERS.value)

            # Initialize Redis and Celery
            await self.redis_service.initialize_redis()
            await self.celery_app.setup_app()

            # Check if sync is already running in Redis
            sync_hierarchy = await self.redis_service.get_sync_hierarchy()
            if sync_hierarchy and sync_hierarchy['status'] == 'IN_PROGRESS':
                logger.info(
                    "🔄 Sync already RUNNING, Program likely crashed. Changing state to PAUSED")
                sync_hierarchy['status'] = 'PAUSED'
                await self.redis_service.store_sync_hierarchy(sync_hierarchy)

            # Set up calendar watch for each user
            for user in users:
                try:
                    user_service = await self.gcal_admin_service.create_user_service(user['email'])
                    if not user_service:
                        logger.warning(f"❌ Failed to create user service for: {
                                       user['email']}")
                        continue

                    watch_response = await user_service.create_calendar_watch()
                    if not watch_response:
                        logger.warning(f"❌ Failed to set up calendar watch for user: {
                                       user['email']}")
                        continue

                    logger.info(f"✅ Calendar watch set up successfully for user: {
                                user['email']}")
                    await self.arango_service.store_calendar_watch_data(watch_response, user['email'])

                except Exception as e:
                    logger.error(f"❌ Error setting up calendar watch for user {
                                 user['email']}: {str(e)}")

            logger.info("✅ Sync service initialized successfully")
            return True

        except Exception as e:
            logger.error("❌ Failed to initialize enterprise sync: %s", str(e))
            return False

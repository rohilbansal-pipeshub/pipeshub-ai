from typing import Dict, Optional
from uuid import uuid4
from google.oauth2 import service_account
from googleapiclient.discovery import build
from datetime import datetime, timedelta, timezone
from app.config.configuration_service import ConfigurationService, config_node_constants, WebhookConfig
from app.config.arangodb_constants import CollectionNames
from app.utils.logger import create_logger
from app.connectors.utils.decorators import exponential_backoff
from app.connectors.utils.rate_limiter import GoogleAPIRateLimiter
from app.connectors.google.scopes import GOOGLE_CONNECTOR_ENTERPRISE_SCOPES
from app.utils.time_conversion import parse_timestamp
from app.exceptions.connector_google_exceptions import (
    AdminServiceError, AdminAuthError, AdminDelegationError
)
from googleapiclient.errors import HttpError


logger = create_logger(__name__)

class GoogleAdminService:
    def __init__(
        self, 
        config: ConfigurationService, 
        rate_limiter: GoogleAPIRateLimiter, 
        google_token_handler,
        arango_service
    ):
        self.config_service = config
        self.rate_limiter = rate_limiter
        self.google_limiter = self.rate_limiter.google_limiter
        self.google_token_handler = google_token_handler
        self.arango_service = arango_service
        self.admin_reports_service = None
        self.admin_directory_service = None
        self.credentials = None

    async def connect_admin(self, org_id: str) -> bool:
        """Initialize admin service with domain-wide delegation"""
        try:
            SCOPES = GOOGLE_CONNECTOR_ENTERPRISE_SCOPES
            
            credentials_json = await self.google_token_handler.get_enterprise_token(org_id)
            if not credentials_json:
                raise AdminAuthError(
                    "Failed to get enterprise credentials",
                    details={"org_id": org_id}
                )
                
            admin_email = credentials_json.get('adminEmail')
            if not admin_email:
                raise AdminAuthError(
                    "Admin email not found in credentials",
                    details={"org_id": org_id}
                )
            
            try:
                self.credentials = service_account.Credentials.from_service_account_info(
                    credentials_json,
                    scopes=SCOPES,
                    subject=admin_email
                )
            except Exception as e:
                raise AdminDelegationError(
                    "Failed to create delegated credentials",
                    details={
                        "org_id": org_id,
                        "admin_email": admin_email,
                        "error": str(e)
                    }
                )

            self.admin_reports_service = build(
                'admin',
                'reports_v1',
                credentials=self.credentials,
                cache_discovery=False
            )
            self.admin_directory_service = build(
                'admin',
                'directory_v1',
                credentials=self.credentials,
                cache_discovery=False
            )

            return True

        except (AdminAuthError, AdminDelegationError):
            raise
        except Exception as e:
            raise AdminServiceError(
                "Failed to connect to Admin Service",
                details={"error": str(e)}
            )

    @exponential_backoff()
    async def get_user_info(self, org_id: str, user_email: str) -> Optional[Dict]:
        """Get user information from Google Admin API"""
        try:
            if not await self.connect_admin(org_id):
                raise AdminServiceError(
                    "Failed to connect admin service for watch creation",
                    details={"org_id": org_id}
                )

            async with self.google_limiter:
                user_info = self.admin_directory_service.users().get(
                    userKey=user_email
                ).execute()

                return {
                    '_key': str(uuid4()),
                    'userId': str(uuid4()),
                    'orgId': org_id,
                    'email': user_info.get('primaryEmail'),
                    'fullName': user_info.get('name', {}).get('fullName'),
                    'firstName': user_info.get('name', {}).get('givenName', ''),
                    'middleName': user_info.get('name', {}).get('middleName', ''),
                    'lastName': user_info.get('name', {}).get('familyName', ''),
                    'designation': user_info.get('designation', ''),
                    'businessPhones': user_info.get('phones', []),
                    'isActive': False,  # New users start as inactive
                    'createdAtTimestamp': int(parse_timestamp(user_info.get('creationTime')).timestamp()),
                    'updatedAtTimestamp': int(parse_timestamp(user_info.get('creationTime')).timestamp())
                }

        except Exception as e:
            logger.error(f"Failed to get user info for {user_email}: {str(e)}")
            return None

    async def handle_new_user(self, org_id: str, user_email: str):
        """Handle new user creation event"""
        try:
            logger.info(f"Handling new user creation for {user_email}")
            
            # Get user info from Google Admin API
            user_info = await self.get_user_info(org_id, user_email)
            if not user_info:
                logger.error(f"Failed to get user info for {user_email}")
                return

            user_key = await self.arango_service.get_entity_id_by_email(user_email)
            if not user_key:
                # Create user in Arango with isActive=False
                await self.arango_service.batch_upsert_nodes(
                    [user_info],
                    CollectionNames.USERS.value
                )
            
            logger.info(f"Successfully created user record for {user_email}")

        except Exception as e:
            logger.error(f"Error handling new user creation for {user_email}: {str(e)}")
            raise

    async def handle_deleted_user(self, org_id: str, user_email: str):
        """Handle user deletion event"""
        try:
            logger.info(f"Handling user deletion for {user_email}")
            
            user_key = await self.arango_service.get_entity_id_by_email(user_email)
            if not user_key:
                logger.error(f"User {user_email} not found in ArangoDB")
                return

            user = await self.arango_service.get_document(user_key, CollectionNames.USERS.value)
            if not user:
                logger.error(f"User {user_email} not found in ArangoDB")
                return
            
            user['isActive'] = False
            await self.arango_service.batch_upsert_nodes(
                [user],
                CollectionNames.USERS.value
            )
            
            logger.info(f"Successfully marked user {user_email} as inactive")

        except Exception as e:
            logger.error(f"Error handling user deletion for {user_email}: {str(e)}")
            raise

    @exponential_backoff()
    async def create_admin_watch(self, org_id: str):
        """Create a watch for admin activities (user creation/deletion)"""
        try:
            logger.info("🔍 Setting up admin activity watch")
            
            if not await self.connect_admin(org_id):
                raise AdminServiceError(
                    "Failed to connect admin service for watch creation",
                    details={"org_id": org_id}
                )

            # Create a channel for notifications
            channel_id = str(uuid4())
            channel_token = str(uuid4())
            try:
                endpoints = await self.config_service.get_config(config_node_constants.ENDPOINTS.value)
                webhook_endpoint = endpoints.get('connectors', {}).get('publicEndpoint')
                if not webhook_endpoint:
                    raise AdminServiceError(
                        "Missing webhook endpoint configuration",
                        details={"endpoints": endpoints}
                    )
            except Exception as e:
                raise AdminServiceError(
                    "Failed to get webhook configuration",
                    details={"error": str(e)}
                )

            webhook_url = f"{webhook_endpoint.rstrip('/')}/admin/webhook"
            expiration_time = int((datetime.now(timezone.utc) + timedelta(
                hours=WebhookConfig.EXPIRATION_HOURS.value,
                minutes=WebhookConfig.EXPIRATION_MINUTES.value
            )).timestamp() * 1000)  # Convert to milliseconds timestamp

            channel_body = {
                "id": channel_id,
                "type": "web_hook",
                "address": webhook_url,
                "token": channel_token,
                # "expiration": str(expiration_time),  # Must be string of milliseconds timestamp
                "payload": True
            }
            
            logger.info(f"🔍 Creating admin watch for {org_id}")

            try:
                async with self.google_limiter:
                    response = self.admin_reports_service.activities().watch(
                        userKey="all",
                        applicationName="admin",
                        body=channel_body
                    ).execute()
            except HttpError as http_err:
                # Decode the error content if needed
                error_details = http_err.content.decode('utf-8')
                logger.error(f"❌ HttpError: {error_details}")
                raise AdminServiceError(
                    "Failed to create admin watch",
                    details={"org_id": org_id, "error": error_details}
                )
            except Exception as e:
                logger.error(f"❌ Failed to create admin watch: {str(e)}")
                raise
            
        except Exception as e:
            logger.error(f"❌ Failed to create admin watch: {str(e)}")
            raise

    # @exponential_backoff()
    # async def stop_admin_watch(self, channel_id: str, resource_id: str) -> bool:
    #     """Stop an existing admin watch"""
    #     try:
    #         logger.info(f"🛑 Stopping admin watch: {channel_id}")
            
    #         try:
    #             async with self.google_limiter:
    #                 self.admin_service.channels().stop(
    #                     body={
    #                         "id": channel_id,
    #                         "resourceId": resource_id
    #                     }
    #                 ).execute()
                    
    #                 logger.info(f"✅ Successfully stopped admin watch: {channel_id}")
                    
    #                 # Remove watch details from database
    #                 await self._remove_watch_details(channel_id)
                    
    #                 return True

    #         except Exception as e:
    #             raise AdminServiceError(
    #                 "Failed to stop admin watch",
    #                 details={
    #                     "channel_id": channel_id,
    #                     "resource_id": resource_id,
    #                     "error": str(e)
    #                 }
    #             )

    #     except Exception as e:
    #         logger.error(f"❌ Failed to stop admin watch: {str(e)}")
    #         raise

    # async def _store_watch_details(self, watch_info: Dict) -> None:
    #     """Store watch details in database for management"""
    #     try:
    #         # Implementation depends on your database structure
    #         # Store in a watches collection or similar
    #         await self.arango_service.create_document(
    #             "watches",  # Your collection name
    #             watch_info
    #         )
    #     except Exception as e:
    #         logger.error(f"Failed to store watch details: {str(e)}")
    #         raise

    # async def _remove_watch_details(self, channel_id: str) -> None:
    #     """Remove watch details from database"""
    #     try:
    #         # Implementation depends on your database structure
    #         await self.arango_service.delete_document(
    #             "watches",  # Your collection name
    #             {"channel_id": channel_id}
    #         )
    #     except Exception as e:
    #         logger.error(f"Failed to remove watch details: {str(e)}")
    #         raise

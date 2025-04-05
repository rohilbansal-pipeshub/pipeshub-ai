from typing import Optional, Dict
from app.utils.logger import create_logger
from app.connectors.utils.decorators import exponential_backoff
from app.config.configuration_service import ConfigurationService
from app.connectors.utils.rate_limiter import GoogleAPIRateLimiter
from app.connectors.google.google_drive.core.drive_user_service import DriveUserService
from app.connectors.google.google_drive.core.drive_admin_service import DriveAdminService

logger = create_logger(__name__)

class GmailDriveInterface:
    """Interface for getting Drive files from Gmail, supporting both individual and enterprise setups"""

    def __init__(
        self,
        config: ConfigurationService,
        rate_limiter: GoogleAPIRateLimiter,
        google_token_handler,
        drive_service=None,
        credentials=None
    ):
        self.config_service = config
        self.rate_limiter = rate_limiter
        self.drive_service = drive_service
        self.google_token_handler = google_token_handler
        self.credentials = credentials


    @exponential_backoff()
    async def get_drive_file(self, file_id: str, user_email: Optional[str] = None, org_id: Optional[str] = None, user_id: Optional[str] = None, account_type: Optional[str] = None) -> Optional[Dict]:
        """Get Drive file metadata using file ID

        Args:
            file_id (str): The Google Drive file ID
            user_email (str, optional): Required for enterprise setup to specify user context

        Returns:
            Optional[Dict]: File metadata if found, None otherwise
        """
        try:
            # For enterprise setup
            if account_type == 'enterprise' or account_type == 'business':
                if not user_email:
                    logger.error("❌ User email required for enterprise setup")
                    return None

                # Create admin service if not provided
                if not isinstance(self.drive_service, DriveAdminService):
                    self.drive_service = DriveAdminService(
                        config=self.config_service,
                        rate_limiter=self.rate_limiter,
                        google_token_handler=self.google_token_handler
                    )
                    if not await self.drive_service.connect_admin(org_id):
                        logger.error(
                            "❌ Failed to connect to Drive Admin service")
                        return None

                # Get user-specific service
                user_service = await self.drive_service.create_user_service(user_email)
                if not user_service:
                    logger.error(
                        f"❌ Failed to create user service for {user_email}")
                    return None

                metadata = await user_service.batch_fetch_metadata_and_permissions([file_id])
                return metadata[0]

            # For individual setup
            else:
                # Create user service if not provided
                if not isinstance(self.drive_service, DriveUserService):
                    self.drive_service = DriveUserService(
                        config=self.config_service,
                        rate_limiter=self.rate_limiter,
                        google_token_handler=self.google_token_handler,
                        credentials=self.credentials
                    )
                    
                    if not await self.drive_service.connect_individual_user(org_id, user_id):
                        logger.error(
                            "❌ Failed to connect to Drive User service")
                        return None

                metadata = await self.drive_service.batch_fetch_metadata_and_permissions([file_id])
                return metadata[0]

        except Exception as e:
            logger.error(f"❌ Failed to get Drive file {file_id}: {str(e)}")
            return None
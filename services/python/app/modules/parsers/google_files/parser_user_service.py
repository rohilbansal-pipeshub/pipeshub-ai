"""ParserUserService module for parsing Google Workspace files using user credentials"""

import os
import pickle
from typing import Dict, Optional
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from app.config.configuration_service import ConfigurationService, config_node_constants
from app.utils.logger import create_logger
from app.connectors.utils.rate_limiter import GoogleAPIRateLimiter
from app.connectors.google.scopes import GOOGLE_PARSER_SCOPES

logger = create_logger(__name__)

class ParserUserService:
    """ParserUserService class for parsing Google Workspace files using user credentials"""

    def __init__(self, config: ConfigurationService, rate_limiter: GoogleAPIRateLimiter, credentials=None):
        self.config_service = config
        self.rate_limiter = rate_limiter
        self.google_limiter = self.rate_limiter.google_limiter
        self.credentials = credentials

        # Services for different Google Workspace apps
        self.docs_service = None
        self.sheets_service = None
        self.slides_service = None

    async def connect_individual_user(self) -> bool:
        """Connect using OAuth2 credentials for individual user"""
        try:
            SCOPES = GOOGLE_PARSER_SCOPES

            creds = None
            if os.path.exists('token.pickle'):
                with open('token.pickle', 'rb') as token:
                    creds = pickle.load(token)

            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    credentials_path = await self.config_service.get_config(config_node_constants.GOOGLE_AUTH_CREDENTIALS_PATH.value)
                    flow = InstalledAppFlow.from_client_secrets_file(
                        credentials_path, SCOPES)
                    creds = flow.run_local_server(port=8090)
                with open('token.pickle', 'wb') as token:
                    pickle.dump(creds, token)

            # Initialize services
            self.docs_service = build('docs', 'v1', credentials=creds)
            self.sheets_service = build('sheets', 'v4', credentials=creds)
            self.slides_service = build('slides', 'v1', credentials=creds)

            return True

        except Exception as e:
            logger.error("❌ Failed to connect Parser User Service: %s", str(e))
            return False

    async def connect_enterprise_user(self) -> bool:
        """Connect using enterprise credentials"""
        try:
            if not self.credentials:
                logger.error("❌ No enterprise credentials provided")
                return False

            # Initialize services
            self.docs_service = build(
                'docs', 'v1', credentials=self.credentials)
            self.sheets_service = build(
                'sheets', 'v4', credentials=self.credentials)
            self.slides_service = build(
                'slides', 'v1', credentials=self.credentials)

            return True

        except Exception as e:
            logger.error(
                "❌ Failed to connect Enterprise Parser Service: %s", str(e))
            return False

    async def disconnect(self):
        """Disconnect and cleanup services"""
        try:
            logger.info("🔄 Disconnecting parser services")

            # Close the service connections if they exist
            if self.docs_service:
                self.docs_service.close()
                self.docs_service = None
            if self.sheets_service:
                self.sheets_service.close()
                self.sheets_service = None
            if self.slides_service:
                self.slides_service.close()
                self.slides_service = None

            # Clear credentials
            self.credentials = None

            logger.info("✅ Parser services disconnected successfully")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to disconnect parser services: {str(e)}")
            return False

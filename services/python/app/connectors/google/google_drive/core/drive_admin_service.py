"""DriveService module for interacting with Google Drive API"""

# pylint: disable=E1101, W0718

from typing import Dict, List, Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.config.configuration_service import ConfigurationService
from app.connectors.google.google_drive.core.drive_user_service import DriveUserService
from app.utils.logger import create_logger
from app.connectors.utils.decorators import exponential_backoff
from app.connectors.utils.rate_limiter import GoogleAPIRateLimiter
from app.connectors.google.scopes import GOOGLE_CONNECTOR_ENTERPRISE_SCOPES
from app.utils.time_conversion import parse_timestamp
from uuid import uuid4
from app.exceptions.connector_google_exceptions import (
    AdminServiceError, AdminAuthError, AdminListError, 
    AdminDelegationError, AdminQuotaError, UserOperationError
)

logger = create_logger(__name__)

class DriveAdminService:
    """DriveAdminService class for interacting with Google Drive API"""

    def __init__(self, config: ConfigurationService, rate_limiter: GoogleAPIRateLimiter, google_token_handler):
        self.config_service = config
        self.rate_limiter = rate_limiter
        self.google_limiter = self.rate_limiter.google_limiter
        self.google_token_handler = google_token_handler
        self.admin_service = None
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

            self.admin_service = build(
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
                "Failed to connect to Drive Admin Service",
                details={"error": str(e)}
            )
        
    @exponential_backoff()
    async def list_enterprise_users(self, org_id) -> List[Dict]:
        """List all users in the domain for enterprise setup"""
        try:
            logger.info("🚀 Listing domain users")
            users = []
            page_token = None

            while True:
                try:
                    async with self.google_limiter:
                        results = self.admin_service.users().list(
                            customer='my_customer',
                            orderBy='email',
                            projection='full',
                            pageToken=page_token
                        ).execute()
                except Exception as e:
                    if "quota" in str(e).lower():
                        raise AdminQuotaError(
                            "API quota exceeded while listing users",
                            details={"error": str(e)}
                        )
                    raise AdminListError(
                        "Failed to list users",
                        details={"error": str(e)}
                    )

                current_users = results.get('users', [])
                if current_users is None:
                    raise AdminListError(
                        "Invalid response format from Admin API",
                        details={"results": results}
                    )

                users.extend([{
                    '_key': str(uuid4()),
                    'userId': str(uuid4()),
                    'orgId': org_id,
                    'email': user.get('primaryEmail'),
                    'fullName': user.get('name', {}).get('fullName'),
                    'firstName': user.get('name', {}).get('givenName', ''),
                    'middleName': user.get('name', {}).get('middleName', ''),
                    'lastName': user.get('name', {}).get('familyName', ''),
                    'designation': user.get('designation', 'user'),
                    'businessPhones': user.get('phones', []),
                    'isActive': user.get('isActive', False),
                    'createdAtTimestamp': int(parse_timestamp(user.get('creationTime')).timestamp()),
                    'updatedAtTimestamp': int(parse_timestamp(user.get('creationTime')).timestamp())   
                } for user in current_users if not user.get('suspended', False)])

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            logger.info("✅ Found %s active users in domain", len(users))
            return users

        except (AdminQuotaError, AdminListError):
            raise
        except Exception as e:
            raise AdminServiceError(
                "Unexpected error while listing users",
                details={"error": str(e)}
            )

    async def create_user_service(self, user_email: str) -> Optional[DriveUserService]:
        """Get or create a DriveUserService for a specific user"""
        try:
            # Create delegated credentials for the user
            try:
                user_credentials = self.credentials.with_subject(user_email)
            except Exception as e:
                raise AdminDelegationError(
                    "Failed to create delegated credentials for user",
                    details={
                        "user_email": user_email,
                        "error": str(e)
                    }
                )

            # Create new user service
            user_service = DriveUserService(
                config=self.config_service,
                rate_limiter=self.rate_limiter,
                google_token_handler=self.google_token_handler,
                credentials=user_credentials
            )

            # Connect the user service
            try:
                if not await user_service.connect_enterprise_user():
                    raise UserOperationError(
                        "Failed to connect user service",
                        details={"user_email": user_email}
                    )
            except Exception as e:
                raise UserOperationError(
                    "Error connecting user service",
                    details={
                        "user_email": user_email,
                        "error": str(e)
                    }
                )

            return user_service

        except (AdminDelegationError, UserOperationError):
            raise
        except Exception as e:
            logger.error(f"❌ Failed to create user service for {user_email}: {str(e)}")
            raise AdminServiceError(
                "Unexpected error creating user service",
                details={
                    "user_email": user_email,
                    "error": str(e)
                }
            )

    @exponential_backoff()
    async def list_groups(self, org_id: str) -> Optional[List[Dict]]:
        """List all groups in the domain for enterprise setup"""
        try:
            logger.info("🚀 Listing domain groups")
            groups = []
            page_token = None

            while True:
                try:
                    async with self.google_limiter:
                        results = self.admin_service.groups().list(
                            customer='my_customer',
                            pageToken=page_token
                        ).execute()
                except Exception as e:
                    if "quota" in str(e).lower():
                        raise AdminQuotaError(
                            "API quota exceeded while listing groups",
                            details={"error": str(e)}
                        )
                    raise AdminListError(
                        "Failed to list groups",
                        details={"error": str(e)}
                    )

                current_groups = results.get('groups', [])
                if current_groups is None:
                    raise AdminListError(
                        "Invalid response format from Admin API",
                        details={"results": results}
                    )

                groups.extend([{
                    '_key': group.get('id'),
                    'groupId': group.get('id'),
                    'orgId': org_id,
                    'groupName': group.get('name'),
                    'email': group.get('email'),
                    'description': group.get('description', ''),
                    'adminCreated': group.get('adminCreated', False),
                    'createdAt': group.get('creationTime'),
                } for group in current_groups])

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            logger.info("✅ Found %s groups", len(groups))
            return groups

        except (AdminQuotaError, AdminListError):
            raise
        except Exception as e:
            raise AdminServiceError(
                "Unexpected error while listing groups",
                details={
                    "org_id": org_id,
                    "error": str(e)
                }
            )

    @exponential_backoff()
    async def list_domains(self) -> List[Dict]:
        """List all domains for the enterprise"""
        try:
            logger.info("🚀 Listing domains")
            domains = []
            page_token = None

            while True:
                async with self.google_limiter:
                    results = self.admin_service.domains().list(
                        customer='my_customer',
                    ).execute()

                    current_domains = results.get('domains', [])

                    domains.extend([{
                        '_key': f"gdr_domain_{domain.get('domainName')}",
                        'domainName': domain.get('domainName'),
                        'verified': domain.get('verified', False),
                        'isPrimary': domain.get('isPrimary', False),
                        'createdAt': domain.get('creationTime'),
                    } for domain in current_domains])

                    page_token = results.get('nextPageToken')
                    if not page_token:
                        break

            logger.info("✅ Found %s domains", len(domains))
            return domains

        except Exception as e:
            logger.error("❌ Failed to list domains: %s", str(e))
            return []

    @exponential_backoff()
    async def list_group_members(self, group_email: str) -> List[Dict]:
        """List all members of a specific group"""
        try:
            logger.info(f"🚀 Listing members for group: {group_email}")
            members = []
            page_token = None

            while True:
                try:
                    async with self.google_limiter:
                        results = self.admin_service.members().list(
                            groupKey=group_email,
                            pageToken=page_token
                        ).execute()
                except Exception as e:
                    if "quota" in str(e).lower():
                        raise AdminQuotaError(
                            "API quota exceeded while listing group members",
                            details={
                                "group_email": group_email,
                                "error": str(e)
                            }
                        )
                    raise AdminListError(
                        "Failed to list group members",
                        details={
                            "group_email": group_email,
                            "error": str(e)
                        }
                    )

                current_members = results.get('members', [])
                if current_members is None:
                    raise AdminListError(
                        "Invalid response format from Admin API",
                        details={
                            "group_email": group_email,
                            "results": results
                        }
                    )

                members.extend([{
                    'email': member.get('email'),
                    'role': member.get('role', 'member').lower(),
                    'type': member.get('type'),
                    'status': member.get('status', 'active')
                } for member in current_members])

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            logger.info(f"✅ Found {len(members)} members in group {group_email}")
            return members

        except (AdminQuotaError, AdminListError):
            raise
        except Exception as e:
            raise AdminServiceError(
                "Unexpected error while listing group members",
                details={
                    "group_email": group_email,
                    "error": str(e)
                }
            )

    async def cleanup_user_service(self, user_email: str):
        """Cleanup user service when no longer needed"""
        if user_email in self._user_services:
            await self._user_services[user_email].disconnect()
            del self._user_services[user_email]

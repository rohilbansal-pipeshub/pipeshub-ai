"""Gmail Admin Service module for interacting with Google GMail API"""

# pylint: disable=E1101, W0718
import os
from datetime import datetime
from typing import Dict, List, Optional
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.config.configuration_service import ConfigurationService, config_node_constants, TokenScopes, Routes
from app.connectors.google.gmail.core.gmail_user_service import GmailUserService
from app.utils.logger import logger
from app.connectors.utils.decorators import exponential_backoff
from app.connectors.utils.rate_limiter import GoogleAPIRateLimiter
from app.connectors.google.scopes import GOOGLE_CONNECTOR_ENTERPRISE_SCOPES
from uuid import uuid4
from googleapiclient.errors import HttpError
from app.exceptions.connector_google_exceptions import (
    AdminServiceError, AdminAuthError, AdminListError, 
    AdminDelegationError, AdminQuotaError, UserOperationError,
    GoogleMailError, MailOperationError, BatchOperationError,
    DrivePermissionError
)

from app.utils.time_conversion import parse_timestamp

class GmailAdminService:
    """GmailAdminService class for interacting with Google GMail API"""

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

            try:
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
            except AdminAuthError:
                raise
            except Exception as e:
                raise AdminAuthError(
                    "Error getting enterprise token",
                    details={
                        "org_id": org_id,
                        "error": str(e)
                    }
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

            try:
                self.admin_service = build(
                    'admin',
                    'directory_v1',
                    credentials=self.credentials,
                    cache_discovery=False
                )
            except Exception as e:
                raise AdminServiceError(
                    "Failed to build admin service",
                    details={
                        "org_id": org_id,
                        "error": str(e)
                    }
                )

            return True

        except (AdminAuthError, AdminDelegationError, AdminServiceError):
            raise
        except Exception as e:
            raise AdminServiceError(
                "Unexpected error connecting admin service",
                details={
                    "org_id": org_id,
                    "error": str(e)
                }
            )

    @exponential_backoff()
    async def list_enterprise_users(self, org_id: str) -> List[Dict]:
        """List all users in the domain for enterprise setup"""
        try:
            logger.info("🚀 Listing domain users")
            users = []
            page_token = None
            failed_items = []

            while True:
                try:
                    async with self.google_limiter:
                        results = self.admin_service.users().list(
                            customer='my_customer',
                            orderBy='email',
                            projection='full',
                            pageToken=page_token
                        ).execute()
                except HttpError as e:
                    if e.resp.status == 403:
                        raise AdminAuthError(
                            "Permission denied listing users",
                            details={
                                "org_id": org_id,
                                "error": str(e)
                            }
                        )
                    elif e.resp.status == 429:
                        raise AdminQuotaError(
                            "Rate limit exceeded listing users",
                            details={
                                "org_id": org_id,
                                "error": str(e)
                            }
                        )
                    raise AdminListError(
                        "Failed to list users",
                        details={
                            "org_id": org_id,
                            "error": str(e)
                        }
                    )

                current_users = results.get('users', [])
                
                for user in current_users:
                    if not user.get('suspended', False):
                        try:
                            users.append({
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
                            })
                        except Exception as e:
                            failed_items.append({
                                'email': user.get('primaryEmail'),
                                'error': str(e)
                            })

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            if failed_items:
                raise BatchOperationError(
                    f"Failed to process {len(failed_items)} users",
                    failed_items=failed_items,
                    details={
                        "org_id": org_id,
                        "total_users": len(current_users)
                    }
                )

            logger.info("✅ Found %s active users in domain", len(users))
            return users

        except (AdminAuthError, AdminQuotaError, AdminListError, BatchOperationError):
            raise
        except Exception as e:
            raise AdminServiceError(
                "Unexpected error listing users",
                details={
                    "org_id": org_id,
                    "error": str(e)
                }
            )

    async def create_user_service(self, user_email: str) -> Optional[GmailUserService]:
        """Get or create a GmailUserService for a specific user"""
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
            user_service = GmailUserService(
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
            raise GoogleMailError(
                "Unexpected error creating user service",
                details={
                    "user_email": user_email,
                    "error": str(e)
                }
            )

    @exponential_backoff()
    async def list_groups(self, org_id: str) -> List[Dict]:
        """List all groups in the domain for enterprise setup"""
        try:
            logger.info("🚀 Listing domain groups")
            groups = []
            page_token = None
            failed_items = []

            while True:
                try:
                    async with self.google_limiter:
                        results = self.admin_service.groups().list(
                            customer='my_customer',
                            pageToken=page_token
                        ).execute()
                except HttpError as e:
                    if e.resp.status == 403:
                        raise AdminAuthError(
                            "Permission denied listing groups",
                            details={
                                "org_id": org_id,
                                "error": str(e)
                            }
                        )
                    elif e.resp.status == 429:
                        raise AdminQuotaError(
                            "Rate limit exceeded listing groups",
                            details={
                                "org_id": org_id,
                                "error": str(e)
                            }
                        )
                    raise AdminListError(
                        "Failed to list groups",
                        details={
                            "org_id": org_id,
                            "error": str(e)
                        }
                    )

                current_groups = results.get('groups', [])
                for group in current_groups:
                    try:
                        groups.append({
                            '_key': group.get('id'),
                            'groupId': group.get('id'),
                            'orgId': org_id,
                            'groupName': group.get('name'),
                            'email': group.get('email'),
                            'description': group.get('description', ''),
                            'adminCreated': group.get('adminCreated', False),
                            'createdAt': group.get('creationTime'),
                        })
                    except Exception as e:
                        failed_items.append({
                            'group_id': group.get('id'),
                            'error': str(e)
                        })

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            if failed_items:
                raise BatchOperationError(
                    f"Failed to process {len(failed_items)} groups",
                    failed_items=failed_items,
                    details={
                        "org_id": org_id,
                        "total_groups": len(current_groups)
                    }
                )

            logger.info("✅ Found %s groups", len(groups))
            return groups

        except (AdminAuthError, AdminQuotaError, AdminListError, BatchOperationError):
            raise
        except Exception as e:
            raise AdminServiceError(
                "Unexpected error listing groups",
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
            failed_items = []
            page_token = None

            while True:
                try:
                    async with self.google_limiter:
                        results = self.admin_service.domains().list(
                            customer='my_customer',
                            pageToken=page_token
                        ).execute()
                except HttpError as e:
                    if e.resp.status == 403:
                        raise AdminAuthError(
                            "Permission denied listing domains",
                            details={"error": str(e)}
                        )
                    elif e.resp.status == 429:
                        raise AdminQuotaError(
                            "Rate limit exceeded listing domains",
                            details={"error": str(e)}
                        )
                    raise AdminListError(
                        "Failed to list domains",
                        details={"error": str(e)}
                    )

                current_domains = results.get('domains', [])
                for domain in current_domains:
                    try:
                        domains.append({
                            '_key': f"gdr_domain_{domain.get('domainName')}",
                            'domainName': domain.get('domainName'),
                            'verified': domain.get('verified', False),
                            'isPrimary': domain.get('isPrimary', False),
                            'createdAt': domain.get('creationTime'),
                        })
                    except Exception as e:
                        failed_items.append({
                            'domain': domain.get('domainName'),
                            'error': str(e)
                        })

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            if failed_items:
                raise BatchOperationError(
                    f"Failed to process {len(failed_items)} domains",
                    failed_items=failed_items,
                    details={"total_domains": len(domains)}
                )

            logger.info("✅ Found %s domains", len(domains))
            return domains

        except (AdminAuthError, AdminQuotaError, AdminListError, BatchOperationError):
            raise
        except Exception as e:
            raise AdminServiceError(
                "Unexpected error listing domains",
                details={"error": str(e)}
            )

    @exponential_backoff()
    async def list_group_members(self, group_email: str) -> List[Dict]:
        """List all members of a specific group"""
        try:
            logger.info(f"🚀 Listing members for group: {group_email}")
            members = []
            page_token = None

            while True:
                async with self.google_limiter:
                    results = self.admin_service.members().list(
                        groupKey=group_email,
                        pageToken=page_token
                    ).execute()

                    current_members = results.get('members', [])

                    members.extend([{
                        'email': member.get('email'),
                        'role': member.get('role', 'member').lower(),
                        'type': member.get('type'),
                        'status': member.get('status', 'active')
                    } for member in current_members])

                    page_token = results.get('nextPageToken')
                    if not page_token:
                        break

            logger.info(
                f"✅ Found {len(members)} members in group {group_email}")
            return members

        except Exception as e:
            logger.error(
                "❌ Failed to list group members for %s: %s", group_email, str(e))
            return []

    async def cleanup_user_service(self, user_email: str):
        """Cleanup user service when no longer needed"""
        if user_email in self._user_services:
            await self._user_services[user_email].disconnect()
            del self._user_services[user_email]

    async def create_user_watch(self, user_email: str) -> Dict:
        """Create user watch by impersonating the user"""
        try:
            logger.info("🚀 Creating user watch for user %s", user_email)
            topic = "projects/agile-seeker-447812-p3/topics/gmail-connector"

            try:
                gmail_service = build(
                    'gmail', 'v1', 
                    credentials=self.credentials, 
                    cache_discovery=False
                )
            except Exception as e:
                raise MailOperationError(
                    "Failed to build Gmail service",
                    details={
                        "user_email": user_email,
                        "error": str(e)
                    }
                )

            try:
                async with self.google_limiter:
                    request_body = {
                        'labelIds': ['INBOX'],
                        'topicName': topic
                    }
                    response = gmail_service.users().watch(
                        userId='me', 
                        body=request_body
                    ).execute()
            except HttpError as e:
                if e.resp.status == 403:
                    raise DrivePermissionError(
                        "Permission denied creating user watch",
                        details={
                            "user_email": user_email,
                            "error": str(e)
                        }
                    )
                elif e.resp.status == 429:
                    raise AdminQuotaError(
                        "Rate limit exceeded creating user watch",
                        details={
                            "user_email": user_email,
                            "error": str(e)
                        }
                    )
                raise MailOperationError(
                    "Failed to create user watch",
                    details={
                        "user_email": user_email,
                        "error": str(e)
                    }
                )

            logger.info("✅ User watch created successfully for %s", user_email)
            return response

        except (DrivePermissionError, AdminQuotaError, MailOperationError):
            raise
        except Exception as e:
            raise GoogleMailError(
                "Unexpected error creating user watch",
                details={
                    "user_email": user_email,
                    "error": str(e)
                }
            )

from typing import Dict, Any
import json
from app.utils.logger import create_logger
from app.config.arangodb_constants import CollectionNames
from uuid import uuid4

logger = create_logger(__name__)

class AdminWebhookHandler:
    def __init__(self, admin_service):
        self.admin_service = admin_service
        self.arango_service = admin_service.arango_service
        

    async def process_notification(self, event_type: str, body: Dict[str, Any]):
        """Process incoming admin webhook notifications"""
        try:
            # Extract event details from the nested structure
            events = body.get('events', [])
            if not events:
                logger.error("No events found in webhook notification")
                return

            for event in events:
                event_name = event.get('name')
                if event_name == "CREATE_USER":
                    await self._handle_user_creation(event)
                elif event_name == "DELETE_USER":
                    await self._handle_user_deletion(event)
                else:
                    logger.info(f"Unhandled admin event type: {event_name}")

        except Exception as e:
            logger.error(f"Error processing admin webhook notification: {str(e)}")
            raise

    async def _handle_user_creation(self, event: Dict[str, Any]):
        """Handle user creation event"""
        try:
            # Extract user email from the parameters array
            user_email = None
            for param in event.get('parameters', []):
                if param.get('name') == 'USER_EMAIL':
                    user_email = param.get('value')
                    break

            if not user_email:
                logger.error("No user email found in CREATE_USER notification")
                return
            
            orgs = await self.arango_service.get_all_orgs(active=True)
            org = orgs[0]
            org_id = org['_key']
            
            logger.info(f"Processing user creation for: {user_email}")
            
            # Call user service to handle the new user
            await self.admin_service.handle_new_user(org_id, user_email)

        except Exception as e:
            logger.error(f"Error handling user creation: {str(e)}")
            raise
        
    async def _handle_user_deletion(self, event: Dict[str, Any]):
        """Handle user deletion event"""
        try:
            # Extract user email from the parameters array
            user_email = None
            for param in event.get('parameters', []):
                if param.get('name') == 'USER_EMAIL':
                    user_email = param.get('value')
                    break

            if not user_email:
                logger.error("No user email found in DELETE_USER notification")
                return
            
            user_key = await self.arango_service.get_entity_id_by_email(user_email)
            if not user_key:
                logger.error(f"User {user_email} not found in ArangoDB")
                return
            
            user = await self.arango_service.get_document(user_key, CollectionNames.USERS.value)
            org_id = user.get('orgId')
            
            logger.info(f"Processing user deletion for: {user_email}")

            await self.admin_service.handle_deleted_user(org_id, user_email)
            
        except Exception as e:
            logger.error(f"Error handling user deletion: {str(e)}")
            raise

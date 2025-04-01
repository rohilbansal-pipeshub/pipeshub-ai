from datetime import datetime, timedelta, timezone
from typing import Dict, Any
import jwt
from fastapi import HTTPException
from jose import JWTError
from pydantic import BaseModel, ValidationError
from app.utils.logger import create_logger
import os
from dotenv import load_dotenv
from app.config.configuration_service import ConfigurationService, config_node_constants

load_dotenv()

logger = create_logger('signed_url')

class SignedUrlConfig(BaseModel):
    private_key: str = os.getenv("SCOPED_JWT_SECRET")
    expiration_minutes: int = 30
    algorithm: str = "HS256"
    url_prefix: str = "/api/v1/index"

class TokenPayload(BaseModel):
    record_id: str
    user_id: str
    exp: datetime
    iat: datetime
    additional_claims: Dict[str, Any] = {}

    class Config:
        json_encoders = {
            datetime: lambda v: v.timestamp()  # Convert datetime to timestamp
        }

class SignedUrlHandler:
    def __init__(self, config: SignedUrlConfig, configuration_service: ConfigurationService):
        self.signed_url_config = config
        self.config_service = configuration_service
        self._validate_config()

    def _validate_config(self) -> None:
        """Validate handler configuration"""
        if not self.signed_url_config.private_key:
            raise ValueError("Private key is required")
        if self.signed_url_config.expiration_minutes <= 0:
            raise ValueError("Expiration minutes must be positive")

    async def create_signed_url(self, record_id: str, org_id: str, user_id: str, additional_claims: Dict[str, Any] = None, connector: str = None) -> str:
        """Create a signed URL with optional additional claims"""
        try:
            expiration = datetime.now(timezone(timedelta(
                hours=5, minutes=30))) + timedelta(minutes=self.signed_url_config.expiration_minutes)
            
            connector_config = await self.config_service.get_config(config_node_constants.CONNECTORS_SERVICE.value)
            connector_endpoint = connector_config.get('endpoint')
            
            logger.info(f"user_id: {user_id}")

            payload = TokenPayload(
                record_id=record_id,
                user_id=user_id,
                exp=expiration,
                iat=datetime.utcnow(),
                additional_claims=additional_claims or {}
            )

            # Convert to dict before encoding
            payload_dict = {
                "record_id": record_id,  # Ensure file_id is at the top level
                "user_id": user_id,
                "exp": payload.exp.timestamp(),  # Convert datetime to timestamp
                "iat": payload.iat.timestamp(),
                "additional_claims": additional_claims or {}
            }

            token = jwt.encode(
                payload_dict,
                self.signed_url_config.private_key,
                algorithm=self.signed_url_config.algorithm
            )

            logger.info(
                "Created signed URL for record %s with connector %s", record_id, connector)

            return f"{connector_endpoint}{self.signed_url_config.url_prefix}/{org_id}/{connector}/record/{record_id}?token={token}"

        except ValidationError as e:
            logger.error("Payload validation error: %s", str(e))
            raise HTTPException(status_code=400, detail="Invalid payload data")
        except Exception as e:
            logger.error("Error creating signed URL: %s", str(e))
            raise HTTPException(
                status_code=500, detail="Error creating signed URL")

    def validate_token(self, token: str, required_claims: Dict[str, Any] = None) -> TokenPayload:
        """Validate the JWT token and optional required claims"""
        try:
            logger.info(f"Validating token: {token}")
            payload = jwt.decode(
                token,
                self.signed_url_config.private_key,
                algorithms=[self.signed_url_config.algorithm]
            )
            logger.info(f"Payload: {payload}")

            # Convert timestamps back to datetime for validation
            if 'exp' in payload:
                payload['exp'] = datetime.fromtimestamp(payload['exp'])
            if 'iat' in payload:
                payload['iat'] = datetime.fromtimestamp(payload['iat'])

            token_data = TokenPayload(**payload)
            logger.info(f"Token data: {token_data}")

            if required_claims:
                for key, value in required_claims.items():
                    if token_data.additional_claims.get(key) != value:
                        raise HTTPException(
                            status_code=401,
                            detail=f"Required claim '{key}' is invalid"
                        )

            return token_data

        except JWTError as e:
            logger.error("JWT validation error: %s", str(e))
            raise HTTPException(
                status_code=401, detail="Invalid or expired token")
        except ValidationError as e:
            logger.error("Payload validation error: %s", str(e))
            raise HTTPException(
                status_code=400, detail="Invalid token payload")
        except Exception as e:
            logger.error(
                "Unexpected error during token validation: %s", str(e))
            raise HTTPException(
                status_code=500, detail="Error validating token")

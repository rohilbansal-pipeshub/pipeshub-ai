import os
from fastapi import HTTPException, status, Request
from jose import JWTError, jwt

# Authentication logic
def isJwtTokenValid(request: Request):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"}
    )
    try:
        SECRET_KEY = os.environ.get("JWT_SECRET")
        algorithm = os.environ.get("JWT_ALGORITHM", "HS256")
        if not SECRET_KEY:
            raise ValueError("Missing SECRET_KEY in environment variables")

        # Get the Authorization header
        authorization: str = request.headers.get("Authorization")

        if not authorization or not authorization.startswith("Bearer "):
            raise credentials_exception

        # Extract the token
        token = authorization.split("Bearer ")[1]
        if not token:
            raise credentials_exception

        # Decode the JWT
        payload = jwt.decode(token, SECRET_KEY, algorithms=[algorithm])
        payload["user"] = token
        return payload
    except JWTError as e:
        print(f"JWT Error: {e}")
        raise credentials_exception


# Dependency for injecting authentication
async def authMiddleware(request: Request):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )
    try:# Validate the token
        payload = isJwtTokenValid(request)
        # Attach the authenticated user information to the request state
        request.state.user = payload
    except HTTPException as e:
        raise e  # Re-raise HTTPException instances
    except Exception as e:
        print(f"Unexpected error: {e}")
        raise credentials_exception
    return request

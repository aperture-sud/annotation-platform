import os
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY          = os.getenv("JWT_SECRET", "change-me-in-production")
ALGORITHM           = "HS256"
TOKEN_EXPIRE_HOURS  = int(os.getenv("JWT_EXPIRE_HOURS", "8"))

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(username: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": username, "role": role, "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str     = payload.get("role")
        if not username or not role:
            raise exc
    except JWTError:
        raise exc

    from database import get_conn
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT role FROM users WHERE username = %s", (username,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        raise exc

    return {"username": username, "role": row["role"]}


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_manager(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="Manager access required")
    return user

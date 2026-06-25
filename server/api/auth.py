from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from core.auth import verify_password, create_access_token, OPERATOR

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/token")
def login(form: OAuth2PasswordRequestForm = Depends()):
    if form.username != OPERATOR["username"] or not verify_password(form.password, OPERATOR["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": form.username})
    return {"access_token": token, "token_type": "bearer"}

from fastapi import APIRouter, Depends
from core.profile import list_profiles
from core.auth import get_current_operator

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


@router.get("/")
def get_profiles(_: str = Depends(get_current_operator)):
    return list_profiles()

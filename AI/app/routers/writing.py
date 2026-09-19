from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.drafting import VALID_MODES, generate_draft
from app.services.prompt_guard import KIND_REFUSAL, detect_injection

router = APIRouter()


class DraftRequest(BaseModel):
    user_id: str
    document_ids: list[str]
    mode: str
    custom_instruction: str | None = None


@router.post("/draft")
def create_draft(request: DraftRequest):
    if not request.document_ids:
        raise HTTPException(status_code=400, detail="At least one document required")

    if request.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail="Invalid draft mode")

    # The custom instruction is direct user input — block obvious jailbreaks.
    if request.custom_instruction and detect_injection(request.custom_instruction):
        raise HTTPException(status_code=400, detail=KIND_REFUSAL)

    return generate_draft(
        user_id=request.user_id,
        document_ids=request.document_ids,
        mode=request.mode,
        custom_instruction=request.custom_instruction,
    )

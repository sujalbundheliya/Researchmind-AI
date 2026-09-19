from pydantic import BaseModel


class IngestRequest(BaseModel):
    document_id: str
    file_path: str
    user_id: str
    workspace_id: str | None = None
    filename: str | None = None
    original_name: str | None = None
    file_size_bytes: int | None = None


class IngestResponse(BaseModel):
    document_id: str
    status: str
    chunk_count: int | None = None

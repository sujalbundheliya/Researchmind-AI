from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    openai_api_key: str = ""
    groq_api_key: str = ""
    # Provider-agnostic LLM config (OpenAI-compatible). Point llm_base_url +
    # llm_api_key at whichever provider llm_model belongs to (OpenRouter here).
    llm_api_key: str = ""
    llm_base_url: str = "https://openrouter.ai/api/v1"
    embedding_model: str = "BAAI/bge-base-en-v1.5"
    chunk_size: int = 500
    chunk_overlap: int = 50
    top_k_results: int = 5
    llm_model: str = "google/gemini-2.5-flash"
    llm_max_tokens: int = 1500

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()

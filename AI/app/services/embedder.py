import numpy as np
from sentence_transformers import SentenceTransformer

_model: SentenceTransformer = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("BAAI/bge-base-en-v1.5")
    return _model


def encode(texts: list[str]) -> list[np.ndarray]:
    model = get_model()
    prefixed = [f"Represent this sentence: {t}" for t in texts]
    embeddings = model.encode(
        prefixed,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=32,
    )
    return embeddings

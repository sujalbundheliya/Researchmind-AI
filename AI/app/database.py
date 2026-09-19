from contextlib import contextmanager

import psycopg2
from pgvector.psycopg2 import register_vector
from psycopg2 import pool

from app.config import settings

_pool: pool.SimpleConnectionPool = None


def get_pool() -> pool.SimpleConnectionPool:
    global _pool
    if _pool is None:
        _pool = pool.SimpleConnectionPool(1, 10, settings.database_url)
    return _pool


@contextmanager
def get_connection():
    p = get_pool()
    conn = p.getconn()

    # Neon closes idle connections server-side; the pool doesn't notice until
    # a query is attempted, so probe and replace stale connections up front.
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
    except (psycopg2.OperationalError, psycopg2.InterfaceError):
        p.putconn(conn, close=True)
        conn = p.getconn()

    try:
        register_vector(conn)
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)

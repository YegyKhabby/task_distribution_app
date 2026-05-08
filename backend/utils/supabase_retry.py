import time
import httpx


def supabase_query(fn, max_attempts: int = 3, base_delay: float = 0.3):
    """Run a Supabase query, retrying on transient network errors."""
    last_exc = None
    for attempt in range(max_attempts):
        try:
            return fn()
        except (httpx.TransportError, httpx.RemoteProtocolError) as e:
            last_exc = e
            if attempt < max_attempts - 1:
                time.sleep(base_delay * (attempt + 1))
    raise last_exc

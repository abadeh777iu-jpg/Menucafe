"""Password hashing, session tokens and login throttling (standard library only)."""
import base64
import hashlib
import hmac
import secrets
import threading
import time

PBKDF2_ITERATIONS = 600_000
PASSWORD_MIN_LENGTH = 10
PASSWORD_MAX_LENGTH = 200
SESSION_TTL_SECONDS = 12 * 60 * 60
LOGIN_FAILURE_LIMIT = 5
LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60

_dummy_hash = None
_dummy_lock = threading.Lock()


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode('ascii')


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
    return f'pbkdf2_sha256${PBKDF2_ITERATIONS}${_b64(salt)}${_b64(digest)}'


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored.split('$')
        if algorithm != 'pbkdf2_sha256':
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def dummy_hash() -> str:
    """Used for unknown usernames so the response time does not reveal which accounts exist."""
    global _dummy_hash
    with _dummy_lock:
        if _dummy_hash is None:
            _dummy_hash = hash_password('not-a-real-password-' + secrets.token_hex(8))
        return _dummy_hash


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_digest(token: str) -> str:
    """Only a digest of the session token is stored; a leaked database cannot be replayed as cookies."""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


class LoginThrottle:
    """Blocks a (client, username) pair after repeated failures. In-memory, per process."""

    def __init__(self, limit=LOGIN_FAILURE_LIMIT, window=LOGIN_FAILURE_WINDOW_SECONDS):
        self.limit = limit
        self.window = window
        self._failures = {}
        self._lock = threading.Lock()

    def _recent(self, key, now):
        recent = [t for t in self._failures.get(key, []) if now - t < self.window]
        if recent:
            self._failures[key] = recent
        else:
            self._failures.pop(key, None)
        return recent

    def blocked(self, key) -> bool:
        with self._lock:
            return len(self._recent(key, time.monotonic())) >= self.limit

    def record_failure(self, key) -> None:
        with self._lock:
            now = time.monotonic()
            self._failures.setdefault(key, []).append(now)
            self._recent(key, now)

    def reset(self, key) -> None:
        with self._lock:
            self._failures.pop(key, None)

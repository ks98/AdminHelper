import os
from pathlib import Path

SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 Stunden

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR}/db.sqlite3"
CONNECTIONS_FILE = DATA_DIR / "connections.json"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")

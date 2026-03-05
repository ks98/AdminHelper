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

# IP-Zugangsbeschränkung
# Kommagetrennte Liste von IPs und/oder CIDR-Netzen, z.B.:
#   ALLOWED_IPS=192.168.1.0/24,10.0.0.5,172.16.0.0/12
# Leer lassen = kein Filter, alle IPs erlaubt.
ALLOWED_IPS_RAW = os.environ.get("ALLOWED_IPS", "").strip()

# Auf True setzen wenn der Server hinter einem Reverse-Proxy (nginx, Traefik, …) läuft
# und X-Forwarded-For / X-Real-IP vertraut werden soll.
TRUST_PROXY_HEADERS = os.environ.get("TRUST_PROXY_HEADERS", "false").lower() in ("1", "true", "yes")

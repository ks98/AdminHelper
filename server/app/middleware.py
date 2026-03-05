import ipaddress
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from .config import ALLOWED_IPS_RAW, TRUST_PROXY_HEADERS

logger = logging.getLogger(__name__)


def _parse_networks(raw: str) -> list:
    """Parst eine kommagetrennte Liste von IPs/CIDRs in ipaddress-Objekte."""
    networks = []
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            logger.warning("ALLOWED_IPS: ungültiger Eintrag ignoriert: %r", entry)
    return networks


_ALLOWED_NETWORKS = _parse_networks(ALLOWED_IPS_RAW) if ALLOWED_IPS_RAW else []


def _is_allowed(ip_str: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return any(addr in net for net in _ALLOWED_NETWORKS)


def _client_ip(request: Request) -> str:
    if TRUST_PROXY_HEADERS:
        # X-Real-IP hat Vorrang, dann erstes Element aus X-Forwarded-For
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else ""


class IPFilterMiddleware(BaseHTTPMiddleware):
    """Blockiert Anfragen von IPs, die nicht in ALLOWED_IPS stehen.
    Wenn ALLOWED_IPS leer ist, wird gar nicht gefiltert."""

    async def dispatch(self, request: Request, call_next):
        if not _ALLOWED_NETWORKS:
            return await call_next(request)

        ip = _client_ip(request)
        if not _is_allowed(ip):
            logger.warning("Zugriff verweigert für IP: %s %s", ip, request.url.path)
            return JSONResponse(
                status_code=403,
                content={"detail": f"Zugriff verweigert: {ip}"},
            )

        return await call_next(request)

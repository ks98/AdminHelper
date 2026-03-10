"""
Script-Runner für Webhook-Scripts.

Jedes Script wird via exec() ausgeführt. Imports sind vollständig erlaubt,
da Webhooks nur von Admins angelegt werden können.

Verfügbare Variablen im Script:
    load_connections()  -> list[dict]   Verbindungen laden
    save_connections(list[dict])        Verbindungen speichern
    uuid4()             -> str          Neue UUID generieren
    payload             dict            JSON-Body des Webhook-Requests
    headers             dict            HTTP-Request-Header
    params              dict            Query-Parameter des Requests
    result              dict            Rückgabe an den Aufrufer (hier reinschreiben)
    logs                list            Log-Ausgaben (logs.append("..."))
    log(msg)                            Kurzform für logs.append(str(msg))

Beispiel mit HTTP-Aufruf:
    import requests
    r = requests.get("https://api.example.com/servers")
    for srv in r.json():
        connections = load_connections()
        connections.append({"id": uuid4(), "name": srv["name"], "kind": "ssh", "host": srv["ip"]})
        save_connections(connections)
    result["imported"] = len(r.json())
"""

import builtins
import uuid as _uuid
from typing import Any

from .storage import load_connections, save_connections


def run_webhook_script(
    script: str,
    payload: Any,
    headers: dict,
    params: dict,
) -> dict:
    """Script ausführen und Ergebnis zurückgeben."""
    result: dict = {}
    logs: list = []

    def _log(msg: Any) -> None:
        logs.append(str(msg))

    # print() in den Log umleiten statt auf stdout
    def _print(*args, sep=" ", end="\n", **_kwargs):  # noqa: ANN001
        logs.append(sep.join(str(a) for a in args))

    # Vollständige Builtins inkl. __import__ — Webhooks sind Admin-only
    full_builtins = vars(builtins).copy()
    full_builtins["print"] = _print

    namespace: dict[str, Any] = {
        "__builtins__": full_builtins,
        # Storage-Funktionen
        "load_connections": load_connections,
        "save_connections": save_connections,
        # Hilfsfunktionen
        "uuid4": lambda: str(_uuid.uuid4()),
        "log": _log,
        # Request-Kontext
        "payload": payload if payload is not None else {},
        "headers": dict(headers),
        "params": dict(params),
        # Ausgabe
        "result": result,
        "logs": logs,
    }

    compiled = compile(script, "<webhook_script>", "exec")
    exec(compiled, namespace)  # noqa: S102

    return {"success": True, "result": result, "logs": logs}

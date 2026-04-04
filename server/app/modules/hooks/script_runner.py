"""
Script-Runner für Hooks.

Jedes Script wird via exec() ausgeführt. Gefährliche Builtins (exec, eval,
compile) sind entfernt. Imports sind auf eine Whitelist sicherer
Standardmodule beschränkt. Ein AST-Check blockiert MRO-Traversal.

Verfügbare Variablen im Script (immer):
    load_connections()  -> list[dict]   Verbindungen laden
    save_connections(list[dict])        Verbindungen speichern
    uuid4()             -> str          Neue UUID generieren
    result              dict            Rückgabe an den Aufrufer
    logs                list            Log-Ausgaben
    log(msg)                            Kurzform für logs.append(str(msg))
    http_get(url, ...)  -> dict         HTTP-GET mit Timeout
    http_post(url, ...) -> dict         HTTP-POST mit Timeout

Webhook-Kontext:
    payload             dict            JSON-Body des Requests
    headers             dict            HTTP-Request-Header
    params              dict            Query-Parameter

Event-Kontext:
    event_type          str             Name des Events (z. B. "connection.created")
    event_data          dict            Betroffene Ressource

Schedule-Kontext:
    triggered_at        str             ISO-Zeitstempel der Ausführung
    last_run            str|None        Letzter Lauf (ISO) oder None
"""

import ast
import builtins
import ctypes
import threading
import uuid as _uuid
from typing import Any

import httpx as _httpx

from app.modules.connections.storage import load_connections, save_connections

# ---------------------------------------------------------------------------
# Konstanten
# ---------------------------------------------------------------------------

SCRIPT_TIMEOUT_SECONDS = 30
MAX_LOG_LINES = 1000
MAX_LOG_LINE_LENGTH = 4096


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ScriptTimeoutError(Exception):
    """Wird ausgelöst wenn ein Script das Zeitlimit überschreitet."""


class ScriptSecurityError(Exception):
    """Wird ausgelöst wenn ein Script unsichere Konstrukte verwendet."""


# ---------------------------------------------------------------------------
# Import-Whitelist
# ---------------------------------------------------------------------------

# Sichere Module — reine Berechnung, kein Dateisystem/Netzwerk
_IMPORT_WHITELIST = frozenset({
    "json", "re", "math", "datetime", "time", "hashlib", "hmac",
    "base64", "collections", "itertools", "functools", "operator",
    "string", "textwrap", "copy", "csv", "uuid", "random",
})

# Submodule die erlaubt sind, deren Top-Level-Modul aber NICHT
_IMPORT_WHITELIST_EXACT = frozenset({
    "urllib.parse",
})

# ---------------------------------------------------------------------------
# AST-Sicherheitsprüfung
# ---------------------------------------------------------------------------

# Dunder-Attribute die in Scripts erlaubt sind (Standard-Protokolle)
_ALLOWED_DUNDERS = frozenset({
    "__init__", "__str__", "__repr__", "__len__", "__iter__",
    "__next__", "__getitem__", "__setitem__", "__delitem__",
    "__contains__", "__enter__", "__exit__", "__eq__", "__ne__",
    "__lt__", "__gt__", "__le__", "__ge__", "__hash__",
    "__bool__", "__add__", "__sub__", "__mul__", "__truediv__",
    "__floordiv__", "__mod__", "__pow__", "__neg__", "__pos__",
    "__abs__", "__int__", "__float__", "__round__",
    "__name__", "__doc__",
})


def _check_ast_safety(source: str, filename: str) -> None:
    """AST prüfen und unsichere Dunder-Zugriffe blockieren."""
    tree = ast.parse(source, filename)
    for node in ast.walk(tree):
        # Direkter Attributzugriff: obj.__class__, obj.__bases__, etc.
        if isinstance(node, ast.Attribute):
            attr = node.attr
            if (
                attr.startswith("__")
                and attr.endswith("__")
                and attr not in _ALLOWED_DUNDERS
            ):
                raise ScriptSecurityError(
                    f"Zugriff auf '{attr}' ist in Hook-Scripts nicht erlaubt "
                    f"(Zeile {node.lineno})",
                )
        # Dynamischer Zugriff: getattr(obj, "__class__")
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "getattr"
            and len(node.args) >= 2
            and isinstance(node.args[1], ast.Constant)
            and isinstance(node.args[1].value, str)
        ):
            val = node.args[1].value
            if (
                val.startswith("__")
                and val.endswith("__")
                and val not in _ALLOWED_DUNDERS
            ):
                raise ScriptSecurityError(
                    f"Zugriff auf '{val}' via getattr ist in Hook-Scripts "
                    f"nicht erlaubt (Zeile {node.lineno})",
                )


# ---------------------------------------------------------------------------
# Timeout-Mechanismus
# ---------------------------------------------------------------------------


def _raise_in_thread(thread_id: int, exc_type: type) -> None:
    """Exception in einem anderen Thread auslösen (CPython-spezifisch)."""
    ret = ctypes.pythonapi.PyThreadState_SetAsyncExc(
        ctypes.c_ulong(thread_id),
        ctypes.py_object(exc_type),
    )
    if ret > 1:
        # Fehlschlag — zurücksetzen
        ctypes.pythonapi.PyThreadState_SetAsyncExc(
            ctypes.c_ulong(thread_id), None,
        )


# ---------------------------------------------------------------------------
# HTTP-Helfer (kontrollierter Netzwerkzugriff für Scripts)
# ---------------------------------------------------------------------------


def _safe_http_get(
    url: str, headers: dict | None = None, timeout: int = 10,
) -> dict:
    """HTTP-GET mit erzwungenem Timeout."""
    resp = _httpx.get(
        url, headers=headers or {}, timeout=timeout, follow_redirects=True,
    )
    try:
        j = resp.json()
    except Exception:
        j = None
    return {"status": resp.status_code, "body": resp.text, "json": j}


def _safe_http_post(
    url: str,
    json: Any = None,
    headers: dict | None = None,
    timeout: int = 10,
) -> dict:
    """HTTP-POST mit erzwungenem Timeout."""
    resp = _httpx.post(
        url, json=json, headers=headers or {}, timeout=timeout,
        follow_redirects=True,
    )
    try:
        j = resp.json()
    except Exception:
        j = None
    return {"status": resp.status_code, "body": resp.text, "json": j}


# ---------------------------------------------------------------------------
# Hauptfunktion
# ---------------------------------------------------------------------------


def run_hook_script(
    script: str,
    hook_type: str,
    context: dict,
    timeout: int = SCRIPT_TIMEOUT_SECONDS,
) -> dict:
    """Script ausführen und Ergebnis zurückgeben."""
    result: dict = {}
    logs: list = []

    def _log(msg: Any) -> None:
        line = str(msg)[:MAX_LOG_LINE_LENGTH]
        if len(logs) < MAX_LOG_LINES:
            logs.append(line)

    # print() in den Log umleiten statt auf stdout
    def _print(*args, sep=" ", end="\n", **_kwargs):  # noqa: ANN001
        line = sep.join(str(a) for a in args)[:MAX_LOG_LINE_LENGTH]
        if len(logs) < MAX_LOG_LINES:
            logs.append(line)

    # -- AST-Sicherheitsprüfung vor Ausführung --
    _check_ast_safety(script, f"<{hook_type}_script>")

    # -- Eingeschränkte Builtins --
    safe_builtins = vars(builtins).copy()
    for dangerous in (
        "exec", "eval", "compile", "breakpoint", "exit", "quit",
        "setattr", "delattr",
    ):
        safe_builtins.pop(dangerous, None)

    # getattr mit Dunder-Guard wrappen
    _original_getattr = builtins.getattr

    def _safe_getattr(obj: Any, name: str, *default: Any) -> Any:
        if (
            isinstance(name, str)
            and name.startswith("__")
            and name.endswith("__")
            and name not in _ALLOWED_DUNDERS
        ):
            raise ScriptSecurityError(
                f"Zugriff auf '{name}' ist in Hook-Scripts nicht erlaubt",
            )
        return _original_getattr(obj, name, *default) if default else _original_getattr(obj, name)

    safe_builtins["getattr"] = _safe_getattr

    # -- Import-Beschränkung --
    _original_import = builtins.__import__

    def _restricted_import(name: str, *args: Any, **kwargs: Any) -> Any:
        top = name.split(".")[0]
        if name in _IMPORT_WHITELIST_EXACT:
            return _original_import(name, *args, **kwargs)
        if top not in _IMPORT_WHITELIST:
            raise ImportError(
                f"Import von '{name}' ist in Hook-Scripts nicht erlaubt",
            )
        return _original_import(name, *args, **kwargs)

    safe_builtins["__import__"] = _restricted_import
    safe_builtins["print"] = _print

    namespace: dict[str, Any] = {
        "__builtins__": safe_builtins,
        # Storage-Funktionen
        "load_connections": load_connections,
        "save_connections": save_connections,
        # HTTP-Helfer
        "http_get": _safe_http_get,
        "http_post": _safe_http_post,
        # Hilfsfunktionen
        "uuid4": lambda: str(_uuid.uuid4()),
        "log": _log,
        # Ausgabe
        "result": result,
        "logs": logs,
        # Typ-spezifischer Kontext
        **context,
    }

    # -- Kompilieren & Ausführen mit Timeout --
    compiled = compile(script, f"<{hook_type}_script>", "exec")

    current_thread_id = threading.current_thread().ident
    timed_out = threading.Event()

    def _on_timeout() -> None:
        timed_out.set()
        if current_thread_id is not None:
            _raise_in_thread(current_thread_id, ScriptTimeoutError)

    timer = threading.Timer(timeout, _on_timeout)
    timer.daemon = True
    timer.start()

    try:
        exec(compiled, namespace)  # noqa: S102
    except ScriptTimeoutError:
        logs.append(f"Script abgebrochen: Timeout nach {timeout}s")
        return {"success": False, "result": result, "logs": logs,
                "error": f"Timeout nach {timeout}s"}
    except ScriptSecurityError as exc:
        logs.append(f"Sicherheitsverletzung: {exc}")
        return {"success": False, "result": result, "logs": logs,
                "error": str(exc)}
    finally:
        timer.cancel()

    return {"success": True, "result": result, "logs": logs}

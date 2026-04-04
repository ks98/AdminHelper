"""
Alerter — Webhook + E-Mail Dispatch fuer Monitoring-Alerts.

Wird von check_engine aufgerufen wenn sich ein Check-Status aendert.
Prueft Alert-Rules, Cooldown und versendet Benachrichtigungen.
"""

from __future__ import annotations

import json
import logging
import smtplib
import os
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import httpx
from sqlalchemy.orm import Session

from app.models import MonitorAlertRule, MonitorAlertLog, MonitorCheck, MonitorState

logger = logging.getLogger("monitor.alerter")

# SMTP-Konfiguration aus Umgebungsvariablen
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "srm@localhost")


def process_alert(
    db: Session,
    check: MonitorCheck,
    old_status: str,
    new_status: str,
) -> None:
    """Prueft alle Alert-Rules und versendet passende Benachrichtigungen."""
    if old_status == new_status:
        return

    rules = db.query(MonitorAlertRule).filter(MonitorAlertRule.enabled == True).all()  # noqa: E712

    for rule in rules:
        if not _rule_matches(rule, check):
            continue
        if _is_in_cooldown(db, rule, check):
            logger.debug("Alert-Rule %s fuer Check %s im Cooldown", rule.id, check.id)
            continue

        success, error = _dispatch(rule, check, old_status, new_status)

        log_entry = MonitorAlertLog(
            alert_rule_id=rule.id,
            check_id=check.id,
            old_status=old_status,
            new_status=new_status,
            sent_at=datetime.now(timezone.utc),
            success=success,
            error=error,
        )
        db.add(log_entry)

    db.commit()


def _rule_matches(rule: MonitorAlertRule, check: MonitorCheck) -> bool:
    """Prueft ob eine Alert-Rule auf den Check passt."""
    if rule.match_severity and rule.match_severity != check.severity:
        return False
    if rule.match_server_id and rule.match_server_id != check.server_id:
        return False
    return True


def _is_in_cooldown(db: Session, rule: MonitorAlertRule, check: MonitorCheck) -> bool:
    """Prueft ob fuer diese Rule+Check-Kombination noch Cooldown aktiv ist."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=rule.cooldown_minutes)
    recent = (
        db.query(MonitorAlertLog)
        .filter(
            MonitorAlertLog.alert_rule_id == rule.id,
            MonitorAlertLog.check_id == check.id,
            MonitorAlertLog.sent_at >= cutoff,
            MonitorAlertLog.success == True,  # noqa: E712
        )
        .first()
    )
    return recent is not None


def _dispatch(
    rule: MonitorAlertRule,
    check: MonitorCheck,
    old_status: str,
    new_status: str,
) -> tuple[bool, str | None]:
    """Versendet die Benachrichtigung ueber den konfigurierten Kanal."""
    try:
        config = json.loads(rule.channel_config) if rule.channel_config else {}
    except (json.JSONDecodeError, TypeError):
        return False, "Ungueltige channel_config"

    if rule.channel == "webhook":
        return _send_webhook(config, rule, check, old_status, new_status)
    elif rule.channel == "email":
        return _send_email(config, rule, check, old_status, new_status)
    else:
        return False, f"Unbekannter Kanal: {rule.channel}"


def _build_message(check: MonitorCheck, old_status: str, new_status: str) -> dict:
    """Baut die Alert-Nachricht als dict."""
    status_icons = {
        "ok": "✅", "warning": "⚠️", "critical": "🔴", "unknown": "❓",
    }
    return {
        "check_name": check.name,
        "check_type": check.check_type,
        "server_id": check.server_id,
        "severity": check.severity,
        "old_status": old_status,
        "new_status": new_status,
        "icon": status_icons.get(new_status, ""),
        "subject": f"[SRM Monitor] {check.name}: {old_status} → {new_status}",
        "text": (
            f"Check: {check.name} ({check.check_type})\n"
            f"Status: {old_status} → {new_status}\n"
            f"Severity: {check.severity}"
        ),
    }


def _send_webhook(
    config: dict,
    rule: MonitorAlertRule,
    check: MonitorCheck,
    old_status: str,
    new_status: str,
) -> tuple[bool, str | None]:
    """Sendet Alert an Webhook-URL."""
    url = config.get("url")
    if not url:
        return False, "Keine Webhook-URL konfiguriert"

    msg = _build_message(check, old_status, new_status)
    payload = {
        "alert_rule": rule.name,
        **msg,
    }

    try:
        resp = httpx.post(url, json=payload, timeout=10)
        if resp.status_code < 300:
            logger.info("Webhook gesendet: %s -> %s", check.name, url)
            return True, None
        return False, f"HTTP {resp.status_code}"
    except Exception as exc:
        logger.error("Webhook fehlgeschlagen: %s", exc)
        return False, str(exc)


def _send_email(
    config: dict,
    rule: MonitorAlertRule,
    check: MonitorCheck,
    old_status: str,
    new_status: str,
) -> tuple[bool, str | None]:
    """Sendet Alert per E-Mail."""
    recipients = config.get("recipients", [])
    if isinstance(recipients, str):
        recipients = [r.strip() for r in recipients.split(",") if r.strip()]
    if not recipients:
        return False, "Keine Empfaenger konfiguriert"

    if not SMTP_HOST:
        return False, "SMTP nicht konfiguriert (SMTP_HOST fehlt)"

    msg_data = _build_message(check, old_status, new_status)

    message = MIMEMultipart("alternative")
    message["Subject"] = msg_data["subject"]
    message["From"] = config.get("from", SMTP_FROM)
    message["To"] = ", ".join(recipients)
    message.attach(MIMEText(msg_data["text"], "plain"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            if SMTP_PORT == 587:
                server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(message)
        logger.info("E-Mail gesendet: %s -> %s", check.name, recipients)
        return True, None
    except Exception as exc:
        logger.error("E-Mail fehlgeschlagen: %s", exc)
        return False, str(exc)

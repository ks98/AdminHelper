# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""Schreibt generierte FRP-Configs ins Shared Volume fuer den frps-Container."""

import logging
from pathlib import Path

from app.core.config import FRP_CONFIG_DIR
from app.modules.frp.config_generator import generate_frps_toml

logger = logging.getLogger(__name__)


def write_frps_config(config) -> Path:
    """Schreibt frps.toml ins FRP_CONFIG_DIR. Gibt den Dateipfad zurueck."""
    toml = generate_frps_toml(config)
    path = FRP_CONFIG_DIR / "frps.toml"
    path.write_text(toml, encoding="utf-8")
    logger.info("frps.toml geschrieben: %s", path)
    return path


def remove_frps_config() -> None:
    """Entfernt frps.toml aus dem FRP_CONFIG_DIR."""
    path = FRP_CONFIG_DIR / "frps.toml"
    if path.exists():
        path.unlink()
        logger.info("frps.toml entfernt: %s", path)

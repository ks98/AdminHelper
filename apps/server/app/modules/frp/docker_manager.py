# SPDX-FileCopyrightText: 2026 Kevin Stenzel
#
# SPDX-License-Identifier: GPL-3.0-or-later

"""Writes generated FRP configs into the shared volume for the frps container."""

import logging
import os
from pathlib import Path

from app.core.config import FRP_CONFIG_DIR
from app.modules.frp.config_generator import generate_frps_toml

logger = logging.getLogger(__name__)


def write_frps_config(config) -> Path:
    """Writes frps.toml into FRP_CONFIG_DIR. Returns the file path."""
    toml = generate_frps_toml(config)
    path = FRP_CONFIG_DIR / "frps.toml"
    # frps.toml carries the global auth.token + dashboard password and lives in
    # the volume shared with the internet-facing frps container -> 0600
    # (umask-robust, no brief world-readable window). frps reads it as root.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, toml.encode("utf-8"))
    finally:
        os.close(fd)
    # O_CREAT leaves an existing file's mode unchanged -> enforce it explicitly.
    path.chmod(0o600)
    logger.info("frps.toml geschrieben: %s", path)
    return path


def remove_frps_config() -> None:
    """Removes frps.toml from FRP_CONFIG_DIR."""
    path = FRP_CONFIG_DIR / "frps.toml"
    if path.exists():
        path.unlink()
        logger.info("frps.toml entfernt: %s", path)

"""
SMART Disk Health Checker.

Wertet SMART-Daten aus dem Agent-Report aus (Push-only).
Unterstuetzt ATA (HDD + SSD) und NVMe Protokolle.
Auf VMs ohne smartctl liefert der Agent keinen smart-Key — das ist OK, kein Fehler.
"""

from __future__ import annotations


class SmartHealthChecker:
    """Prueft SMART-Gesundheit aller Festplatten.

    Config-Beispiel:
    {
        "reallocated_warn": 1,
        "reallocated_crit": 10,
        "pending_warn": 1,
        "pending_crit": 5,
        "nvme_spare_warn": 20,
        "nvme_spare_crit": 10,
        "nvme_used_warn": 90,
        "nvme_used_crit": 100,
        "ignore_devices": []
    }
    """

    def run(self, config: dict) -> tuple[str, str, dict | None]:
        return "unknown", "Wartet auf Agent-Daten", None

    def evaluate(self, config: dict, report: dict) -> tuple[str, str, dict | None]:
        smart = report.get("smart")
        if not smart:
            # VM oder smartctl nicht installiert — kein Fehler
            return "ok", "Keine SMART-Daten (VM oder smartctl nicht verfuegbar)", None

        ignore = set(config.get("ignore_devices", []))
        reallocated_warn = config.get("reallocated_warn", 1)
        reallocated_crit = config.get("reallocated_crit", 10)
        pending_warn = config.get("pending_warn", 1)
        pending_crit = config.get("pending_crit", 5)
        nvme_spare_warn = config.get("nvme_spare_warn", 20)
        nvme_spare_crit = config.get("nvme_spare_crit", 10)
        nvme_used_warn = config.get("nvme_used_warn", 90)
        nvme_used_crit = config.get("nvme_used_crit", 100)

        critical_problems = []
        warning_problems = []
        ok_count = 0
        disk_details = []

        for disk in smart:
            device = disk.get("device", "?")
            if device in ignore:
                continue

            model = disk.get("model", "?")
            label = f"{device} ({model})"
            protocol = disk.get("protocol", "ATA")
            category = "ok"

            # Universelle Checks (ATA + NVMe)
            if not disk.get("smart_passed", True):
                critical_problems.append(f"{label}: SMART FAILED")
                category = "critical"

            if disk.get("reported_uncorrect", 0) > 0:
                critical_problems.append(f"{label}: {disk['reported_uncorrect']} reported uncorrectable")
                category = "critical"

            if disk.get("uncorrectable", 0) > 0:
                critical_problems.append(f"{label}: {disk['uncorrectable']} offline uncorrectable")
                category = "critical"

            # ATA-spezifisch (HDD + SSD)
            if protocol == "ATA":
                category = self._check_ata(
                    disk, label, category,
                    critical_problems, warning_problems,
                    reallocated_warn, reallocated_crit,
                    pending_warn, pending_crit,
                )
            # NVMe-spezifisch
            elif protocol == "NVMe":
                category = self._check_nvme(
                    disk, label, category,
                    critical_problems, warning_problems,
                    nvme_spare_warn, nvme_spare_crit,
                    nvme_used_warn, nvme_used_crit,
                )

            if category == "ok":
                ok_count += 1

            disk_details.append({
                "device": device, "model": model,
                "protocol": protocol, "category": category,
                "smart_passed": disk.get("smart_passed", True),
                "temp_c": disk.get("temp_c", 0),
                "power_on_hours": disk.get("power_on_hours", 0),
            })

        metrics = {
            "smart_disks_ok": ok_count,
            "smart_disks_warning": len(warning_problems),
            "smart_disks_critical": len(critical_problems),
        }

        # Per-Disk Metriken
        for disk in smart:
            device = disk.get("device", "?")
            if device in ignore:
                continue
            safe_dev = device.replace("/", "_").lstrip("_")
            if disk.get("temp_c", 0) > 0:
                metrics[f"smart_temp_{safe_dev}"] = disk["temp_c"]
            metrics[f"smart_reallocated_{safe_dev}"] = disk.get("reallocated_sectors", 0)
            metrics[f"smart_pending_{safe_dev}"] = disk.get("pending_sectors", 0)

        metrics["_details"] = {"disks": disk_details}

        if critical_problems:
            msg = "SMART-Probleme: " + ", ".join(critical_problems)
            if warning_problems:
                msg += "; Warnung: " + ", ".join(warning_problems)
            return "critical", msg, metrics

        if warning_problems:
            return "warning", "SMART-Warnungen: " + ", ".join(warning_problems), metrics

        return "ok", f"Alle {ok_count} Disks SMART OK", metrics

    @staticmethod
    def _check_ata(disk, label, category, critical_problems, warning_problems,
                   reallocated_warn, reallocated_crit, pending_warn, pending_crit):
        """Prueft ATA-spezifische SMART-Attribute (HDD + SSD)."""
        # Spin Retry Count — immer kritisch (mechanisches Versagen bei HDDs)
        if disk.get("spin_retry_count", 0) > 0:
            critical_problems.append(f"{label}: spin_retry_count={disk['spin_retry_count']}")
            category = "critical"

        # Reallocated Sectors
        reallocated = disk.get("reallocated_sectors", 0)
        if reallocated >= reallocated_crit:
            critical_problems.append(f"{label}: {reallocated} reallocated sectors")
            category = "critical"
        elif reallocated >= reallocated_warn:
            warning_problems.append(f"{label}: {reallocated} reallocated sectors")
            if category != "critical":
                category = "warning"

        # Reallocation Events
        realloc_events = disk.get("reallocation_events", 0)
        if realloc_events >= reallocated_crit:
            critical_problems.append(f"{label}: {realloc_events} reallocation events")
            category = "critical"
        elif realloc_events >= reallocated_warn:
            warning_problems.append(f"{label}: {realloc_events} reallocation events")
            if category != "critical":
                category = "warning"

        # Pending Sectors
        pending = disk.get("pending_sectors", 0)
        if pending >= pending_crit:
            critical_problems.append(f"{label}: {pending} pending sectors")
            category = "critical"
        elif pending >= pending_warn:
            warning_problems.append(f"{label}: {pending} pending sectors")
            if category != "critical":
                category = "warning"

        # UDMA CRC Errors
        if disk.get("udma_crc_errors", 0) > 0:
            warning_problems.append(f"{label}: {disk['udma_crc_errors']} UDMA CRC errors")
            if category != "critical":
                category = "warning"

        return category

    @staticmethod
    def _check_nvme(disk, label, category, critical_problems, warning_problems,
                    nvme_spare_warn, nvme_spare_crit, nvme_used_warn, nvme_used_crit):
        """Prueft NVMe-spezifische SMART-Attribute."""
        if disk.get("critical_warning", 0) != 0:
            critical_problems.append(f"{label}: NVMe critical_warning={disk['critical_warning']}")
            category = "critical"

        if disk.get("media_errors", 0) > 0:
            critical_problems.append(f"{label}: {disk['media_errors']} media errors")
            category = "critical"

        spare = disk.get("available_spare_pct", 100)
        if spare < nvme_spare_crit:
            critical_problems.append(f"{label}: available_spare {spare}% (<{nvme_spare_crit}%)")
            category = "critical"
        elif spare < nvme_spare_warn:
            warning_problems.append(f"{label}: available_spare {spare}% (<{nvme_spare_warn}%)")
            if category != "critical":
                category = "warning"

        used = disk.get("percentage_used", 0)
        if used >= nvme_used_crit:
            critical_problems.append(f"{label}: {used}% used (>={nvme_used_crit}%)")
            category = "critical"
        elif used >= nvme_used_warn:
            warning_problems.append(f"{label}: {used}% used (>={nvme_used_warn}%)")
            if category != "critical":
                category = "warning"

        return category

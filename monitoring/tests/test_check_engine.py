"""Reine-Logik-Tests fuer die Status-Uebergaenge in app/check_engine.py.

Getestet werden die aus execute_check extrahierten reinen Funktionen
next_fail_count / effective_status / is_suppressed — die consecutive_fails-
Daempfung, ohne DB, Scheduler oder VictoriaMetrics.
"""

from app.check_engine import effective_status, is_suppressed, next_fail_count


class TestNextFailCount:
    def test_ok_resets_to_zero(self):
        assert next_fail_count("ok", 5) == 0

    def test_non_ok_increments(self):
        assert next_fail_count("critical", 0) == 1
        assert next_fail_count("critical", 2) == 3

    def test_warning_also_increments(self):
        assert next_fail_count("warning", 1) == 2

    def test_unknown_also_increments(self):
        assert next_fail_count("unknown", 0) == 1


class TestIsSuppressed:
    def test_ok_never_suppressed(self):
        assert is_suppressed("ok", 0, 3) is False

    def test_below_threshold_suppressed(self):
        assert is_suppressed("critical", 1, 3) is True
        assert is_suppressed("critical", 2, 3) is True

    def test_at_threshold_not_suppressed(self):
        assert is_suppressed("critical", 3, 3) is False

    def test_above_threshold_not_suppressed(self):
        assert is_suppressed("critical", 4, 3) is False

    def test_threshold_one_fires_immediately(self):
        assert is_suppressed("critical", 1, 1) is False


class TestEffectiveStatus:
    def test_ok_passes_through(self):
        assert effective_status("ok", 0, 3, "critical") == "ok"

    def test_suppressed_keeps_old_status(self):
        # 1. Fehlschlag bei Schwelle 3 -> bleibt beim alten OK.
        assert effective_status("critical", 1, 3, "ok") == "ok"

    def test_suppressed_pending_treated_as_ok(self):
        # Frischer Check (old_status 'pending') wird waehrend Daempfung 'ok'.
        assert effective_status("critical", 1, 3, "pending") == "ok"

    def test_threshold_reached_uses_result(self):
        assert effective_status("critical", 3, 3, "ok") == "critical"

    def test_suppressed_keeps_prior_failure_status(self):
        # War es schon 'warning', bleibt es bei erneutem (gedaempftem)
        # Fehlschlag 'warning' — nicht 'critical'.
        assert effective_status("critical", 1, 3, "warning") == "warning"

    def test_recovery_when_ok(self):
        # Nach Fehlern wieder OK: next_fail_count ist 0, Status wird OK.
        assert effective_status("ok", 0, 3, "critical") == "ok"


class TestTransitionSequence:
    """End-to-end-Folge der reinen Logik ueber mehrere Check-Laeufe
    (consecutive_fails = 3), wie execute_check sie verkettet."""

    def test_three_fails_then_recover(self):
        consecutive = 3
        old = "ok"
        prev_fails = 0

        # Lauf 1: 1. Fehler -> gedaempft, bleibt ok
        prev_fails = next_fail_count("critical", prev_fails)
        eff = effective_status("critical", prev_fails, consecutive, old)
        assert (prev_fails, eff) == (1, "ok")
        old = eff

        # Lauf 2: 2. Fehler -> weiter gedaempft
        prev_fails = next_fail_count("critical", prev_fails)
        eff = effective_status("critical", prev_fails, consecutive, old)
        assert (prev_fails, eff) == (2, "ok")
        old = eff

        # Lauf 3: 3. Fehler -> Schwelle erreicht, jetzt critical
        prev_fails = next_fail_count("critical", prev_fails)
        eff = effective_status("critical", prev_fails, consecutive, old)
        assert (prev_fails, eff) == (3, "critical")
        old = eff

        # Lauf 4: wieder ok -> Reset und Recovery
        prev_fails = next_fail_count("ok", prev_fails)
        eff = effective_status("ok", prev_fails, consecutive, old)
        assert (prev_fails, eff) == (0, "ok")

"""Reine-Logik-Tests fuer app/alerter.py.

Getestet ohne echte DB: Rule-Filter (_rule_matches), Cooldown-Zeitfenster
(_is_in_cooldown ueber einen Fake-Query) und die Garantie, dass Recovery
(new_status == 'ok') den Cooldown umgeht (process_alert).
"""

from types import SimpleNamespace

from app import alerter
from app.alerter import _is_in_cooldown, _rule_matches, process_alert


def make_rule(**kw):
    """Minimaler MonitorAlertRule-Stub mit den von der Logik gelesenen Feldern."""
    defaults = dict(
        id="rule-1",
        name="r",
        match_severity=None,
        match_server_id=None,
        channel="webhook",
        channel_config="{}",
        cooldown_minutes=30,
        enabled=True,
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def make_check(**kw):
    """Minimaler MonitorCheck-Stub."""
    defaults = dict(
        id="check-1",
        name="c",
        check_type="ping",
        server_id="srv-1",
        severity="critical",
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


class TestRuleMatches:
    def test_no_filters_matches_any(self):
        assert _rule_matches(make_rule(), make_check()) is True

    def test_severity_match(self):
        rule = make_rule(match_severity="critical")
        assert _rule_matches(rule, make_check(severity="critical")) is True

    def test_severity_mismatch(self):
        rule = make_rule(match_severity="warning")
        assert _rule_matches(rule, make_check(severity="critical")) is False

    def test_server_id_match(self):
        rule = make_rule(match_server_id="srv-1")
        assert _rule_matches(rule, make_check(server_id="srv-1")) is True

    def test_server_id_mismatch(self):
        rule = make_rule(match_server_id="srv-9")
        assert _rule_matches(rule, make_check(server_id="srv-1")) is False

    def test_both_filters_must_match(self):
        rule = make_rule(match_severity="critical", match_server_id="srv-1")
        assert _rule_matches(rule, make_check(severity="critical", server_id="srv-1")) is True
        assert _rule_matches(rule, make_check(severity="critical", server_id="srv-2")) is False


class _FakeFirstQuery:
    """Imitiert db.query(...).filter(...).first() und merkt sich nur das
    konfigurierte Ergebnis. filter() kann beliebig oft gekettet werden."""

    def __init__(self, first_result):
        self._first = first_result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._first


class _FakeDb:
    def __init__(self, first_result=None):
        self._first_result = first_result

    def query(self, *args, **kwargs):
        return _FakeFirstQuery(self._first_result)


class TestIsInCooldown:
    def test_recent_success_means_in_cooldown(self):
        # Ein vorhandener (recenter) Erfolgs-Log-Eintrag -> Cooldown aktiv.
        recent_log = object()
        db = _FakeDb(first_result=recent_log)
        assert _is_in_cooldown(db, make_rule(cooldown_minutes=30), make_check()) is True

    def test_no_recent_log_means_no_cooldown(self):
        db = _FakeDb(first_result=None)
        assert _is_in_cooldown(db, make_rule(cooldown_minutes=30), make_check()) is False


class _CapturingDb:
    """Fake-DB fuer process_alert: liefert die Rules-Liste, sammelt add()
    und commit()-Aufrufe."""

    def __init__(self, rules):
        self._rules = rules
        self.added = []
        self.committed = False

    def query(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self._rules

    def add(self, entry):
        self.added.append(entry)

    def commit(self):
        self.committed = True


class TestRecoveryBypassesCooldown:
    def test_recovery_dispatches_even_when_cooldown_active(self, monkeypatch):
        rule = make_rule()
        check = make_check()
        db = _CapturingDb([rule])

        # Cooldown waere aktiv — darf bei Recovery NICHT abfragen/blocken.
        cooldown_calls = {"n": 0}

        def fake_cooldown(*a, **k):
            cooldown_calls["n"] += 1
            return True

        dispatched = {"n": 0}

        def fake_dispatch(*a, **k):
            dispatched["n"] += 1
            return True, None

        monkeypatch.setattr(alerter, "_is_in_cooldown", fake_cooldown)
        monkeypatch.setattr(alerter, "_dispatch", fake_dispatch)

        # old != new und new == "ok" -> Recovery
        process_alert(db, check, old_status="critical", new_status="ok")

        assert dispatched["n"] == 1, "Recovery muss dispatchen"
        assert cooldown_calls["n"] == 0, "Recovery darf Cooldown gar nicht pruefen"
        assert len(db.added) == 1
        assert db.committed is True

    def test_non_recovery_blocked_by_cooldown(self, monkeypatch):
        rule = make_rule()
        check = make_check()
        db = _CapturingDb([rule])

        monkeypatch.setattr(alerter, "_is_in_cooldown", lambda *a, **k: True)

        dispatched = {"n": 0}
        monkeypatch.setattr(
            alerter, "_dispatch", lambda *a, **k: dispatched.__setitem__("n", dispatched["n"] + 1) or (True, None)
        )

        # Status-Verschlechterung im Cooldown -> kein Dispatch, kein Log.
        process_alert(db, check, old_status="ok", new_status="critical")

        assert dispatched["n"] == 0
        assert len(db.added) == 0
        assert db.committed is True  # commit() laeuft trotzdem (am Ende)

    def test_no_change_returns_early(self, monkeypatch):
        db = _CapturingDb([make_rule()])
        # old == new -> sofortiger return, keine Query/kein commit.
        process_alert(db, make_check(), old_status="ok", new_status="ok")
        assert db.added == []
        assert db.committed is False

"""Test-Setup fuer die monitoring-Komponente.

Bewusst KEIN Postgres/testcontainers: hier laufen nur reine-Logik-Tests
(Line-Protocol-Escaping, Alert-Filter/Cooldown, Check-Status-Uebergaenge).
Die getesteten Module ziehen ueber app.core.config einen schreibbaren
DATA_DIR (legt dort ggf. einen .api_key an) — daher vor jedem Import auf
ein tmp-Verzeichnis umbiegen.
"""

import os
import tempfile

os.environ.setdefault("DATA_DIR", os.path.join(tempfile.gettempdir(), "adminhelper-monitor-test"))

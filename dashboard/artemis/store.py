"""Event log (SQLite).

Every alarm is stored with timestamp, location, defect type, confidence,
vibration and the raw sensor readings, plus a JPEG snapshot of the frame.
"""

import csv
import io
import sqlite3
import threading
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           REAL NOT NULL,
    chainage_km  REAL,
    lat          REAL,
    lon          REAL,
    code         TEXT NOT NULL,
    message      TEXT NOT NULL,
    severity     TEXT NOT NULL,
    label        TEXT,
    confidence   REAL,
    vibration    REAL,
    distance_cm  REAL,
    ir           INTEGER,
    ax REAL, ay REAL, az REAL,
    gx REAL, gy REAL, gz REAL,
    snapshot     TEXT,
    acknowledged INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
"""

COLUMNS = [
    "id", "ts", "chainage_km", "lat", "lon", "code", "message", "severity", "label",
    "confidence", "vibration", "distance_cm", "ir", "ax", "ay", "az", "gx", "gy", "gz",
    "snapshot", "acknowledged",
]

SEVERITY_WEIGHT = {"WARNING": 1, "DANGER": 3}


class EventStore:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(str(path), check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(SCHEMA)
        self._lock = threading.Lock()

    def add(self, event: dict) -> int:
        cols = [c for c in COLUMNS if c != "id" and c in event]
        with self._lock:
            cur = self._db.execute(
                f"INSERT INTO events ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
                [event[c] for c in cols],
            )
            self._db.commit()
            return cur.lastrowid

    def list(self, since: float = 0, severity: str | None = None, code: str | None = None,
             limit: int = 200) -> list[dict]:
        sql, args = "SELECT * FROM events WHERE ts >= ?", [since]
        if severity:
            sql += " AND severity = ?"
            args.append(severity)
        if code:
            sql += " AND code = ?"
            args.append(code)
        sql += " ORDER BY ts DESC LIMIT ?"
        args.append(limit)
        with self._lock:
            return [dict(r) for r in self._db.execute(sql, args)]

    def acknowledge(self, event_id: int | None = None) -> None:
        with self._lock:
            if event_id is None:
                self._db.execute("UPDATE events SET acknowledged = 1")
            else:
                self._db.execute("UPDATE events SET acknowledged = 1 WHERE id = ?", (event_id,))
            self._db.commit()

    def summary(self, since: float, bucket_s: int, segment_m: float) -> dict:
        with self._lock:
            by_code = {
                r["code"]: r["n"]
                for r in self._db.execute(
                    "SELECT code, COUNT(*) n FROM events WHERE ts >= ? GROUP BY code", (since,))
            }
            by_severity = {
                r["severity"]: r["n"]
                for r in self._db.execute(
                    "SELECT severity, COUNT(*) n FROM events WHERE ts >= ? GROUP BY severity", (since,))
            }
            unacked = self._db.execute(
                "SELECT COUNT(*) FROM events WHERE ts >= ? AND acknowledged = 0", (since,)).fetchone()[0]
            trend = [
                dict(r) for r in self._db.execute(
                    "SELECT CAST(ts / ? AS INTEGER) * ? AS bucket, code, COUNT(*) n "
                    "FROM events WHERE ts >= ? GROUP BY bucket, code ORDER BY bucket",
                    (bucket_s, bucket_s, since))
            ]
            seg_km = segment_m / 1000
            segments = [
                dict(r) for r in self._db.execute(
                    "SELECT CAST(chainage_km / ? AS INTEGER) AS seg, COUNT(*) n, "
                    "SUM(CASE severity WHEN 'DANGER' THEN 3 ELSE 1 END) score, "
                    "SUM(severity = 'DANGER') danger, GROUP_CONCAT(DISTINCT code) codes, "
                    "MAX(ts) last_ts, MAX(vibration) max_vibration "
                    "FROM events WHERE ts >= ? AND chainage_km IS NOT NULL "
                    "GROUP BY seg ORDER BY score DESC, last_ts DESC LIMIT 10",
                    (seg_km, since))
            ]
        for s in segments:
            s["start_km"] = round(s["seg"] * seg_km, 3)
            s["end_km"] = round((s["seg"] + 1) * seg_km, 3)
            s["codes"] = sorted(set((s["codes"] or "").split(",")))
            s["priority"] = "P1" if s["danger"] or s["score"] >= 6 else "P2" if s["score"] >= 3 else "P3"
        return {
            "by_code": by_code,
            "by_severity": by_severity,
            "unacknowledged": unacked,
            "trend": trend,
            "bucket_s": bucket_s,
            "segments": segments,
        }

    def to_csv(self, since: float = 0) -> str:
        rows = self.list(since=since, limit=1_000_000)
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
        return buf.getvalue()

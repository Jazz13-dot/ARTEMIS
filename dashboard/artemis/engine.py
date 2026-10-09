"""Main monitoring loop.

Camera -> YOLOv8 -> + Arduino sensors -> fusion decision -> buzzer command
                                                         -> event log
                                                         -> live dashboard state
"""

import collections
import math
import threading
import time

from .config import Config
from .fusion import COMMAND, SEVERITY_RANK, decide
from .sensors import NullSensorLink, SerialSensorLink
from .store import EventStore
from .vision import VisionResult

HISTORY_S = 120   # seconds of live telemetry kept for the charts
VIB_WINDOW_S = 0.5


class Engine:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.th = cfg.thresholds
        self.store = EventStore(cfg.db_path)
        cfg.snapshot_dir.mkdir(parents=True, exist_ok=True)
        self.model_error: str | None = None

        if cfg.simulate:
            from .simulator import Simulator

            sim = Simulator()
            self.camera = self.sensors = self.analyzer = sim
            self.mode = "simulation"
        else:
            from .vision import Camera, YoloAnalyzer

            self.mode = "live"
            self.camera = Camera(cfg.camera)
            self.sensors = SerialSensorLink(cfg.serial_port, cfg.baud) if cfg.serial_port else NullSensorLink()
            try:
                self.analyzer = YoloAnalyzer(cfg.model_path)
            except Exception as exc:  # missing/placeholder weights: keep sensors + video running
                self.analyzer = None
                self.model_error = f"{type(exc).__name__}: {exc}"

        self.started_at = time.time()
        self._lock = threading.Lock()
        self._jpeg: bytes | None = None
        self._frame_id = 0
        self._acc_window = collections.deque()
        self._history = collections.deque()
        self._last_logged: dict[str, float] = {}
        self._last_command = ""
        self._chainage_km = 0.0
        self._last_tick = time.time()
        self._fps = 0.0
        self._last_loop = time.time()
        self.state: dict = {}
        threading.Thread(target=self._run, daemon=True, name="engine").start()

    # ------------------------------------------------------------------
    def _vibration(self, reading, now: float) -> float:
        """Std-dev of |acc| (g) over the last VIB_WINDOW_S seconds."""
        if reading is None:
            return 0.0
        self._acc_window.append((now, math.sqrt(sum(a * a for a in reading.acc))))
        while self._acc_window and now - self._acc_window[0][0] > VIB_WINDOW_S:
            self._acc_window.popleft()
        mags = [m for _, m in self._acc_window]
        if len(mags) < 2:
            return 0.0
        mean = sum(mags) / len(mags)
        return math.sqrt(sum((m - mean) ** 2 for m in mags) / len(mags))

    def _run(self) -> None:
        import cv2

        while True:
            loop_start = time.time()
            frame = self.camera.read()
            if frame is None:
                time.sleep(0.05)
                frame_ok = False
            else:
                frame_ok = True

            vision = VisionResult(label="unavailable", confidence=0.0)
            if frame_ok and self.analyzer is not None:
                try:
                    vision = self.analyzer.analyze(frame)
                except Exception as exc:
                    self.model_error = f"{type(exc).__name__}: {exc}"

            now = time.time()
            dt, self._last_tick = now - self._last_tick, now
            self._chainage_km = (self._chainage_km + self.cfg.speed_kmh * dt / 3600) % self.cfg.route_length_km

            reading = self.sensors.latest()
            if reading is not None and now - reading.t > 2.0 and not self.cfg.simulate:
                reading = None  # stale: board unplugged
            vibration = self._vibration(reading, now)
            decision = decide(
                vision.label, vision.confidence, vibration,
                reading.distance_cm if reading else None,
                reading.ir if reading else False, self.th,
            )

            command = COMMAND[decision.status]
            buzzer_cmd = "B" if self.th.buzzer_enabled else "b"
            if command + buzzer_cmd != self._last_command:
                self.sensors.send(buzzer_cmd + command)
                self._last_command = command + buzzer_cmd

            jpeg = None
            if frame_ok:
                for x1, y1, x2, y2, name, conf in vision.boxes:
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    cv2.putText(frame, f"{name} {conf:.2f}", (x1, max(14, y1 - 6)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
                ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                jpeg = buf.tobytes() if ok else None

            self._log_events(decision, vision, vibration, reading, jpeg, now)

            sample = {
                "t": round(now, 2),
                "vibration": round(vibration, 4),
                "distance_cm": reading.distance_cm if reading else None,
                "acc": list(reading.acc) if reading else None,
                "gyro": list(reading.gyro) if reading else None,
                "confidence": round(vision.confidence, 3),
                "status": decision.status,
            }
            interval = max(1e-3, loop_start - self._last_loop)
            self._last_loop = loop_start
            self._fps = 0.9 * self._fps + 0.1 * (1 / interval) if self._fps else 1 / interval

            with self._lock:
                if jpeg is not None:
                    self._jpeg = jpeg
                    self._frame_id += 1
                self._history.append(sample)
                while self._history and now - self._history[0]["t"] > HISTORY_S:
                    self._history.popleft()
                self.state = {
                    "t": now,
                    "mode": self.mode,
                    "route": self.cfg.route_name,
                    "route_length_km": self.cfg.route_length_km,
                    "uptime_s": round(now - self.started_at),
                    "chainage_km": round(self._chainage_km, 3),
                    "speed_kmh": self.cfg.speed_kmh,
                    "status": decision.status,
                    "headline": decision.headline,
                    "alarms": [a.__dict__ for a in decision.alarms],
                    "buzzer": decision.status != "SAFE" and self.th.buzzer_enabled,
                    "vision": {
                        "label": vision.label,
                        "confidence": round(vision.confidence, 3),
                        "inference_ms": round(vision.inference_ms, 1),
                        "boxes": len(vision.boxes),
                    },
                    "sensors": None if reading is None else {
                        "distance_cm": reading.distance_cm,
                        "ir": reading.ir,
                        "acc": list(reading.acc),
                        "gyro": list(reading.gyro),
                        "vibration": round(vibration, 4),
                    },
                    "health": {
                        "arduino": self.sensors.connected,
                        "serial_port": getattr(self.sensors, "port", None),
                        "camera": frame_ok,
                        "model": self.analyzer is not None,
                        "model_error": self.model_error,
                        "fps": round(self._fps, 1),
                    },
                    "thresholds": self.th.to_dict(),
                }

            time.sleep(max(0.0, 1 / 15 - (time.time() - loop_start)))  # cap at ~15 fps

    def _log_events(self, decision, vision, vibration, reading, jpeg, now) -> list[int]:
        ids = []
        for alarm in decision.alarms:
            if now - self._last_logged.get(alarm.code, 0) < self.th.event_cooldown_s:
                self._last_logged[alarm.code] = now  # still the same ongoing condition
                continue
            self._last_logged[alarm.code] = now
            snapshot = None
            if jpeg is not None:
                snapshot = f"{int(now * 1000)}_{alarm.code}.jpg"
                (self.cfg.snapshot_dir / snapshot).write_bytes(jpeg)
            ids.append(self.store.add({
                "ts": now,
                "chainage_km": round(self._chainage_km, 3),
                "lat": None,
                "lon": None,
                "code": alarm.code,
                "message": alarm.message,
                "severity": alarm.severity,
                "label": vision.label,
                "confidence": round(vision.confidence, 3),
                "vibration": round(vibration, 4),
                "distance_cm": reading.distance_cm if reading else None,
                "ir": int(reading.ir) if reading else None,
                "ax": reading.acc[0] if reading else None,
                "ay": reading.acc[1] if reading else None,
                "az": reading.acc[2] if reading else None,
                "gx": reading.gyro[0] if reading else None,
                "gy": reading.gyro[1] if reading else None,
                "gz": reading.gyro[2] if reading else None,
                "snapshot": snapshot,
            }))
        return ids

    # ------------------------------------------------------------------
    def snapshot_state(self) -> dict:
        with self._lock:
            return dict(self.state)

    def history(self) -> list[dict]:
        with self._lock:
            return list(self._history)

    def frame(self) -> tuple[int, bytes | None]:
        with self._lock:
            return self._frame_id, self._jpeg


__all__ = ["Engine", "SEVERITY_RANK"]

"""Runtime configuration for the ARTEMIS dashboard.

Hardware settings (serial port, camera, model) are fixed at start-up.
Detection thresholds live in `Thresholds` and can be changed live from the
dashboard's settings panel.
"""

from dataclasses import dataclass, field, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@dataclass
class Thresholds:
    # YOLO result is ignored below this confidence (description: ~0.4)
    confidence: float = 0.40
    # Vibration index (g, std-dev of |acc| over ~0.5 s) above which we warn
    vibration_warn: float = 0.25
    # Vibration index above which a crack is escalated to DANGER
    vibration_danger: float = 0.45
    # Ultrasonic distance (cm) at or below which an obstacle is reported
    obstacle_cm: float = 60.0
    # Seconds before the same alarm reason is logged again
    event_cooldown_s: float = 4.0
    # Buzzer on the Arduino follows alarms unless muted from the dashboard
    buzzer_enabled: bool = True

    def update(self, data: dict) -> None:
        for key, value in data.items():
            if not hasattr(self, key):
                continue
            current = getattr(self, key)
            setattr(self, key, bool(value) if isinstance(current, bool) else float(value))

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Config:
    serial_port: str | None = None          # e.g. "COM3" or "/dev/ttyUSB0"
    baud: int = 115200
    camera: int | str = 0                   # webcam index or video file / RTSP URL
    model_path: Path = ROOT / "model" / "best.pt"
    simulate: bool = False                  # synthetic camera + sensors + AI
    route_name: str = "Nilgiri Mountain Railway"
    route_length_km: float = 46.0           # Mettupalayam -> Udhagamandalam
    speed_kmh: float = 12.0                 # used to estimate chainage until GPS is fitted
    segment_m: float = 200.0                # bin size for maintenance priority
    db_path: Path = ROOT / "detections" / "artemis.db"
    snapshot_dir: Path = ROOT / "detections" / "snapshots"
    thresholds: Thresholds = field(default_factory=Thresholds)

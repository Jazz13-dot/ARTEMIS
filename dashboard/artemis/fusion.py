"""Sensor-fusion decision logic.

Combines the YOLO result with the MPU6050, ultrasonic and IR readings and
returns the track status plus the reason(s) for any alarm, so the operator
sees *why* the buzzer is sounding, not just that it is.
"""

from dataclasses import dataclass, field

from .config import Thresholds

SAFE, WARNING, DANGER = "SAFE", "WARNING", "DANGER"
SEVERITY_RANK = {SAFE: 0, WARNING: 1, DANGER: 2}
COMMAND = {SAFE: "G", WARNING: "Y", DANGER: "R"}


@dataclass
class Alarm:
    code: str        # crack | vegetation | vibration | obstacle | ir | <other model class>
    message: str     # text shown to the operator, e.g. "CRACK DETECTED"
    severity: str    # WARNING | DANGER


@dataclass
class Decision:
    status: str = SAFE
    alarms: list[Alarm] = field(default_factory=list)

    @property
    def headline(self) -> str:
        return self.alarms[0].message if self.alarms else "DEFECTLESS"


def decide(label: str, confidence: float, vibration: float, distance_cm: float | None,
           ir: bool, th: Thresholds) -> Decision:
    alarms: list[Alarm] = []
    high_vibration = vibration >= th.vibration_warn
    visual = label if confidence >= th.confidence else "defectless"

    if visual == "crack":
        severe = vibration >= th.vibration_danger
        alarms.append(Alarm("crack", "CRACK DETECTED", DANGER if severe else WARNING))
    elif visual == "vegetation":
        alarms.append(Alarm("vegetation", "VEGETATION ON TRACK", WARNING))
    elif visual not in ("defectless", "normal", "good", "ok", "unavailable"):
        # future model classes (broken component, deformation, ...) are surfaced as-is
        alarms.append(Alarm(visual, f"{visual.upper()} DETECTED", WARNING))

    if distance_cm is not None and distance_cm <= th.obstacle_cm:
        alarms.append(Alarm("obstacle", "OBSTACLE DETECTED", DANGER))
    if ir:
        alarms.append(Alarm("ir", "IR SENSOR TRIGGERED", WARNING))
    if high_vibration:
        severe = vibration >= th.vibration_danger
        alarms.append(Alarm("vibration", "HIGHER VIBRATION", DANGER if severe else WARNING))

    alarms.sort(key=lambda a: -SEVERITY_RANK[a.severity])
    status = alarms[0].severity if alarms else SAFE
    return Decision(status, alarms)

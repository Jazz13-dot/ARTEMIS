"""Arduino Nano sensor link.

Serial protocol (115200 baud, newline-terminated ASCII), see
firmware/artemis_nano/artemis_nano.ino:

  Arduino -> PC   S,<dist_cm>,<ir>,<ax>,<ay>,<az>,<gx>,<gy>,<gz>
                  dist_cm  ultrasonic distance in cm, -1 when no echo
                  ir       1 when the IR sensor is triggered, else 0
                  ax..az   MPU6050 acceleration in g
                  gx..gz   MPU6050 angular rate in deg/s

  PC -> Arduino   G / Y / R   track status SAFE / WARNING / DANGER
                  B / b       buzzer enabled / muted
"""

import threading
import time
from dataclasses import dataclass, field


@dataclass
class SensorReading:
    distance_cm: float | None = None
    ir: bool = False
    acc: tuple[float, float, float] = (0.0, 0.0, 1.0)
    gyro: tuple[float, float, float] = (0.0, 0.0, 0.0)
    t: float = field(default_factory=time.time)


def parse_line(line: str) -> SensorReading | None:
    parts = line.strip().split(",")
    if len(parts) != 9 or parts[0] != "S":
        return None
    try:
        values = [float(p) for p in parts[1:]]
    except ValueError:
        return None
    dist = values[0]
    return SensorReading(
        distance_cm=None if dist < 0 else dist,
        ir=values[1] >= 0.5,
        acc=(values[2], values[3], values[4]),
        gyro=(values[5], values[6], values[7]),
    )


class SerialSensorLink:
    """Reads sensor frames from the Arduino on a background thread."""

    def __init__(self, port: str, baud: int):
        self.port = port
        self.baud = baud
        self._serial = None
        self._latest: SensorReading | None = None
        self._lock = threading.Lock()
        self._last_rx = 0.0
        self._stop = threading.Event()
        threading.Thread(target=self._run, daemon=True, name="serial").start()

    @property
    def connected(self) -> bool:
        return self._serial is not None and time.time() - self._last_rx < 2.0

    def latest(self) -> SensorReading | None:
        with self._lock:
            return self._latest

    def send(self, command: str) -> None:
        if self._serial is None:
            return
        try:
            self._serial.write(command.encode())
        except Exception:
            self._close()

    def _open(self) -> None:
        import serial  # pyserial

        self._serial = serial.Serial(self.port, self.baud, timeout=0.2)
        time.sleep(2)  # Nano resets when the port opens

    def _close(self) -> None:
        try:
            if self._serial is not None:
                self._serial.close()
        finally:
            self._serial = None

    def _run(self) -> None:
        while not self._stop.is_set():
            if self._serial is None:
                try:
                    self._open()
                except Exception:
                    time.sleep(2)  # keep retrying so the board can be plugged in later
                    continue
            try:
                raw = self._serial.readline()
            except Exception:
                self._close()
                continue
            reading = parse_line(raw.decode(errors="ignore"))
            if reading is not None:
                with self._lock:
                    self._latest = reading
                self._last_rx = time.time()

    def close(self) -> None:
        self._stop.set()
        self._close()


class NullSensorLink:
    """Used when no serial port is configured: camera + AI only."""

    connected = False
    port = None

    def latest(self) -> SensorReading | None:
        return None

    def send(self, command: str) -> None:
        pass

    def close(self) -> None:
        pass

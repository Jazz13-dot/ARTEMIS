"""Synthetic camera, sensors and AI for demos and development.

Runs scripted "episodes" (normal track, crack, vegetation, rough section,
obstacle) so every part of the dashboard can be exercised without the
Arduino, a webcam or trained weights.
"""

import math
import random
import time

import numpy as np

from .sensors import SensorReading
from .vision import VisionResult

EPISODES = [
    # kind, weight, (min_s, max_s)
    ("normal", 6, (6, 12)),
    ("crack", 2, (3, 5)),
    ("crack_rough", 1, (3, 5)),
    ("vegetation", 2, (3, 6)),
    ("rough", 1, (2, 4)),
    ("obstacle", 1, (3, 5)),
]

W, H = 960, 540


class Simulator:
    connected = True
    port = "SIMULATED"
    loaded = True

    def __init__(self, seed: int | None = None):
        import cv2

        self._cv2 = cv2
        self._rng = random.Random(seed)
        self._episode = "normal"
        self._episode_end = time.time() + 4
        self._offset = 0.0
        self._last = time.time()
        self._features = self._new_features()

    # ---- scenario -------------------------------------------------------
    def _tick(self) -> None:
        now = time.time()
        self._offset = (self._offset + (now - self._last) * 260) % 120
        self._last = now
        if now >= self._episode_end:
            kinds, weights = zip(*[(k, w) for k, w, _ in EPISODES])
            self._episode = self._rng.choices(kinds, weights)[0]
            lo, hi = next(r for k, _, r in EPISODES if k == self._episode)
            self._episode_end = now + self._rng.uniform(lo, hi)
            self._features = self._new_features()

    def _new_features(self) -> dict:
        r = self._rng
        return {
            "crack_x": r.choice([W * 0.33, W * 0.67]) + r.uniform(-8, 8),
            "crack_pts": [r.uniform(-14, 14) for _ in range(9)],
            "leaves": [(r.uniform(0.15, 0.85) * W, r.uniform(0.2, 0.9) * H, r.uniform(18, 46)) for _ in range(14)],
            "conf": r.uniform(0.72, 0.98),
        }

    @property
    def episode(self) -> str:
        return self._episode

    # ---- camera ---------------------------------------------------------
    def read(self):
        self._tick()
        cv2 = self._cv2
        img = np.full((H, W, 3), (92, 98, 104), np.uint8)
        noise = np.random.default_rng(int(self._offset * 10)).integers(0, 28, (H // 6, W // 6, 1), dtype=np.uint8)
        img = cv2.add(img, cv2.resize(np.repeat(noise, 3, 2), (W, H), interpolation=cv2.INTER_NEAREST))
        for y in range(-120, H + 120, 120):  # sleepers
            yy = int(y + self._offset)
            cv2.rectangle(img, (int(W * 0.18), yy), (int(W * 0.82), yy + 34), (58, 72, 88), -1)
        for x in (W * 0.33, W * 0.67):  # rails
            cv2.rectangle(img, (int(x) - 18, 0), (int(x) + 18, H), (150, 152, 156), -1)
            cv2.rectangle(img, (int(x) - 6, 0), (int(x) + 6, H), (190, 192, 196), -1)

        f = self._features
        if self._episode.startswith("crack"):
            pts = [(int(f["crack_x"] + dx), int(H * 0.3 + i * 22)) for i, dx in enumerate(f["crack_pts"])]
            cv2.polylines(img, [np.array(pts)], False, (20, 20, 24), 4)
        elif self._episode == "vegetation":
            for x, y, r in f["leaves"]:
                cv2.circle(img, (int(x), int((y + self._offset * 2) % H)), int(r), (40, 120, 50), -1)
        elif self._episode == "obstacle":
            cv2.rectangle(img, (int(W * 0.42), int(H * 0.35)), (int(W * 0.6), int(H * 0.62)), (40, 70, 140), -1)
        return img

    # ---- AI -------------------------------------------------------------
    def analyze(self, frame) -> VisionResult:
        jitter = self._rng.uniform(-0.04, 0.02)
        if self._episode.startswith("crack"):
            return VisionResult("crack", min(0.99, self._features["conf"] + jitter), inference_ms=self._rng.uniform(18, 26))
        if self._episode == "vegetation":
            return VisionResult("vegetation", min(0.99, self._features["conf"] + jitter), inference_ms=self._rng.uniform(18, 26))
        return VisionResult("defectless", self._rng.uniform(0.9, 0.99), inference_ms=self._rng.uniform(18, 26))

    # ---- sensors --------------------------------------------------------
    def latest(self) -> SensorReading:
        self._tick()
        g = self._rng.gauss
        rough = self._episode in ("rough", "crack_rough")
        amp = 0.55 if rough else 0.06
        t = time.time()
        acc = (
            g(0, amp * 0.5),
            g(0, amp * 0.5),
            1.0 + g(0, amp) + (0.4 * math.sin(t * 40) if rough else 0.0),
        )
        gyro = tuple(g(0, 25 if rough else 1.5) for _ in range(3))
        if self._episode == "obstacle":
            remaining = max(0.0, self._episode_end - t)
            distance = 25 + remaining * 15 + g(0, 2)
        else:
            distance = 300 + g(0, 15)  # nothing in range: far reading
        return SensorReading(
            distance_cm=round(distance, 1),
            ir=self._episode == "obstacle",
            acc=tuple(round(v, 3) for v in acc),
            gyro=tuple(round(v, 2) for v in gyro),
        )

    def send(self, command: str) -> None:
        pass

    def close(self) -> None:
        pass

"""Camera capture and YOLOv8 inference.

Works with both kinds of Ultralytics weights:
  * classification models (results[0].probs)  -> whole-frame label
  * detection models      (results[0].boxes)  -> label of the most confident box
"""

import threading
import time
from dataclasses import dataclass, field


@dataclass
class VisionResult:
    label: str = "defectless"
    confidence: float = 0.0
    # (x1, y1, x2, y2, label, confidence) in pixel coordinates, detection models only
    boxes: list = field(default_factory=list)
    inference_ms: float = 0.0


class Camera:
    """Grabs frames on a background thread so inference never blocks on I/O."""

    def __init__(self, source):
        import cv2

        self._cv2 = cv2
        self.source = source
        self._cap = None
        self._frame = None
        self._lock = threading.Lock()
        self._last_frame_at = 0.0
        threading.Thread(target=self._run, daemon=True, name="camera").start()

    @property
    def connected(self) -> bool:
        return time.time() - self._last_frame_at < 2.0

    def read(self):
        with self._lock:
            return None if self._frame is None else self._frame.copy()

    def _run(self) -> None:
        while True:
            if self._cap is None or not self._cap.isOpened():
                self._cap = self._cv2.VideoCapture(self.source)
                if not self._cap.isOpened():
                    time.sleep(2)
                    continue
            ok, frame = self._cap.read()
            if not ok:
                # end of a video file: loop it; unplugged webcam: reopen
                self._cap.release()
                self._cap = None
                continue
            with self._lock:
                self._frame = frame
            self._last_frame_at = time.time()


class YoloAnalyzer:
    def __init__(self, model_path):
        from ultralytics import YOLO

        self.model = YOLO(str(model_path))
        self.names = self.model.names
        self.loaded = True

    def analyze(self, frame) -> VisionResult:
        start = time.perf_counter()
        result = self.model.predict(frame, verbose=False)[0]
        elapsed = (time.perf_counter() - start) * 1000

        if getattr(result, "probs", None) is not None:
            probs = result.probs
            return VisionResult(
                label=self.names[int(probs.top1)].lower(),
                confidence=float(probs.top1conf),
                inference_ms=elapsed,
            )

        boxes = []
        if result.boxes is not None:
            for xyxy, cls, conf in zip(
                result.boxes.xyxy.tolist(), result.boxes.cls.tolist(), result.boxes.conf.tolist()
            ):
                boxes.append((*[int(v) for v in xyxy], self.names[int(cls)].lower(), float(conf)))
        if not boxes:
            return VisionResult(label="defectless", confidence=1.0, inference_ms=elapsed)
        best = max(boxes, key=lambda b: b[5])
        return VisionResult(label=best[4], confidence=best[5], boxes=boxes, inference_ms=elapsed)

"""A.R.T.E.M.I.S. railway maintenance dashboard.

    python dashboard/app.py --simulate                 # demo, no hardware needed
    python dashboard/app.py --port COM3 --camera 0     # Arduino Nano + webcam

Then open http://localhost:5000
"""

import argparse
import json
import sys
import time
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_from_directory

sys.path.insert(0, str(Path(__file__).resolve().parent))

from artemis.config import Config  # noqa: E402
from artemis.engine import Engine  # noqa: E402

STATIC = Path(__file__).resolve().parent / "static"
RANGES = {"15m": (900, 60), "1h": (3600, 300), "24h": (86400, 3600), "all": (None, 3600)}


def create_app(cfg: Config) -> Flask:
    app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")
    engine = Engine(cfg)
    app.config["engine"] = engine

    def range_args():
        window, bucket = RANGES.get(request.args.get("range", "1h"), RANGES["1h"])
        since = 0 if window is None else time.time() - window
        return since, bucket

    @app.get("/")
    def index():
        return send_from_directory(STATIC, "index.html")

    @app.get("/video_feed")
    def video_feed():
        def frames():
            last = -1
            while True:
                frame_id, jpeg = engine.frame()
                if jpeg is None or frame_id == last:
                    time.sleep(0.03)
                    continue
                last = frame_id
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"

        return Response(frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

    @app.get("/api/stream")
    def stream():
        """Server-sent events: live state ~4x per second."""
        def events():
            while True:
                yield f"data: {json.dumps(engine.snapshot_state())}\n\n"
                time.sleep(0.25)

        return Response(events(), mimetype="text/event-stream",
                        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.get("/api/state")
    def state():
        return jsonify(engine.snapshot_state())

    @app.get("/api/history")
    def history():
        return jsonify(engine.history())

    @app.get("/api/events")
    def events():
        since, _ = range_args()
        return jsonify(engine.store.list(
            since=since,
            severity=request.args.get("severity") or None,
            code=request.args.get("code") or None,
            limit=int(request.args.get("limit", 200)),
        ))

    @app.get("/api/events.csv")
    def events_csv():
        since, _ = range_args()
        return Response(engine.store.to_csv(since), mimetype="text/csv",
                        headers={"Content-Disposition": "attachment; filename=artemis_events.csv"})

    @app.post("/api/events/ack")
    def acknowledge():
        event_id = (request.get_json(silent=True) or {}).get("id")
        engine.store.acknowledge(int(event_id) if event_id is not None else None)
        return jsonify(ok=True)

    @app.get("/api/summary")
    def summary():
        since, bucket = range_args()
        return jsonify(engine.store.summary(since, bucket, cfg.segment_m))

    @app.route("/api/thresholds", methods=["GET", "POST"])
    def thresholds():
        if request.method == "POST":
            try:
                cfg.thresholds.update(request.get_json(force=True))
            except (TypeError, ValueError) as exc:
                return jsonify(error=str(exc)), 400
        return jsonify(cfg.thresholds.to_dict())

    @app.get("/snapshots/<path:name>")
    def snapshot(name):
        if "/" in name or "\\" in name:
            abort(404)
        return send_from_directory(cfg.snapshot_dir, name)

    return app


def main() -> None:
    p = argparse.ArgumentParser(description="ARTEMIS railway monitoring dashboard")
    p.add_argument("--simulate", action="store_true", help="synthetic camera, sensors and AI")
    p.add_argument("--port", dest="serial_port", help="Arduino serial port, e.g. COM3 or /dev/ttyUSB0")
    p.add_argument("--baud", type=int, default=115200)
    p.add_argument("--camera", default="0", help="webcam index, video file or stream URL")
    p.add_argument("--model", help="YOLOv8 weights (default: model/best.pt)")
    p.add_argument("--speed", type=float, default=12.0, help="vehicle speed in km/h, for chainage estimate")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--http-port", type=int, default=5000)
    args = p.parse_args()

    cfg = Config(
        serial_port=args.serial_port,
        baud=args.baud,
        camera=int(args.camera) if args.camera.isdigit() else args.camera,
        simulate=args.simulate,
        speed_kmh=args.speed,
    )
    if args.model:
        cfg.model_path = Path(args.model)

    app = create_app(cfg)
    print(f"ARTEMIS dashboard on http://localhost:{args.http_port}  (mode: {app.config['engine'].mode})")
    app.run(host=args.host, port=args.http_port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()

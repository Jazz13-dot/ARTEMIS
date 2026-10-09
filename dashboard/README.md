# ARTEMIS Dashboard

Web dashboard for A.R.T.E.M.I.S. It runs the camera + YOLOv8 + Arduino sensor
fusion loop and shows everything live in the browser.

```
Camera ─► OpenCV ─► YOLOv8 ─┐
                            ├─► fusion (SAFE / WARNING / DANGER + reason) ─► Arduino buzzer
Arduino Nano ─► serial ─────┘                                            ├─► event log (SQLite + snapshots)
 (MPU6050, ultrasonic, IR)                                               └─► web dashboard
```

## Run

```bash
pip install -r Requirements.txt

# Demo, no hardware needed: synthetic camera, sensors and AI
python dashboard/app.py --simulate

# Real setup: Arduino Nano on COM3 + webcam 0 + model/best.pt
python dashboard/app.py --port COM3 --camera 0
```

Open http://localhost:5000.

| Option | Default | Meaning |
|---|---|---|
| `--simulate` | off | Synthetic data for demos and development |
| `--port` | none | Arduino serial port (`COM3`, `/dev/ttyUSB0`). Without it the dashboard runs camera + AI only |
| `--baud` | 115200 | Serial speed |
| `--camera` | 0 | Webcam index, video file or RTSP URL |
| `--model` | `model/best.pt` | YOLOv8 weights (classification or detection) |
| `--speed` | 12 | Vehicle speed in km/h, used to estimate chainage until GPS is fitted |
| `--http-port` | 5000 | Dashboard port |

If the model can't be loaded, video and sensors keep running and the dashboard
shows a banner saying visual detection is offline.

## What's on the dashboard

**Live**
- Camera feed with the YOLOv8 result in the bottom-right corner (no overlay covering the track)
- Track status SAFE / WARNING / DANGER, and the **reason** for each alarm:
  *CRACK DETECTED*, *HIGHER VIBRATION*, *OBSTACLE DETECTED*, *VEGETATION ON TRACK*, *IR SENSOR TRIGGERED*
- Buzzer state with mute, and an acknowledge button for alarms
- Sensor readout: distance, ACC, GYRO, vibration index, IR, chainage
- System health: Arduino CONNECTED / DISCONNECTED, camera, AI model, FPS
- Telemetry charts for the last 2 minutes: vibration (with warning/danger lines),
  ultrasonic distance (with obstacle line), acceleration X/Y/Z

**History** (the 15 min / 1 h / 24 h / All filter applies to everything below it)
- KPIs: total alarms, danger count, unacknowledged, most frequent reason, segments needing attention
- Defect locations along the route (danger above the rail, warning below; P1 segments shaded)
- Alarms over time, stacked by reason
- Maintenance priority per 200 m segment (P1 = any danger or score ≥ 6, P2 = score ≥ 3; warning = 1, danger = 3)
- Event log with snapshot, AI result, vibration and distance; filter, acknowledge, CSV export

**Settings** (gear icon): AI confidence threshold (default 0.4), vibration warning/danger
levels, obstacle distance, repeat-alarm cooldown, buzzer on/off. Changes apply immediately.

## Decision rules

| Condition | Status | Reason |
|---|---|---|
| AI: crack, vibration < danger level | WARNING | CRACK DETECTED |
| AI: crack, vibration ≥ danger level | DANGER | CRACK DETECTED |
| AI: vegetation | WARNING | VEGETATION ON TRACK |
| AI: any other non-normal class | WARNING | `<CLASS>` DETECTED |
| Ultrasonic ≤ obstacle distance | DANGER | OBSTACLE DETECTED |
| IR sensor triggered | WARNING | IR SENSOR TRIGGERED |
| Vibration ≥ warning level (≥ danger level → DANGER) | WARNING | HIGHER VIBRATION |

The vibration index is the standard deviation of |acceleration| over the last 0.5 s, in g.
The buzzer sounds for any WARNING (beeping) or DANGER (continuous) unless muted.

## Arduino

Flash `firmware/artemis_nano/artemis_nano.ino` (wiring is at the top of the file).
Protocol at 115200 baud:

```
Nano -> PC   S,<dist_cm>,<ir>,<ax>,<ay>,<az>,<gx>,<gy>,<gz>     ~20 Hz, dist -1 = no echo
PC -> Nano   G / Y / R   status SAFE / WARNING / DANGER
             B / b       buzzer enabled / muted
```

If the PC stops sending for 1.5 s, the Nano falls back to local obstacle/shock alarms.

## Data

Events are stored in `detections/artemis.db` (SQLite) with a JPEG snapshot each in
`detections/snapshots/`. Each event has timestamp, chainage, lat/lon (empty until GPS
is added), reason, severity, AI label and confidence, vibration and all raw sensor values.

## API

| Endpoint | |
|---|---|
| `GET /video_feed` | MJPEG camera stream |
| `GET /api/stream` | Live state as server-sent events (4/s) |
| `GET /api/state`, `/api/history` | Current state; last 2 min of telemetry |
| `GET /api/events?range=1h&severity=&code=` | Event list |
| `GET /api/events.csv?range=all` | CSV export |
| `POST /api/events/ack` `{id}` | Acknowledge one event, or all if no id |
| `GET /api/summary?range=24h` | KPIs, trend, segment priority |
| `GET/POST /api/thresholds` | Read / change detection settings |

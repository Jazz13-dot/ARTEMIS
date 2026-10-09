/* ARTEMIS dashboard client: live state over SSE, history over REST. */
(function () {
  const $ = (id) => document.getElementById(id);
  const C = window.Charts;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Alarm reasons -> categorical slots, fixed order (identity follows the reason, never its rank)
  const REASONS = [
    { code: "crack", name: "Crack", slot: "--s1" },
    { code: "vibration", name: "Higher vibration", slot: "--s2" },
    { code: "vegetation", name: "Vegetation", slot: "--s3" },
    { code: "obstacle", name: "Obstacle", slot: "--s4" },
    { code: "ir", name: "IR sensor", slot: "--s5" },
  ];
  const reasonName = (code) => (REASONS.find((r) => r.code === code) || { name: code }).name;
  const reasonColor = (code) => css((REASONS.find((r) => r.code === code) || { slot: "--muted" }).slot);

  const ICONS = {
    SAFE: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    WARNING: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.3v.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    OFFLINE: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 12h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
    DANGER: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 7.5v6M12 16.5v.2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  };
  const smallIcon = (sev) => ICONS[sev].replace(/width="22" height="22"/, 'width="13" height="13"');
  function sevBadge(sev) {
    const s = document.createElement("span");
    s.className = `sev ${sev}`;
    s.innerHTML = smallIcon(sev); // static markup, no data
    s.append(sev);
    return s;
  }

  // ---------------- theme ----------------
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const savedTheme = store.get("artemis-theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $("theme-btn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    store.set("artemis-theme", document.documentElement.dataset.theme);
    renderLiveCharts();
    refreshHistory(false);
  });

  // ---------------- live state ----------------
  let state = null;
  let samples = [];
  const HISTORY_S = 120;

  fetch("/api/history").then((r) => r.json()).then((h) => { samples = h.concat(samples); }).catch(() => {});

  const fmt = {
    num: (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d)),
    vec: (a, d = 2) => (a ? a.map((v) => (v >= 0 ? " " : "") + Number(v).toFixed(d)).join("  ") : "—"),
    km: (v) => (v == null ? "—" : `km ${Number(v).toFixed(3)}`),
    ago: (t) => {
      const s = Math.max(0, Date.now() / 1000 - t);
      if (s < 60) return `${Math.round(s)} s ago`;
      if (s < 3600) return `${Math.round(s / 60)} min ago`;
      return `${(s / 3600).toFixed(1)} h ago`;
    },
  };

  function setHealth(id, ok, text) {
    const li = $(id);
    li.className = ok ? "ok" : "bad";
    li.querySelector("b").textContent = text;
  }

  function updateLive(s) {
    state = s;
    $("route").textContent = s.route;
    $("map-route").textContent = s.route;
    const badge = $("mode-badge");
    badge.textContent = s.mode === "simulation" ? "Simulation" : "Live";
    badge.className = `badge ${s.mode === "simulation" ? "sim" : "live"}`;

    const h = s.health;
    setHealth("h-arduino", h.arduino, h.arduino ? "CONNECTED" : "DISCONNECTED");
    setHealth("h-camera", h.camera, h.camera ? "OK" : "NO SIGNAL");
    setHealth("h-model", h.model, h.model ? "LOADED" : "OFFLINE");
    $("h-fps").textContent = fmt.num(h.fps, 1);
    $("video-empty").hidden = h.camera;

    const warn = $("model-warning");
    if (h.model_error) {
      warn.hidden = false;
      warn.replaceChildren(
        Object.assign(document.createElement("b"), { textContent: "AI model not loaded. " }),
        document.createTextNode("Sensors and video keep running, but no visual defect detection. Check "),
        Object.assign(document.createElement("code"), { textContent: "model/best.pt" }),
        document.createTextNode(` — ${h.model_error}`),
      );
    } else warn.hidden = true;

    // status card: never claim SAFE when nothing is being measured
    const aiUp = h.model && h.camera;
    const noData = !aiUp && !s.sensors;
    const shown = noData ? "OFFLINE" : s.status;
    const card = $("status-card");
    card.dataset.status = shown;
    $("status-icon").innerHTML = ICONS[shown];
    $("status-word").textContent = noData ? "NO DATA" : s.status;
    $("headline").textContent = noData ? "NO CAMERA / AI AND NO SENSORS"
      : !aiUp && !s.alarms.length ? "AI OFFLINE — SENSORS ONLY" : s.headline;
    const reasons = $("reasons");
    reasons.replaceChildren();
    for (const a of s.alarms) {
      const li = document.createElement("li");
      const msg = document.createElement("span");
      msg.textContent = a.message;
      li.append(sevBadge(a.severity), msg);
      reasons.appendChild(li);
    }
    const buzzer = $("buzzer");
    buzzer.classList.toggle("on", s.buzzer);
    $("buzzer-text").textContent = !s.thresholds.buzzer_enabled ? "Muted" : s.buzzer ? "Buzzer ON" : "Buzzer off";
    $("mute-btn").textContent = s.thresholds.buzzer_enabled ? "Mute buzzer" : "Unmute buzzer";

    const sn = s.sensors;
    const th = s.thresholds;
    const dist = $("r-dist");
    dist.textContent = sn ? (sn.distance_cm == null ? "out of range" : `${fmt.num(sn.distance_cm, 0)} cm`) : "—";
    dist.className = sn && sn.distance_cm != null && sn.distance_cm <= th.obstacle_cm ? "alert" : "";
    $("r-acc").textContent = sn ? fmt.vec(sn.acc) : "—";
    $("r-gyro").textContent = sn ? fmt.vec(sn.gyro, 1) : "—";
    const vib = $("r-vib");
    vib.textContent = sn ? `${fmt.num(sn.vibration, 3)} g` : "—";
    vib.className = sn && sn.vibration >= th.vibration_warn ? "alert" : "";
    $("r-ir").textContent = sn ? (sn.ir ? "TRIGGERED" : "clear") : "—";
    $("r-ir").className = sn && sn.ir ? "alert" : "";
    $("r-chain").textContent = `${fmt.km(s.chainage_km)} · ${s.speed_kmh} km/h`;
    $("chainage-hud").textContent = fmt.km(s.chainage_km);

    // YOLO readout, bottom-right of the video
    const hud = $("hud-detect");
    hud.dataset.status = s.status;
    $("hud-label").textContent = aiUp ? s.vision.label : "AI offline";
    $("hud-conf").textContent = aiUp ? `${(s.vision.confidence * 100).toFixed(1)}%` : "—";
    $("hud-ms").textContent = aiUp ? `${s.vision.inference_ms} ms` : "";

    samples.push({
      t: s.t,
      vibration: sn ? sn.vibration : null,
      distance_cm: sn ? sn.distance_cm : null,
      acc: sn ? sn.acc : null,
    });
    const cutoff = s.t - HISTORY_S;
    while (samples.length && samples[0].t < cutoff) samples.shift();
  }

  // ---------------- live charts ----------------
  function renderLiveCharts() {
    if (!state) return;
    const t1 = state.t, t0 = t1 - HISTORY_S;
    const th = state.thresholds;
    C.lineChart($("chart-vib"), {
      label: "Vibration index",
      domain: [t0, t1], yMin: 0, minSpan: 0.5,
      series: [{ name: "Vibration", color: css("--s1"), values: samples.map((p) => ({ t: p.t, v: p.vibration })) }],
      thresholds: [
        { v: th.vibration_warn, label: "warning", cls: "warn" },
        { v: th.vibration_danger, label: "danger", cls: "danger" },
      ],
      fmt: (v, tip) => (tip ? `${v.toFixed(3)} g` : v.toFixed(2)),
    });
    C.lineChart($("chart-dist"), {
      label: "Ultrasonic distance",
      domain: [t0, t1], yMin: 0, minSpan: 100,
      series: [{ name: "Distance", color: css("--s1"), values: samples.map((p) => ({ t: p.t, v: p.distance_cm })) }],
      thresholds: [{ v: th.obstacle_cm, label: "obstacle", cls: "danger" }],
      fmt: (v, tip) => (tip ? `${v.toFixed(0)} cm` : v.toFixed(0)),
    });
    const axes = [["X", "--s1"], ["Y", "--s2"], ["Z", "--s3"]];
    C.lineChart($("chart-acc"), {
      label: "Acceleration X Y Z",
      domain: [t0, t1], minSpan: 0.5, directLabels: true,
      series: axes.map(([n, slot], i) => ({ name: n, color: css(slot), values: samples.map((p) => ({ t: p.t, v: p.acc ? p.acc[i] : null })) })),
      fmt: (v, tip) => (tip ? `${v.toFixed(3)} g` : v.toFixed(1)),
    });
    C.legend($("legend-acc"), axes.map(([n, slot]) => ({ name: `${n} axis`, color: css(slot) })), "line");
  }

  // SSE with automatic reconnect (EventSource retries by itself)
  const es = new EventSource("/api/stream");
  es.onmessage = (e) => updateLive(JSON.parse(e.data));
  setInterval(renderLiveCharts, 500);
  setInterval(() => { $("clock").textContent = new Date().toLocaleTimeString(); }, 1000);

  // ---------------- history (filters scope everything below) ----------------
  let range = store.get("artemis-range") || "1h";
  const rangeButtons = document.querySelectorAll(".filters button");
  const markRange = () => rangeButtons.forEach((b) => b.classList.toggle("on", b.dataset.range === range));
  markRange();
  rangeButtons.forEach((b) => b.addEventListener("click", () => {
    range = b.dataset.range;
    store.set("artemis-range", range);
    markRange();
    refreshHistory(true);
  }));
  $("f-severity").addEventListener("change", () => refreshHistory(true));
  $("f-code").addEventListener("change", () => refreshHistory(true));

  let lastSummary = null, lastEvents = [], lastMapEvents = [];

  async function refreshHistory(showLoading) {
    const scoped = document.querySelectorAll("#kpis, .map-card, #chart-trend, #segments, #events");
    if (showLoading) scoped.forEach((n) => n.classList.add("refreshing"));
    const sev = $("f-severity").value, code = $("f-code").value;
    $("csv-link").href = `/api/events.csv?range=${range}`;
    try {
      const [summary, events, mapEvents] = await Promise.all([
        fetch(`/api/summary?range=${range}`).then((r) => r.json()),
        fetch(`/api/events?range=${range}&severity=${sev}&code=${code}&limit=300`).then((r) => r.json()),
        fetch(`/api/events?range=${range}&limit=1000`).then((r) => r.json()),
      ]);
      lastSummary = summary; lastEvents = events; lastMapEvents = mapEvents;
    } catch { /* keep the previous frame on a failed refetch */ }
    scoped.forEach((n) => n.classList.remove("refreshing"));
    if (!lastSummary) return;
    renderKpis(lastSummary);
    renderTrend(lastSummary);
    renderSegments(lastSummary);
    renderEvents(lastEvents);
    renderMap(lastMapEvents, lastSummary);
  }

  function renderKpis(s) {
    const total = Object.values(s.by_code).reduce((a, b) => a + b, 0);
    $("k-total").textContent = total;
    $("k-danger").textContent = s.by_severity.DANGER || 0;
    $("k-unack").textContent = s.unacknowledged;
    $("unack-count").textContent = s.unacknowledged;
    const top = Object.entries(s.by_code).sort((a, b) => b[1] - a[1])[0];
    $("k-top").textContent = top ? `${reasonName(top[0])} (${top[1]})` : "—";
    $("k-segs").textContent = s.segments.filter((g) => g.priority !== "P3").length;
  }

  function renderTrend(s) {
    const now = Date.now() / 1000;
    const span = { "15m": 900, "1h": 3600, "24h": 86400 }[range];
    let start = span ? now - span : (s.trend.length ? s.trend[0].bucket : now - 3600);
    start = Math.floor(start / s.bucket_s) * s.bucket_s;
    const buckets = [];
    for (let b = start; b <= now; b += s.bucket_s) buckets.push(b);
    const counts = {};
    for (const r of s.trend) (counts[r.bucket] = counts[r.bucket] || {})[r.code] = r.n;
    const keys = REASONS.map((r) => ({ code: r.code, name: r.name, color: css(r.slot) }));
    // unknown model classes fold into one "Other" key
    const other = s.trend.filter((r) => !REASONS.some((k) => k.code === r.code));
    if (other.length) {
      keys.push({ code: "_other", name: "Other", color: css("--muted") });
      for (const r of other) counts[r.bucket]._other = (counts[r.bucket]._other || 0) + r.n;
    }
    const daily = s.bucket_s >= 3600;
    C.stackedBars($("chart-trend"), {
      buckets, bucketS: s.bucket_s, keys, counts,
      fmtBucket: (b, long) => {
        const d = new Date(b * 1000);
        const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        if (!long) return daily && range === "all" ? d.toLocaleDateString([], { month: "short", day: "numeric" }) : hm;
        const e = new Date((b + s.bucket_s) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${hm}–${e}`;
      },
    });
    C.legend($("legend-trend"), keys, "rect");
  }

  function reasonChips(codes) {
    const frag = document.createDocumentFragment();
    for (const code of codes) {
      const chip = document.createElement("span");
      chip.className = "reason-chip";
      const i = document.createElement("i");
      i.style.background = reasonColor(code);
      chip.append(i, reasonName(code));
      frag.appendChild(chip);
    }
    return frag;
  }

  function renderSegments(s) {
    const body = $("segments").querySelector("tbody");
    body.replaceChildren();
    for (const g of s.segments) {
      const tr = document.createElement("tr");
      const p = document.createElement("span");
      p.className = `prio ${g.priority}`;
      p.textContent = g.priority;
      const cells = [p, `${g.start_km.toFixed(1)} – ${g.end_km.toFixed(1)}`, `${g.n} (${g.danger} danger)`, reasonChips(g.codes), fmt.ago(g.last_ts)];
      for (const c of cells) {
        const td = document.createElement("td");
        td.append(c);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    $("segments-empty").hidden = s.segments.length > 0;
  }

  function renderEvents(events) {
    const body = $("events").querySelector("tbody");
    body.replaceChildren();
    for (const e of events) {
      const tr = document.createElement("tr");
      if (!e.acknowledged) tr.className = "unack";
      const time = new Date(e.ts * 1000);
      const td = (content) => { const c = document.createElement("td"); if (content != null) c.append(content); tr.appendChild(c); return c; };
      td(`${time.toLocaleDateString([], { month: "short", day: "numeric" })} ${time.toLocaleTimeString()}`);
      td(sevBadge(e.severity));
      td(reasonChips([e.code]));
      td(fmt.km(e.chainage_km));
      td(e.label && e.label !== "unavailable" ? `${e.label} ${(e.confidence * 100).toFixed(0)}%` : "—");
      td(e.vibration == null ? "—" : `${e.vibration.toFixed(3)} g`);
      td(e.distance_cm == null ? "—" : `${Math.round(e.distance_cm)} cm`);
      const snap = td();
      if (e.snapshot) {
        const img = document.createElement("img");
        img.className = "thumb";
        img.loading = "lazy";
        img.alt = `Snapshot: ${e.message}`;
        img.src = `/snapshots/${encodeURIComponent(e.snapshot)}`;
        img.addEventListener("click", () => openSnapshot(e));
        snap.appendChild(img);
      }
      const act = td();
      if (!e.acknowledged) {
        const b = document.createElement("button");
        b.textContent = "Ack";
        b.addEventListener("click", () => acknowledge(e.id));
        act.appendChild(b);
      }
      body.appendChild(tr);
    }
    $("events-empty").hidden = events.length > 0;
  }

  function openSnapshot(e) {
    $("snapshot-img").src = `/snapshots/${encodeURIComponent(e.snapshot)}`;
    $("snapshot-caption").textContent = `${e.message} · ${e.severity} · ${fmt.km(e.chainage_km)} · ${new Date(e.ts * 1000).toLocaleString()}`;
    $("snapshot-dialog").showModal();
  }

  // ---------------- track map ----------------
  function renderMap(events, summary) {
    const box = $("track-map");
    const W = box.clientWidth || 600, H = box.clientHeight || 120;
    const m = { l: 16, r: 16 };
    const here = state ? state.chainage_km : 0;
    const kms = events.map((e) => e.chainage_km).filter((v) => v != null).concat([here]);
    let lo = Math.min(...kms), hi = Math.max(...kms);
    if (hi - lo < 1) { const c = (hi + lo) / 2; lo = c - 0.5; hi = c + 0.5; }
    const pad = (hi - lo) * 0.05;
    lo = Math.max(0, lo - pad); hi = hi + pad;
    const x = (km) => m.l + ((km - lo) / (hi - lo)) * (W - m.l - m.r);
    const railY = H / 2;
    const svg = C.el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Defect locations along the route" });

    for (const g of summary.segments.filter((s) => s.priority === "P1")) {
      C.el("rect", { x: x(g.start_km), y: railY - 34, width: Math.max(3, x(g.end_km) - x(g.start_km)), height: 68, rx: 4, class: "seg-band" }, svg);
    }
    const sleeperStep = Math.max(8, (W - m.l - m.r) / 120);
    for (let sx = m.l; sx <= W - m.r; sx += sleeperStep) C.el("line", { x1: sx, x2: sx, y1: railY - 7, y2: railY + 7, class: "sleeper" }, svg);
    C.el("line", { x1: m.l, x2: W - m.r, y1: railY - 4, y2: railY - 4, class: "rail" }, svg);
    C.el("line", { x1: m.l, x2: W - m.r, y1: railY + 4, y2: railY + 4, class: "rail" }, svg);

    const maxTicks = Math.max(2, Math.min(8, Math.floor((W - m.l - m.r) / 64)));
    const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20].find((s) => (hi - lo) / s <= maxTicks) || 20;
    for (let k = Math.ceil(lo / step) * step; k <= hi; k += step) {
      C.el("text", { x: x(k), y: H - 2, "text-anchor": "middle", class: "tick" }, svg).textContent = `km ${k.toFixed(step < 1 ? 1 : 0)}`;
      Object.assign(svg.lastChild.style, { fill: css("--muted"), fontSize: "11px" });
    }

    // DANGER markers ride above the rail (octagon), WARNING below (triangle): shape + position, not colour alone
    for (const e of events) {
      if (e.chainage_km == null) continue;
      const cx = x(e.chainage_km);
      const danger = e.severity === "DANGER";
      const cy = danger ? railY - 22 : railY + 22;
      const shape = danger
        ? C.el("polygon", { points: octagon(cx, cy, 6.5), class: `marker DANGER` }, svg)
        : C.el("polygon", { points: `${cx},${cy - 6.5} ${cx + 7},${cy + 5.5} ${cx - 7},${cy + 5.5}`, class: "marker WARNING" }, svg);
      const hit = C.el("circle", { cx, cy, r: 12, class: "hit", tabindex: 0 }, svg);
      const tip = (ev) => {
        const r = hit.getBoundingClientRect();
        C.showTooltip(ev.clientX ?? r.right, ev.clientY ?? r.top, `${fmt.km(e.chainage_km)} · ${new Date(e.ts * 1000).toLocaleTimeString()}`, [
          { color: reasonColor(e.code), value: e.message, name: e.severity },
        ]);
      };
      hit.addEventListener("pointermove", tip);
      hit.addEventListener("focus", tip);
      hit.addEventListener("pointerleave", C.hideTooltip);
      hit.addEventListener("blur", C.hideTooltip);
      if (e.snapshot) hit.addEventListener("click", () => openSnapshot(e));
      void shape;
    }

    // current position
    const tx = x(here);
    C.el("path", { d: `M${tx - 9},${railY - 9}h18v13l-4 5h-10l-4-5z`, class: "train" }, svg);
    C.el("text", { x: tx, y: 12, "text-anchor": "middle", class: "tick" }, svg).textContent = "ARTEMIS";
    Object.assign(svg.lastChild.style, { fill: css("--text-2"), fontSize: "11px", fontWeight: 650 });

    box.replaceChildren(svg);

    const legend = $("legend-map");
    legend.replaceChildren();
    const item = (svgMarkup, text) => {
      const s = document.createElement("span");
      s.innerHTML = svgMarkup; // static markup
      s.append(text);
      legend.appendChild(s);
    };
    item(`<svg class="key-marker" viewBox="0 0 14 14"><polygon points="${octagon(7, 7, 6)}" fill="${css("--critical")}"/></svg>`, "Danger");
    item(`<svg class="key-marker" viewBox="0 0 14 14"><polygon points="7,1 13.5,12.5 0.5,12.5" fill="${css("--warning")}"/></svg>`, "Warning");
    item(`<svg class="key-marker" viewBox="0 0 14 14"><rect x="0" y="2" width="14" height="10" rx="2" fill="${css("--critical-wash")}" stroke="${css("--critical")}" stroke-width="0.5"/></svg>`, "P1 segment");
  }

  function octagon(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(" ");
  }

  // ---------------- actions ----------------
  async function acknowledge(id) {
    await fetch("/api/events/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id == null ? {} : { id }) });
    refreshHistory(false);
  }
  $("ack-all-btn").addEventListener("click", () => acknowledge(null));

  async function saveThresholds(data) {
    const r = await fetch("/api/thresholds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    return r.json();
  }
  $("mute-btn").addEventListener("click", () => {
    if (state) saveThresholds({ buzzer_enabled: !state.thresholds.buzzer_enabled });
  });

  const dlg = $("settings-dialog");
  const form = $("settings-form");
  $("settings-btn").addEventListener("click", async () => {
    const th = await fetch("/api/thresholds").then((r) => r.json());
    for (const [k, v] of Object.entries(th)) {
      const input = form.elements[k];
      if (!input) continue;
      if (input.type === "checkbox") input.checked = v; else input.value = v;
    }
    dlg.showModal();
  });
  dlg.addEventListener("close", () => {
    if (dlg.returnValue !== "save") return;
    const data = {};
    for (const input of form.querySelectorAll("input")) data[input.name] = input.type === "checkbox" ? input.checked : Number(input.value);
    saveThresholds(data);
  });

  window.addEventListener("resize", () => { renderLiveCharts(); if (lastSummary) renderMap(lastMapEvents, lastSummary); if (lastSummary) renderTrend(lastSummary); });

  refreshHistory(true);
  setInterval(() => refreshHistory(false), 3000);
})();

/* Minimal dependency-free SVG charts for the ARTEMIS dashboard.
 * Line charts get a crosshair + all-series tooltip; bar segments carry their own tooltip.
 * All labels are inserted with textContent. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const tooltip = () => document.getElementById("tooltip");

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
    return { ticks, lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step };
  }

  function showTooltip(x, y, title, rows) {
    const tt = tooltip();
    tt.replaceChildren();
    const head = document.createElement("div");
    head.className = "tt-title";
    head.textContent = title;
    tt.appendChild(head);
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "tt-row";
      const key = document.createElement("span");
      key.className = "tt-key";
      key.style.background = r.color;
      if (r.rect) { key.style.height = "10px"; key.style.width = "10px"; key.style.borderRadius = "2px"; }
      const val = document.createElement("b");
      val.textContent = r.value;
      const name = document.createElement("span");
      name.className = "tt-name";
      name.textContent = r.name;
      row.append(key, val, name);
      tt.appendChild(row);
    }
    tt.hidden = false;
    const w = tt.offsetWidth, h = tt.offsetHeight;
    let left = x + 14, top = y - h - 10;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 16;
    tt.style.left = left + "px";
    tt.style.top = top + "px";
  }
  function hideTooltip() { tooltip().hidden = true; }

  function legend(container, items, kind) {
    container.replaceChildren();
    for (const it of items) {
      const s = document.createElement("span");
      const k = document.createElement("i");
      k.className = kind === "rect" ? "key-rect" : "key-line";
      k.style.background = it.color;
      const t = document.createElement("span");
      t.textContent = it.name;
      s.append(k, t);
      container.appendChild(s);
    }
  }

  const fmtClock = (t) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  /* opts: { series:[{name,color,values:[{t,v}]}], domain:[t0,t1], yMin, yMax, thresholds:[{v,label,cls}],
   *         fmt:(v)=>string, directLabels:bool } */
  function lineChart(container, opts) {
    const W = container.clientWidth || 300, H = container.clientHeight || 160;
    const m = { l: 40, r: opts.directLabels ? 26 : 10, t: 10, b: 22 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const [t0, t1] = opts.domain;
    let lo = opts.yMin, hi = opts.yMax;
    const all = opts.series.flatMap((s) => s.values.map((p) => p.v)).filter((v) => v != null);
    (opts.thresholds || []).forEach((th) => all.push(th.v));
    if (lo == null) lo = all.length ? Math.min(...all) : 0;
    if (hi == null) hi = all.length ? Math.max(...all) : 1;
    if (hi - lo < (opts.minSpan || 1e-6)) { const c = (hi + lo) / 2; lo = c - (opts.minSpan || 1) / 2; hi = c + (opts.minSpan || 1) / 2; }
    const nt = niceTicks(lo, hi, 4);
    lo = opts.yMin != null ? opts.yMin : nt.lo; hi = nt.hi;
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "chart" });
    for (const tv of nt.ticks) {
      if (tv < lo || tv > hi) continue;
      el("line", { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: tv === lo ? "baseline" : "gridline" }, svg);
      el("text", { x: m.l - 6, y: y(tv) + 4, "text-anchor": "end", class: "tick" }, svg).textContent = opts.fmt(tv);
    }
    const tStep = [15, 30, 60, 120].find((s) => (iw / ((t1 - t0) / s)) >= 80) || 120;
    for (let s = Math.ceil(t0 / tStep) * tStep; s <= t1; s += tStep) {
      el("text", { x: x(s), y: H - 4, "text-anchor": "middle", class: "tick" }, svg).textContent =
        new Date(s * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    }
    for (const th of opts.thresholds || []) {
      if (th.v < lo || th.v > hi) continue;
      el("line", { x1: m.l, x2: W - m.r, y1: y(th.v), y2: y(th.v), class: `threshold ${th.cls}` }, svg);
      el("text", { x: W - m.r - 2, y: y(th.v) - 4, "text-anchor": "end", class: "th-label" }, svg).textContent = th.label;
    }
    const labelYs = [];
    for (const s of opts.series) {
      let d = "", pen = false;
      for (const p of s.values) {
        if (p.v == null || p.t < t0) { pen = false; continue; }
        d += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(Math.max(lo, Math.min(hi, p.v))).toFixed(1)}`;
        pen = true;
      }
      el("path", { d, class: "line", stroke: s.color }, svg);
      if (opts.directLabels) {
        const last = [...s.values].reverse().find((p) => p.v != null);
        if (last) {
          let ly = y(Math.max(lo, Math.min(hi, last.v))) + 4;
          while (labelYs.some((o) => Math.abs(o - ly) < 12)) ly += 12; // keep labels from colliding
          labelYs.push(ly);
          el("text", { x: W - m.r + 4, y: ly, class: "direct-label" }, svg).textContent = s.name;
        }
      }
    }

    const hover = el("g", {}, svg);
    const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, svg);
    const draw = (clientX, clientY) => {
      hover.replaceChildren();
      const box = svg.getBoundingClientRect();
      const px = ((clientX - box.left) / box.width) * W;
      const t = t0 + ((px - m.l) / iw) * (t1 - t0);
      const ref = opts.series[0].values;
      if (!ref.length) return;
      let best = ref[0];
      for (const p of ref) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      el("line", { x1: x(best.t), x2: x(best.t), y1: m.t, y2: m.t + ih, class: "crosshair" }, hover);
      const rows = [];
      for (const s of opts.series) {
        const p = s.values.find((q) => q.t === best.t);
        if (!p || p.v == null) continue;
        el("circle", { cx: x(p.t), cy: y(Math.max(lo, Math.min(hi, p.v))), r: 4, fill: s.color, class: "hover-dot" }, hover);
        rows.push({ color: s.color, value: opts.fmt(p.v, true), name: s.name });
      }
      showTooltip(clientX, clientY, fmtClock(best.t), rows);
    };
    hit.addEventListener("pointermove", (e) => { container._hover = [e.clientX, e.clientY]; draw(e.clientX, e.clientY); });
    hit.addEventListener("pointerleave", () => { container._hover = null; hover.replaceChildren(); hideTooltip(); });

    container.replaceChildren(svg);
    if (container._hover) draw(...container._hover); // keep crosshair alive across live redraws
  }

  /* opts: { buckets:[t...], bucketS, keys:[{code,name,color}], counts:{bucket:{code:n}} } */
  function stackedBars(container, opts) {
    const W = container.clientWidth || 300, H = container.clientHeight || 220;
    const m = { l: 34, r: 8, t: 10, b: 22 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const totals = opts.buckets.map((b) => opts.keys.reduce((s, k) => s + ((opts.counts[b] || {})[k.code] || 0), 0));
    const nt = niceTicks(0, Math.max(4, ...totals), 4);
    const hi = nt.hi;
    const y = (v) => m.t + ih - (v / hi) * ih;
    const n = opts.buckets.length;
    const slot = iw / Math.max(1, n);
    const bw = Math.max(2, Math.min(28, slot - 2));

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Alarms over time by reason" });
    for (const tv of nt.ticks) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(tv), y2: y(tv), class: tv === 0 ? "baseline" : "gridline" }, svg);
      el("text", { x: m.l - 6, y: y(tv) + 4, "text-anchor": "end", class: "tick" }, svg).textContent = tv;
    }
    const labelEvery = Math.ceil(n / Math.max(1, Math.floor(iw / 70)));
    opts.buckets.forEach((b, i) => {
      const cx = m.l + slot * i + slot / 2;
      if (i % labelEvery === 0) {
        el("text", { x: cx, y: H - 4, "text-anchor": "middle", class: "tick" }, svg).textContent = opts.fmtBucket(b);
      }
      let acc = 0;
      const stack = opts.keys.filter((k) => (opts.counts[b] || {})[k.code]);
      stack.forEach((k, j) => {
        const v = opts.counts[b][k.code];
        const y0 = y(acc), y1 = y(acc + v);
        acc += v;
        const top = j === stack.length - 1;
        const h = Math.max(1, y0 - y1);
        const r = top ? Math.min(4, bw / 2, h) : 0;
        const x0 = cx - bw / 2;
        const d = r
          ? `M${x0},${y0}V${y1 + r}Q${x0},${y1} ${x0 + r},${y1}H${x0 + bw - r}Q${x0 + bw},${y1} ${x0 + bw},${y1 + r}V${y0}Z`
          : `M${x0},${y0}V${y1}H${x0 + bw}V${y0}Z`;
        const seg = el("path", { d, fill: k.color, class: "bar-seg", tabindex: 0 }, svg);
        const tip = (e) => {
          const rect = seg.getBoundingClientRect();
          showTooltip(e.clientX ?? rect.right, e.clientY ?? rect.top, opts.fmtBucket(b, true),
            [{ color: k.color, rect: true, value: String(v), name: k.name }, { color: "transparent", value: String(totals[i]), name: "total in bucket" }]);
        };
        seg.addEventListener("pointermove", tip);
        seg.addEventListener("focus", tip);
        seg.addEventListener("pointerleave", hideTooltip);
        seg.addEventListener("blur", hideTooltip);
      });
    });
    container.replaceChildren(svg);
  }

  window.Charts = { el, lineChart, stackedBars, legend, showTooltip, hideTooltip, fmtClock };
})();

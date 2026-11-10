
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const story = window.STORY;

const fromEl = document.querySelector("#year-from");
const toEl = document.querySelector("#year-to");
const countEl = document.querySelector("#on-map");
const chartHost = document.querySelector("#month-chart");
const tipEl = document.querySelector("#month-tip");

let map = null;

function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (cur || row.length) { row.push(cur); rows.push(row); }
      row = []; cur = "";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.slice(1);
}

function put(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function load() {
  const text = await fetch("assets/landslide_cleaned_2000_2024.csv").then((r) => r.text());
  const rows = parseCsv(text).map((c) => ({
    year: Number(c[2]),
    month: Number(c[3]),
    type: c[7],
    scale: Number(c[8]),
    rain: Number(c[10]),
  })).filter((r) => r.year && r.month);

  const scales = rows.map((r) => r.scale).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  const threshold = Math.round(scales[Math.floor(0.95 * (scales.length - 1))]);
  const large = (r) => r.scale >= threshold;
  const wet = (r) => r.month >= 6 && r.month <= 9;
  const n = rows.length;
  const nLarge = rows.filter(large).length;
  const wetShare = (100 * rows.filter(wet).length / n).toFixed(1);
  const largeWet = (100 * rows.filter((r) => wet(r) && large(r)).length / nLarge).toFixed(1);

  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const g = rows.filter((r) => r.month === m);
    const rains = g.map((r) => r.rain).filter((x) => !Number.isNaN(x));
    monthly.push({
      month: m,
      count: g.length,
      large: g.filter(large).length,
      meanRain: rains.length ? Math.round((10 * rains.reduce((a, b) => a + b, 0) / rains.length)) / 10 : 0,
    });
  }
  const peak = monthly.reduce((a, b) => (b.count > a.count ? b : a));

  const byYear = new Map();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, { year: r.year, count: 0, large: 0 });
    const y = byYear.get(r.year);
    y.count += 1;
    if (large(r)) y.large += 1;
  }
  const yearly = [...byYear.values()].sort((a, b) => a.year - b.year);

  const bins = [
    ["0", (r) => r.rain === 0],
    ["0–25", (r) => r.rain > 0 && r.rain <= 25],
    ["25–50", (r) => r.rain > 25 && r.rain <= 50],
    ["50–100", (r) => r.rain > 50 && r.rain <= 100],
    ["100–200", (r) => r.rain > 100 && r.rain <= 200],
    ["200+", (r) => r.rain > 200],
  ].map(([label, test]) => {
    const g = rows.filter((r) => !Number.isNaN(r.rain) && test(r));
    const share = g.length ? Math.round(1000 * g.filter(large).length / g.length) / 10 : 0;
    return { label, count: g.length, largeShare: share };
  });
  const maxShare = Math.max(...bins.map((b) => b.largeShare));

  const feat = new Map();
  for (const r of rows) feat.set(r.type, (feat.get(r.type) || 0) + 1);
  const features = [...feat.entries()].sort((a, b) => b[1] - a[1]);
  const maxFeat = features[0][1];
  const maxYear = Math.max(...yearly.map((y) => y.count));

  story.monthly = monthly;
  story.yearly = yearly;
  story.points = window.STORY.points;
  story.largeMarkers = window.STORY.largeMarkers;

  put("n-total", n.toLocaleString());
  put("n-incidents", n.toLocaleString());
  put("n-wet", wetShare + "%");
  put("n-wet2", wetShare + "%");
  put("n-wet3", wetShare + "%");
  put("n-large", nLarge.toLocaleString());
  put("n-large-wet", largeWet + "%");
  put("n-large-wet2", largeWet + "%");
  put("n-month", MONTHS[peak.month - 1]);
  put("n-peak", peak.count.toLocaleString());
  put("n-peak2", peak.count.toLocaleString());
  put("n-peak3", peak.count.toLocaleString());
  put("n-jump", bins[bins.length - 1].largeShare);
  put("n-jump2", bins[bins.length - 1].largeShare);
  document.querySelectorAll(".n-threshold").forEach((el) => { el.textContent = threshold; });
  const one = document.getElementById("n-threshold");
  if (one) one.textContent = threshold;

  document.getElementById("year-chart").innerHTML = yearly.map((y) =>
    '<div class="year-col" title="' + y.year + ": " + y.count + '">' +
    '<i class="lg" style="height:' + (y.large / maxYear * 100) + '%"></i>' +
    '<i class="rest" style="height:' + ((y.count - y.large) / maxYear * 100) + '%"></i></div>'
  ).join("");

  document.getElementById("bins").innerHTML = bins.map((b) =>
    '<div class="bin"><div class="label">' + b.label + ' mm</div>' +
    '<div class="track"><span class="' + (b.label === "200+" ? "hot" : "") + '" style="width:' +
    Math.max(4, b.largeShare / maxShare * 100) + '%"></span></div>' +
    '<div class="meta">' + b.largeShare + '% large<small>' + b.count.toLocaleString() + " incidents</small></div></div>"
  ).join("");

  document.getElementById("feats").innerHTML = features.map(([type, count]) =>
    '<li><span class="row"><b>' + type + "</b><em>" + count.toLocaleString() + "</em></span>" +
    '<div class="hair"><span style="width:' + (count / maxFeat * 100) + '%"></span></div></li>'
  ).join("");

  fillYears();
  drawMonthChart();
  drawMap();
}

load().catch((err) => {
  document.getElementById("n-incidents").textContent = "CSV failed";
  console.error(err);
});

function fillYears() {
  fromEl.innerHTML = "";
  toEl.innerHTML = "";
  for (const year of story.yearly) {
    fromEl.add(new Option(year.year, year.year));
    toEl.add(new Option(year.year, year.year));
  }
  fromEl.value = String(story.yearly[0].year);
  toEl.value = String(story.yearly[story.yearly.length - 1].year);
}

function drawMap() {
  const [from, to] = range();
  const heat = story.points
    .filter((p) => p[2] >= from && p[2] <= to)
    .map((p) => [p[0], p[1], 0.45]);
  const pins = story.largeMarkers.filter((m) => m.year >= from && m.year <= to);
  countEl.textContent = heat.length.toLocaleString() + " on the map";
  if (map) { map.remove(); map = null; }
  map = L.map("map", {
    center: [22.35, 114.15],
    zoom: 11,
    scrollWheelZoom: false,
    minZoom: 10,
    maxZoom: 16,
  });
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles © Esri", maxZoom: 18 },
  ).addTo(map);
  if (heat.length) {
    L.heatLayer(heat, {
      radius: 16, blur: 18, minOpacity: 0.35,
      gradient: { 0.25: "#d7ebc0", 0.6: "#6fa32e", 1: "#2f5d1c" },
    }).addTo(map);
  }
  for (const pin of pins) {
    const rain = pin.rain == null ? "—" : pin.rain + " mm";
    L.circleMarker([pin.lat, pin.lon], {
      radius: Math.max(5, Math.min(14, pin.scale / 80)),
      color: "#ffffff", weight: 1.5, fillColor: "#c56a28", fillOpacity: 0.85,
    }).addTo(map).bindPopup(
      "<strong>" + esc(pin.date) + "</strong><br/>" +
      esc(pin.loc || "Hong Kong") + "<br/>" + pin.scale + " m³ · rain " + rain
    );
  }
  window.setTimeout(() => map.invalidateSize(), 80);
}

function drawMonthChart() {
  const rows = story.monthly;
  const W = 720, H = 280, pad = { l: 36, r: 40, t: 12, b: 26 };
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  const maxC = Math.max(...rows.map((r) => r.count));
  const maxR = Math.max(...rows.map((r) => r.meanRain));
  const slot = innerW / rows.length, barW = Math.min(28, slot * 0.55);
  const yCount = (v) => pad.t + innerH - (v / maxC) * innerH;
  const yRain = (v) => pad.t + innerH - (v / maxR) * innerH;
  const xOf = (i) => pad.l + slot * i + slot / 2;
  const grid = [0.25, 0.5, 0.75, 1].map((g) => {
    const y = pad.t + innerH * (1 - g);
    return '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '" stroke="#e6ebe7"/>';
  }).join("");
  const bars = rows.map((r, i) => {
    const x = xOf(i) - barW / 2;
    const rest = Math.max(0, r.count - r.large);
    const yRest = yCount(rest);
    const hRest = pad.t + innerH - yRest;
    const yLarge = yCount(r.count);
    return '<rect data-i="' + i + '" x="' + x + '" y="' + yRest + '" width="' + barW + '" height="' + hRest + '" fill="#6fa32e"/>' +
      '<rect data-i="' + i + '" x="' + x + '" y="' + yLarge + '" width="' + barW + '" height="' + (yRest - yLarge) + '" fill="#c56a28"/>';
  }).join("");
  const line = rows.map((r, i) => xOf(i) + "," + yRain(r.meanRain)).join(" ");
  const dots = rows.map((r, i) => '<circle data-i="' + i + '" cx="' + xOf(i) + '" cy="' + yRain(r.meanRain) + '" r="3" fill="#2c7eb8"/>').join("");
  const labels = rows.map((r, i) => '<text x="' + xOf(i) + '" y="' + (H - 6) + '" text-anchor="middle" fill="#8b948f" font-size="11">' + MONTHS[r.month - 1] + "</text>").join("");
  chartHost.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '">' + grid + bars +
    '<polyline points="' + line + '" fill="none" stroke="#2c7eb8" stroke-width="2"/>' + dots + labels + "</svg>";
  chartHost.querySelectorAll("[data-i]").forEach((node) => {
    node.addEventListener("mouseenter", (event) => showTip(event, Number(node.dataset.i)));
    node.addEventListener("mousemove", moveTip);
    node.addEventListener("mouseleave", () => { tipEl.style.display = "none"; });
  });
}

function range() {
  let from = Number(fromEl.value);
  let to = Number(toEl.value);
  if (from > to) {
    if (document.activeElement === fromEl) {
      to = from;
      toEl.value = String(to);
    } else {
      from = to;
      fromEl.value = String(from);
    }
  }
  return [from, to];
}

function esc(s) {
  const amp = "\u0026";
  return String(s)
    .replaceAll(amp, amp + "amp;")
    .replaceAll("\u003c", amp + "lt;")
    .replaceAll("\u003e", amp + "gt;")
    .replaceAll("\u0022", amp + "quot;");
}



function showTip(event, i) {
  const row = story.monthly[i];
  tipEl.innerHTML =
    "<strong>" + MONTHS[row.month - 1] + "</strong>" +
    "<span>" + row.count.toLocaleString() + " incidents · " + row.large + " large</span>" +
    "<em>Mean rain on those days: " + row.meanRain + " mm</em>";
  tipEl.style.display = "block";
  moveTip(event);
}

function moveTip(event) {
  const box = chartHost.getBoundingClientRect();
  let x = event.clientX - box.left + 12;
  let y = event.clientY - box.top + 12;
  if (x + tipEl.offsetWidth > box.width) x = event.clientX - box.left - tipEl.offsetWidth - 8;
  tipEl.style.left = x + "px";
  tipEl.style.top = y + "px";
}

fromEl.addEventListener("change", drawMap);
toEl.addEventListener("change", drawMap);
window.addEventListener("resize", () => { if (map) map.invalidateSize(); });

const DASHBOARD = window.DASHBOARD_DATA;
const GEOJSON = window.DASHBOARD_GEOJSON;
const provinces = [...DASHBOARD.provinces].sort((a, b) => a.provinsi.localeCompare(b.provinsi));
const national = DASHBOARD.national;
const byName = new Map(provinces.map((p) => [p.provinsi, p]));

const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

// Palet kontras di atas laut biru (kelas 1..5, rendah -> tinggi)
const MAP_PALETTE = ["#e3f2b5", "#a8dc8f", "#4fb87a", "#1a8a63", "#05503f"];
// Kelas 1-2 (warna terang) memakai teks gelap, kelas 3-5 teks putih
const MAP_LIGHT_TEXT_FROM_CLASS = 2;

const METRICS = {
  pkm_per100k: {
    label: "Puskesmas / 100.000 penduduk",
    short: "Pkm/100k",
    format: (v) => nf1.format(v),
    palette: MAP_PALETTE,
  },
  rs_per100k: {
    label: "RS / 100.000 penduduk",
    short: "RS/100k",
    format: (v) => nf2.format(v),
    palette: MAP_PALETTE,
  },
  desa_pkm_pct: {
    label: "Desa dengan puskesmas (%)",
    short: "Cakupan desa",
    format: (v) => `${nf1.format(v)}%`,
    palette: MAP_PALETTE,
  },
  faskes_per_1000km2: {
    label: "Faskes / 1.000 km²",
    short: "Faskes/km²",
    format: (v) => nf1.format(v),
    palette: MAP_PALETTE,
  },
  pkm_ratio_std: {
    label: "Rasio terhadap standar 1 : 30.000",
    short: "Rasio standar",
    format: (v) => `${nf2.format(v)}x`,
    palette: MAP_PALETTE,
  },
};

const PRIORITY_ORDER = [
  "Prioritas primary care",
  "Prioritas akses geografis",
  "Tantangan kepadatan",
  "Relatif seimbang",
];

const PRIORITY_CLASS = {
  "Prioritas primary care": "priority-primary",
  "Prioritas akses geografis": "priority-access",
  "Tantangan kepadatan": "priority-density",
  "Relatif seimbang": "priority-balanced",
};

const QUADRANT_COLORS = {
  "rendah-rendah": "#c85d55",
  "tinggi per kapita / rendah cakupan": "#3978a8",
  "rendah per kapita / tinggi cakupan": "#c58a2a",
  "tinggi-tinggi": "#2f8a68",
};

const CLUSTER_META = {
  "Menengah-Dasar": { color: "#4ca99a", description: "Profil mendekati median; kelompok terbesar." },
  "Cakupan Tinggi": { color: "#3978a8", description: "Cakupan desa dan RS per kapita relatif tinggi." },
  "Rasio Tinggi & Jarang": { color: "#c58a2a", description: "Puskesmas per kapita tinggi, tetapi akses geografis rendah." },
  "Metropolitan Jakarta": { color: "#c85d55", description: "Kepadatan faskes ekstrem dan RS sangat tinggi." },
};
const CLUSTER_ORDER = Object.keys(CLUSTER_META);

let selectedProvince = "all";
let map;
let geojsonLayer;
const layersByName = new Map();
let rankingChart;
let quadrantChart;
let clusterChart;
let coverageChart;
let giniChart;

Chart.defaults.font.family = "Inter, sans-serif";
Chart.defaults.color = "#718a98";
Chart.defaults.borderColor = "#e4efef";

function percentOrDash(value) {
  return Number.isFinite(value) ? `${nf1.format(value)}%` : "—";
}

function nf3(value) {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);
}

function getScale(metric, classes = 5) {
  const values = provinces
    .map((p) => p[metric])
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  const breaks = [values[0]];
  for (let i = 1; i < classes; i += 1) {
    breaks.push(values[Math.floor((i / classes) * (values.length - 1))]);
  }
  breaks.push(values[values.length - 1]);
  return { breaks, palette: MAP_PALETTE };
}

function classIndexFor(value, scale) {
  if (!Number.isFinite(value)) return -1;
  for (let i = 0; i < scale.breaks.length - 1; i += 1) {
    if (value <= scale.breaks[i + 1]) return i;
  }
  return scale.palette.length - 1;
}

function colorFor(value, scale) {
  const index = classIndexFor(value, scale);
  if (index < 0) return scale.palette[0];
  return scale.palette[Math.min(index, scale.palette.length - 1)];
}

function fillSelect() {
  const select = document.getElementById("provinceFilter");
  provinces.forEach((province) => {
    const option = document.createElement("option");
    option.value = province.provinsi;
    option.textContent = province.provinsi;
    select.appendChild(option);
  });
}

function updateKpis() {
  const isAll = selectedProvince === "all";
  const province = isAll ? null : byName.get(selectedProvince);
  const rs = isAll ? national.rs : province.total_rs_est;
  const rsSub = isAll
    ? `${nf0.format(national.rsu)} RSU + ${nf0.format(national.rsk)} RS Khusus`
    : `${nf0.format(province.rsu)} RSU + ${province.rsk == null ? "—" : nf0.format(province.rsk)} RS Khusus`;
  const pkm = isAll ? national.puskesmas : province.total_pkm;
  const pkmSub = isAll
    ? `${nf0.format(national.puskesmas)} puskesmas di 38 provinsi`
    : `${nf0.format(province.pkm_ri)} rawat inap + ${nf0.format(province.pkm_nri)} non-rawat inap`;
  const villages = isAll ? national.desa_tanpa_pkm : province["Jumlah Desa"] * (1 - province.desa_pkm_pct / 100);
  const villagesSub = isAll
    ? `${nf1.format(national.pct_desa_tanpa_pkm)}% dari ${nf0.format(national.desa)} desa`
    : `${percentOrDash(province.desa_pkm_pct)} desa memiliki puskesmas`;
  const standard = isAll ? `${national.provinsi_memenuhi_std} / ${national.provinsi}` : province.status_std;
  const standardSub = isAll
    ? "provinsi memenuhi standar"
    : `rasio ${nf2.format(province.pkm_ratio_std)}x standar`;

  document.getElementById("kpiRs").textContent = nf0.format(rs);
  document.getElementById("kpiRsSub").textContent = rsSub;
  document.getElementById("kpiPkm").textContent = nf0.format(pkm);
  document.getElementById("kpiPkmSub").textContent = pkmSub;
  document.getElementById("kpiVillages").textContent = nf0.format(villages);
  document.getElementById("kpiVillagesSub").textContent = villagesSub;
  document.getElementById("kpiStandard").textContent = standard;
  document.getElementById("kpiStandardSub").textContent = standardSub;
}

function detailCard(label, value) {
  return `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderCoverageBars(container, coverage) {
  const entries = Object.entries(coverage || {});
  container.innerHTML = entries
    .map(([label, value]) => {
      const safe = Number.isFinite(value) ? value : 0;
      return `<div class="coverage-bar">
        <span>${label}</span>
        <div class="track"><div class="fill" style="width:${Math.max(1.5, Math.min(100, safe))}%"></div></div>
        <strong>${Number.isFinite(value) ? `${nf2.format(value)}%` : "—"}</strong>
      </div>`;
    })
    .join("");
}

function updateDetail() {
  const nameEl = document.getElementById("detailName");
  const subEl = document.getElementById("detailSub");
  const badgeEl = document.getElementById("detailBadge");
  const bodyEl = document.getElementById("detailBody");
  const noteEl = document.getElementById("detailNote");
  const coverageEl = document.getElementById("detailCoverage");

  if (selectedProvince === "all") {
    const pkmPer100k = national.puskesmas / national.penduduk * 100000;
    const rsPer100k = national.rs / national.penduduk * 100000;
    nameEl.textContent = "Indonesia";
    subEl.textContent = "Ringkasan nasional";
    badgeEl.textContent = "Nasional";
    badgeEl.className = "badge";
    bodyEl.innerHTML = [
      detailCard("Penduduk", `${nf1.format(national.penduduk / 1e6)} juta`),
      detailCard("Desa/kelurahan", nf0.format(national.desa)),
      detailCard("Puskesmas / 100k", nf1.format(pkmPer100k)),
      detailCard("RS / 100k", nf2.format(rsPer100k)),
      detailCard("Gini puskesmas", nf2.format(national.gini_pkm_pc)),
      detailCard("Belum memenuhi standar", `${national.provinsi_belum_std} provinsi`),
    ].join("");
    noteEl.textContent = "Pilih provinsi pada peta, tabel, atau filter untuk melihat detail dan prioritasnya.";
    renderCoverageBars(coverageEl, Object.fromEntries(Object.entries(national.coverage).map(([key, value]) => [key, value.pct])));
    return;
  }

  const p = byName.get(selectedProvince);
  nameEl.textContent = p.provinsi;
  subEl.textContent = `Peringkat ${p.rank_pkm_per100k}/38 rasio puskesmas per kapita`;
  badgeEl.textContent = p.prioritas;
  badgeEl.className = "badge";
  bodyEl.innerHTML = [
    detailCard("Penduduk", `${nf1.format(p.pop / 1e6)} juta`),
    detailCard("Kepadatan", `${nf0.format(p["Kepadatan Penduduk per km persegi (Km2)"])} jiwa/km²`),
    detailCard("Puskesmas / 100k", nf1.format(p.pkm_per100k)),
    detailCard("RS / 100k", nf2.format(p.rs_per100k)),
    detailCard("Cakupan desa puskesmas", percentOrDash(p.desa_pkm_pct)),
    detailCard("Faskes / 1.000 km²", nf1.format(p.faskes_per_1000km2)),
    detailCard("Kekurangan puskesmas", `${nf1.format(p.kekurangan_pkm)} unit`),
    detailCard("Rasio standar", `${nf2.format(p.pkm_ratio_std)}x`),
    detailCard("Klaster", p.cluster_label || "—"),
  ].join("");
  noteEl.textContent = p.rsk_missing
    ? "Nilai RS Khusus tidak tersedia; total RS memakai estimasi RS Khusus = 0."
    : "Data faskes menunjukkan keberadaan sarana, bukan waktu tempuh atau akses efektif.";
  renderCoverageBars(coverageEl, p.coverage);
}

function metricTooltip(feature, metric) {
  const value = feature.properties[metric];
  return `<b>${provinceNameOf(feature.properties)}</b><br>${METRICS[metric].label}: ${METRICS[metric].format(value)}`;
}

/* ------------------------------------------------------------------ *
 * Peta: style polygon, label provinsi (point on surface), zoom rules
 * ------------------------------------------------------------------ */

const PROVINCE_ABBR = {
  "DKI Jakarta": "DKI",
  Banten: "BTN",
  "Jawa Barat": "JBR",
  "Jawa Tengah": "JTG",
  "DI Yogyakarta": "DIY",
  "Jawa Timur": "JTM",
  Bali: "BALI",
  "Nusa Tenggara Barat": "NTB",
  "Nusa Tenggara Timur": "NTT",
};

const LABEL_MIN_VERTICES = 60;
const LABEL_BIG_ZOOM_LE = 5;
const LABEL_ABBR_ZOOM = 6;

const labelState = {
  items: [],
  metric: null,
  scale: null,
};

function provinceArea(feature) {
  const cached = feature.__area;
  if (Number.isFinite(cached)) return cached;
  let total = 0;
  const ringArea = (ring) => {
    let sum = 0;
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % n];
      sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum / 2);
  };
  const walk = (coords) => {
    if (!Array.isArray(coords) || !Array.isArray(coords[0])) return;
    if (typeof coords[0][0] === "number") {
      total += ringArea(coords);
      return;
    }
    coords.forEach(walk);
  };
  walk(feature.geometry.coordinates);
  feature.__area = total;
  return total;
}

function countVertices(feature) {
  if (Number.isFinite(feature.__vertices)) return feature.__vertices;
  let total = 0;
  const walk = (coords) => {
    if (!Array.isArray(coords) || !Array.isArray(coords[0])) return;
    if (typeof coords[0][0] === "number") {
      total += coords.length;
      return;
    }
    coords.forEach(walk);
  };
  walk(feature.geometry.coordinates);
  feature.__vertices = total;
  return total;
}

/**
 * Ambil nama provinsi dari properti GeoJSON dengan toleransi kapitalisasi
 * (PROVINSI / Provinsi / provinsi / name / NAMA), lalu normalisasi.
 */
function provinceNameOf(properties) {
  if (!properties) return "";
  const keys = ["PROVINSI", "Provinsi", "provinsi", "PROVINCE", "Province", "name", "NAME", "Name", "NAMA", "nama"];
  let raw = "";
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) {
      raw = value.trim();
      break;
    }
  }
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const upper = cleaned.toUpperCase();
  if (upper === "DKI JAKARTA" || upper === "DAERAH KHUSUS IBUKOTA JAKARTA") return "DKI Jakarta";
  if (upper === "DI YOGYAKARTA" || upper === "D.I. YOGYAKARTA" || upper === "DAERAH ISTIMEWA YOGYAKARTA") {
    return "DI Yogyakarta";
  }
  if (upper === "BANGKA BELITUNG" || upper === "KEPULAUAN BANGKA BELITUNG") return "Kepulauan Bangka Belitung";
  return cleaned;
}

function abbreviationFor(name) {
  const labelled = name.startsWith("Kepulauan ") ? name.slice("Kepulauan ".length) : name;
  return PROVINCE_ABBR[name] || PROVINCE_ABBR[labelled] || labelled;
}

/** Implementasi turf.pointOnFeature (polylabel) tanpa dependency eksternal. */
function turfPointOnFeature(feature) {
  const geom = feature.geometry;
  if (!geom) return null;
  let polygons = [];
  if (geom.type === "Polygon") polygons = [geom.coordinates];
  else if (geom.type === "MultiPolygon") polygons = geom.coordinates;
  if (!polygons.length) return null;

  let best = null;
  polygons.forEach((rings) => {
    if (!rings.length) return;
    const cell = polylabel(rings, 1e-4);
    if (!best || cell.d > best.d) best = cell;
  });
  if (!best) return null;
  return L.latLng(best.y, best.x);
}

function polylabel(rings, precision = 1e-4) {
  const outer = rings[0];
  const holes = rings.slice(1);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  outer.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });
  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || (width === 0 && height === 0)) {
    return { x: minX, y: minY, d: 0 };
  }

  const pointToPolygonDist = (x, y) => {
    let inside = false;
    let dist = Infinity;
    const all = [outer, ...holes];
    all.forEach((ring) => {
      for (let i = 0, len = ring.length, j = len - 1; i < len; j = i, i += 1) {
        const a = ring[i];
        const b = ring[j];
        if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
          inside = !inside;
        }
        dist = Math.min(dist, segmentDistance(x, y, a[0], a[1], b[0], b[1]));
      }
    });
    return (inside ? 1 : -1) * Math.sqrt(dist);
  };

  const cellSize = Math.min(width, height);
  if (!(cellSize > 0)) return { x: minX, y: minY, d: 0 };
  let h = cellSize / 2;

  const queue = [];
  const bboxCenter = [(minX + maxX) / 2, (minY + maxY) / 2];
  const bboxCell = {
    x: bboxCenter[0] - h,
    y: bboxCenter[1] - h,
    h,
    d: pointToPolygonDist(bboxCenter[0], bboxCenter[1]),
    max: 0,
  };
  bboxCell.max = bboxCell.d + bboxCell.h * Math.SQRT2;

  const compare = (a, b) => b.max - a.max;
  const push = (cell) => {
    let low = 0;
    let high = queue.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (compare(cell, queue[mid]) < 0) low = mid + 1;
      else high = mid;
    }
    queue.splice(low, 0, cell);
  };

  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      const cell = { x: x + h, y: y + h, h, d: pointToPolygonDist(x + h, y + h), max: 0 };
      cell.max = cell.d + cell.h * Math.SQRT2;
      push(cell);
    }
  }
  push(bboxCell);

  let bestCell = bboxCell;
  while (queue.length) {
    const cell = queue.shift(); // eslint-disable-line no-await-in-loop
    if (cell.d > bestCell.d) bestCell = cell;
    if (cell.max - bestCell.d <= precision) continue;
    h = cell.h / 2;
    [
      [cell.x - h, cell.y - h],
      [cell.x + h, cell.y - h],
      [cell.x - h, cell.y + h],
      [cell.x + h, cell.y + h],
    ].forEach(([cx, cy]) => {
      const next = { x: cx, y: cy, h, d: pointToPolygonDist(cx, cy), max: 0 };
      next.max = next.d + next.h * Math.SQRT2;
      push(next);
    });
  }
  return bestCell;
}

function segmentDistance(px, py, ax, ay, bx, by) {
  let x = ax;
  let y = ay;
  let dx = bx - ax;
  let dy = by - ay;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = bx;
      y = by;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

function buildLabelIndex() {
  labelState.items = geojsonLayer
    .getLayers()
    .map((layer) => {
      const feature = layer.feature;
      const full = provinceNameOf(feature.properties);
      const pinLatLng = turfPointOnFeature(feature);
      if (!pinLatLng) return null;
      return {
        full,
        abbr: abbreviationFor(full),
        big: countVertices(feature) >= LABEL_MIN_VERTICES,
        area: provinceArea(feature),
        pinLatLng,
        layer,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.area - a.area);
}

/** Label utama tiap provinsi (dipakai untuk cek overlap antar provinsi). */
function mainTooltip(item) {
  if (!item.mainTip) {
    item.mainTip = L.tooltip({
      permanent: true,
      direction: "center",
      className: "prov-label",
      interactive: false,
      keyboard: false,
      opacity: 1,
    });
    item.mainTip.setLatLng(item.pinLatLng);
  }
  return item.mainTip;
}

function setLabelText(tip, text, light, small) {
  const classes = ["prov-label"];
  if (light) classes.push("prov-label--light");
  if (small) classes.push("prov-label--small");
  tip.setContent(`<span>${text}</span>`);
  const el = tip.getElement();
  if (el) {
    el.className = `leaflet-tooltip ${classes.join(" ")}`;
  }
}

function renderProvinceLabels() {
  const zoom = map.getZoom();
  const mode = zoom <= LABEL_BIG_ZOOM_LE ? "big" : zoom <= LABEL_ABBR_ZOOM ? "abbr" : "full";
  const metric = labelState.metric;
  const scale = labelState.scale;

  // matikan semua label dulu
  labelState.items.forEach((item) => {
    if (item.mainTip) item.mainTip.remove();
  });

  const accepted = [];
  labelState.items.forEach((item) => {
    if (mode === "big" && !item.big) return;
    const text = mode === "big" ? item.full : mode === "abbr" ? item.abbr : item.full;
    const value = item.layer.feature.properties[metric];
    const classIndex = scale ? classIndexFor(value, scale) : 0;
    const light = classIndex >= MAP_LIGHT_TEXT_FROM_CLASS;
    const small = mode === "big";

    const tip = mainTooltip(item);
    setLabelText(tip, text, light, small);
    tip.addTo(map);

    const el = tip.getElement();
    const widthPx = el ? el.offsetWidth || text.length * 6 : text.length * 6;
    const heightPx = el ? el.offsetHeight || 14 : 14;
    const point = map.project(item.pinLatLng, zoom);
    const box = {
      left: point.x - widthPx / 2 - 2,
      right: point.x + widthPx / 2 + 2,
      top: point.y - heightPx / 2 - 1,
      bottom: point.y + heightPx / 2 + 1,
    };
    const overlap = accepted.some(
      (other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
    );
    if (overlap) {
      tip.remove();
      return;
    }
    accepted.push(box);
  });
}

function refreshLabelStyles() {
  const metric = labelState.metric;
  const scale = labelState.scale;
  if (!metric || !scale) return;
  labelState.items.forEach((item) => {
    if (!item.mainTip || !map.hasLayer(item.mainTip)) return;
    const value = item.layer.feature.properties[metric];
    const light = classIndexFor(value, scale) >= MAP_LIGHT_TEXT_FROM_CLASS;
    const el = item.mainTip.getElement();
    if (!el) return;
    el.classList.toggle("prov-label--light", light);
  });
}

/**
 * Batas Indonesia versi rapat (Sabang sampai Merauke) supaya Indonesia
 * mengisi container tanpa menyisakan laut kosong besar.
 */
const INDONESIA_FIT_BOUNDS = L.latLngBounds([-11.05, 95.0], [6.0, 141.05]);
const JAVA_FIT_BOUNDS = L.latLngBounds([-9.0, 105.2], [-5.7, 114.6]);

let pendingFit = null; // permintaan fitBounds yang ditunda sampai layout stabil

/**
 * Fit bounds ke container (padding seragam [10, 10] pada sumbu pembatas).
 * Leaflet menyisakan ruang kosong di sumbu lain saat snap ke level zoom,
 * jadi bounds dilebarkan di sumbu tersebut sampai peta memenuhi container.
 */
function fitMapToBounds(bounds, options = {}) {
  if (!map.getSize().x) {
    pendingFit = [bounds, options];
    return;
  }
  map.invalidateSize({ animate: false });
  const pad = 10;
  const size = map.getSize();
  let zoom = map.getBoundsZoom(bounds, false, L.point(pad, pad));
  if (options.maxZoom) zoom = Math.min(zoom, options.maxZoom);

  // px ukuran bounds pada zoom target dan ruang yang tersedia
  const nw = map.project(bounds.getNorthWest(), zoom);
  const se = map.project(bounds.getSouthEast(), zoom);
  const bw = Math.max(se.x - nw.x, 1);
  const bh = Math.max(se.y - nw.y, 1);
  const availW = Math.max(size.x - pad * 2, 1);
  const availH = Math.max(size.y - pad * 2, 1);

  let extraX = 0;
  let extraY = 0;
  if (bw / bh > availW / availH) {
    // sumbu horizontal yang membatasi -> lebarkan vertikal agar penuh
    extraY = (bh * (availW / bw) - bh) / 2;
  } else {
    extraX = (bw * (availH / bh) - bw) / 2;
  }

  const center = L.point((nw.x + se.x) / 2, (nw.y + se.y) / 2);
  const halfW = bw / 2 + extraX;
  const halfH = bh / 2 + extraY;
  const expanded = L.latLngBounds(
    map.unproject([center.x - halfW, center.y + halfH], zoom), // south-west
    map.unproject([center.x + halfW, center.y - halfH], zoom) // north-east
  );

  map.fitBounds(expanded, { padding: [pad, pad], animate: false, maxZoom: zoom });
}

function resetMapView() {
  fitMapToBounds(INDONESIA_FIT_BOUNDS);
}

function focusJava() {
  fitMapToBounds(JAVA_FIT_BOUNDS, { maxZoom: 7 });
}

function updateMap() {
  const metric = document.getElementById("metricSelect").value;
  const config = METRICS[metric];
  const scale = getScale(metric);
  labelState.metric = metric;
  labelState.scale = scale;

  geojsonLayer.eachLayer((layer) => {
    const feature = layer.feature;
    const selected = provinceNameOf(feature.properties) === selectedProvince;
    layer.setStyle({
      fillColor: colorFor(feature.properties[metric], scale),
      fillOpacity: 0.95,
      color: selected ? "#f59e0b" : "#ffffff",
      weight: selected ? 3 : 1.2,
    });
    // JANGAN pakai layer.off("mouseover") di sini: itu ikut menghapus handler
    // internal Leaflet yang membuka tooltip. Isi tooltip sudah di-refresh oleh
    // handler permanen di onEachFeature (memakai metric terbaru).
  });

  document.getElementById("mapLegend").innerHTML = scale.breaks
    .slice(0, -1)
    .map((start, index) => {
      const end = scale.breaks[index + 1];
      return `<span class="legend-item"><i class="legend-swatch" style="background:${scale.palette[index]};border:1px solid #0b3d35"></i>${config.format(start)}–${config.format(end)}</span>`;
    })
    .join("");

  renderProvinceLabels();
  refreshLabelStyles();

  if (pendingFit) {
    fitMapToBounds(...pendingFit);
    pendingFit = null;
  }
}

function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: false,
    minZoom: 3,
    maxBoundsViscosity: 0.4,
  });

  geojsonLayer = L.geoJSON(GEOJSON, {
    style: (feature) => {
      const metric = document.getElementById("metricSelect").value;
      const scale = getScale(metric);
      const selected = provinceNameOf(feature.properties) === selectedProvince;
      return {
        fillColor: colorFor(feature.properties[metric], scale),
        fillOpacity: 0.95,
        color: selected ? "#f59e0b" : "#ffffff",
        weight: selected ? 3 : 1.2,
      };
    },
    onEachFeature: (feature, layer) => {
      const name = provinceNameOf(feature.properties);
      layersByName.set(name, layer);
      layer.bindTooltip(metricTooltip(feature, document.getElementById("metricSelect").value), {
        sticky: true,
        direction: "top",
        opacity: 1,
        className: "prov-hover-tip",
      });
      layer.on("mouseover", () => {
        layer.setTooltipContent(metricTooltip(feature, document.getElementById("metricSelect").value));
        layer.setStyle({ weight: 3, color: "#0b3d35" });
        layer.bringToFront();
      });
      layer.on("mouseout", () => {
        const metric = document.getElementById("metricSelect").value;
        const selected = name === selectedProvince;
        geojsonLayer.resetStyle(layer);
        layer.setStyle({
          fillColor: colorFor(feature.properties[metric], labelState.scale || getScale(metric)),
          fillOpacity: 0.95,
          color: selected ? "#f59e0b" : "#ffffff",
          weight: selected ? 3 : 1.2,
        });
      });
      layer.on("click", () => selectProvince(name, true));
    },
  }).addTo(map);

  buildLabelIndex();
  resetMapView();
  map.on("zoomend", () => {
    if (labelState.items.length) renderProvinceLabels();
  });
  map.whenReady(() => {
    map.invalidateSize();
    resetMapView();
    renderProvinceLabels();
  });
  updateMap();
}

function rankingRows(metric, direction) {
  return provinces
    .filter((p) => Number.isFinite(p[metric]))
    .sort((a, b) => direction === "low" ? a[metric] - b[metric] : b[metric] - a[metric])
    .slice(0, 10);
}

function buildRankingChart() {
  const metric = document.getElementById("rankingMetric").value;
  const direction = document.getElementById("rankingDirection").value;
  const rows = rankingRows(metric, direction);
  const config = METRICS[metric];
  const ctx = document.getElementById("rankingChart");

  if (rankingChart) rankingChart.destroy();
  rankingChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: rows.map((p) => p.provinsi),
      datasets: [{
        data: rows.map((p) => p[metric]),
        backgroundColor: rows.map((p) => {
          if (metric === "pkm_ratio_std" && p[metric] < 1) return "#d9776f";
          return "#4ca99a";
        }),
        borderRadius: 4,
        maxBarThickness: 18,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${config.short}: ${config.format(context.raw)}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "#edf4f4" },
          ticks: { font: { size: 9 }, callback: (value) => config.format(value) },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 9 } },
        },
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        selectProvince(rows[elements[0].index].provinsi, true);
      },
    },
  });
}

const medianPlugin = {
  id: "medianLines",
  afterDatasetsDraw(chart) {
    const medians = chart.options.plugins.medianLines;
    if (!medians) return;
    const { ctx, chartArea, scales } = chart;
    ctx.save();
    ctx.strokeStyle = "#9db2b7";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    if (Number.isFinite(medians.x)) {
      const x = scales.x.getPixelForValue(medians.x);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
    }
    if (Number.isFinite(medians.y)) {
      const y = scales.y.getPixelForValue(medians.y);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
    }
    ctx.restore();
  },
};

function buildScatterChart() {
  const groups = {};
  Object.keys(QUADRANT_COLORS).forEach((key) => { groups[key] = []; });
  provinces.forEach((p) => groups[p.kuadran].push({ x: p.pkm_per100k, y: p.desa_pkm_pct, provinsi: p.provinsi }));

  const ctx = document.getElementById("quadrantChart");
  if (quadrantChart) quadrantChart.destroy();
  quadrantChart = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: Object.entries(groups).map(([key, data]) => ({
        label: key,
        data,
        backgroundColor: QUADRANT_COLORS[key],
        borderColor: "#ffffff",
        borderWidth: 1.5,
        pointRadius: 5,
        pointHoverRadius: 7,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        medianLines: {
          x: national.median_pkm_per100k,
          y: national.median_cakupan_pkm,
        },
        tooltip: {
          callbacks: {
            title: (items) => items[0].raw.provinsi,
            label: (context) => [
              `Puskesmas/100k: ${nf1.format(context.raw.x)}`,
              `Cakupan desa: ${percentOrDash(context.raw.y)}`,
            ],
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Puskesmas per 100.000 penduduk", font: { size: 9 } },
          grid: { color: "#edf4f4" },
          ticks: { font: { size: 9 } },
        },
        y: {
          title: { display: true, text: "% desa memiliki puskesmas", font: { size: 9 } },
          grid: { color: "#edf4f4" },
          ticks: { font: { size: 9 }, callback: (value) => `${value}%` },
        },
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const item = quadrantChart.data.datasets[elements[0].datasetIndex].data[elements[0].index];
        selectProvince(item.provinsi, true);
      },
    },
    plugins: [medianPlugin],
  });

  document.getElementById("quadrantLegend").innerHTML = Object.entries(QUADRANT_COLORS)
    .map(([key, color]) => `<span><i class="dot" style="background:${color}"></i>${key}</span>`)
    .join("");
}

function buildClusterChart() {
  const rows = provinces.filter((p) => Number.isFinite(p.pc1) && Number.isFinite(p.pc2) && p.cluster_label);
  const groups = {};
  CLUSTER_ORDER.forEach((label) => { groups[label] = []; });
  rows.forEach((p) => {
    if (!groups[p.cluster_label]) groups[p.cluster_label] = [];
    groups[p.cluster_label].push({
      x: p.pc1,
      y: p.pc2,
      provinsi: p.provinsi,
      cluster_label: p.cluster_label,
      pkm_per100k: p.pkm_per100k,
      rs_per100k: p.rs_per100k,
      desa_pkm_pct: p.desa_pkm_pct,
    });
  });

  const ctx = document.getElementById("clusterChart");
  const legendEl = document.getElementById("clusterLegend");
  if (!ctx) return;
  if (!rows.length) {
    ctx.parentElement.innerHTML = '<p class="note">Data segmentasi belum tersedia. Jalankan <code>python src/build_from_csv.py</code>, lalu muat ulang halaman.</p>';
    if (legendEl) legendEl.innerHTML = '<p class="note">Data klaster tidak ditemukan.</p>';
    console.warn("Data segmentasi kosong: periksa outputs/tables/anggota_klaster.csv dan dashboard/data/dashboard-data.js.");
    return;
  }
  if (clusterChart) clusterChart.destroy();
  clusterChart = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: Object.entries(groups)
        .filter(([, data]) => data.length)
        .map(([label, data]) => ({
          label,
          data,
          backgroundColor: (CLUSTER_META[label] || { color: "#6c8a92" }).color,
          borderColor: "#ffffff",
          borderWidth: 1.5,
          pointRadius: 6,
          pointHoverRadius: 8,
        })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].raw.provinsi,
            label: (context) => {
              const p = context.raw;
              return [
                p.cluster_label,
                `Puskesmas/100k: ${nf1.format(p.pkm_per100k)}`,
                `RS/100k: ${nf2.format(p.rs_per100k)}`,
                `Cakupan desa: ${percentOrDash(p.desa_pkm_pct)}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Komponen utama 1 (PC1)", font: { size: 9 } },
          grid: { color: "#edf4f4" },
          ticks: { font: { size: 9 } },
        },
        y: {
          title: { display: true, text: "Komponen utama 2 (PC2)", font: { size: 9 } },
          grid: { color: "#edf4f4" },
          ticks: { font: { size: 9 } },
        },
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const item = clusterChart.data.datasets[elements[0].datasetIndex].data[elements[0].index];
        selectProvince(item.provinsi, true);
      },
    },
  });

  if (legendEl) {
    legendEl.innerHTML = CLUSTER_ORDER
      .map((label) => {
        const count = rows.filter((p) => p.cluster_label === label).length;
        const meta = CLUSTER_META[label] || { color: "#6c8a92", description: "" };
        return `<div class="cluster-legend-row">
          <i class="dot" style="background:${meta.color}"></i>
          <div><b>${label}</b><small>${meta.description}</small></div>
          <strong>${count}</strong>
        </div>`;
      })
      .join("");
  }
}

function buildCoverageChart() {
  const entries = Object.entries(national.coverage)
    .map(([label, value]) => ({ label, value: value.pct }))
    .sort((a, b) => b.value - a.value);
  const ctx = document.getElementById("coverageChart");
  if (coverageChart) coverageChart.destroy();
  coverageChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: entries.map((item) => item.label),
      datasets: [{
        data: entries.map((item) => item.value),
        backgroundColor: entries.map((item, index) => index === 0 ? "#237b72" : index === entries.length - 1 ? "#d9776f" : "#8dd4bd"),
        borderRadius: 4,
        maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `${nf2.format(context.raw)}% desa`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "#edf4f4" },
          ticks: { font: { size: 9 }, callback: (value) => `${value}%` },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 9 } },
        },
      },
    },
  });
}

function buildGiniChart() {
  const data = [
    national.gini_rs_abs,
    national.gini_rs_pc,
    national.gini_pkm_abs,
    national.gini_pkm_pc,
  ];
  const ctx = document.getElementById("giniChart");
  if (giniChart) giniChart.destroy();
  giniChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["RS absolut", "RS per kapita", "Puskesmas absolut", "Puskesmas per kapita"],
      datasets: [{
        data,
        backgroundColor: ["#1e4e74", "#8fb7d2", "#0d4a4c", "#8dd4bd"],
        borderRadius: 5,
        maxBarThickness: 42,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Gini ${nf3(context.raw)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 0.65,
          grid: { color: "#edf4f4" },
          ticks: { font: { size: 9 } },
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 } },
        },
      },
    },
  });
  document.getElementById("top5Pop").textContent = percentOrDash(national.top5_share_pop);
  document.getElementById("top5Rs").textContent = percentOrDash(national.top5_share_rs);
  document.getElementById("top5Pkm").textContent = percentOrDash(national.top5_share_pkm);
  document.getElementById("giniNote").textContent =
    `Gini RS turun dari ${nf2.format(national.gini_rs_abs)} menjadi ${nf2.format(national.gini_rs_pc)} setelah dihitung per kapita; puskesmas turun dari ${nf2.format(national.gini_pkm_abs)} menjadi ${nf2.format(national.gini_pkm_pc)}.`;
}

function renderTable() {
  const filter = document.getElementById("priorityFilter").value;
  const rows = provinces
    .filter((p) => filter === "all" || p.prioritas === filter)
    .sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER.indexOf(a.prioritas) - PRIORITY_ORDER.indexOf(b.prioritas);
      return priorityDiff !== 0 ? priorityDiff : b.pop - a.pop;
    });

  document.getElementById("priorityTableBody").innerHTML = rows
    .map((p) => {
      const selected = p.provinsi === selectedProvince ? " selected" : "";
      return `<tr class="${selected}" data-province="${p.provinsi}">
        <td><b>${p.provinsi}</b></td>
        <td><span class="priority-tag ${PRIORITY_CLASS[p.prioritas]}">${p.prioritas}</span></td>
        <td>${nf1.format(p.pkm_per100k)}</td>
        <td>${percentOrDash(p.desa_pkm_pct)}</td>
        <td>${nf1.format(p.kekurangan_pkm)}</td>
        <td class="${p.status_std === "Memenuhi" ? "status-good" : "status-bad"}">${p.status_std}</td>
      </tr>`;
    })
    .join("");
}

function updateSelectionUi() {
  updateKpis();
  updateDetail();
  updateMap();
  renderTable();
  document.getElementById("provinceFilter").value = selectedProvince;
}

function selectProvince(name, zoom = false) {
  selectedProvince = name === "all" || byName.has(name) ? name : "all";
  updateSelectionUi();

  if (selectedProvince === "all") {
    resetMapView();
    return;
  }

  if (zoom) {
    const layer = layersByName.get(selectedProvince);
    if (layer) map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 7 });
  }
}

function initNav() {
  const links = [...document.querySelectorAll("#sidebarNav .nav-link")];
  const targets = links
    .map((link) => ({ link, target: document.getElementById(link.dataset.target) }))
    .filter((item) => item.target);
  let ticking = false;
  let scrollSpyLocked = false;
  let scrollSpyLockTimer = null;
  let lastClickedLink = null;

  function setActive(activeLink) {
    if (!activeLink) return;
    links.forEach((link) => {
      const isActive = link === activeLink;
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function updateActiveFromScroll() {
    if (scrollSpyLocked) return;
    const offset = Math.min(140, window.innerHeight * 0.18);
    let current = targets[0];
    targets.forEach((item) => {
      if (item.target.getBoundingClientRect().top <= offset) current = item;
    });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = targets[targets.length - 1];
    }
    if (current) setActive(current.link);
  }

  function scheduleScrollSpy() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      updateActiveFromScroll();
    });
  }

  function lockScrollSpy(link) {
    scrollSpyLocked = true;
    lastClickedLink = link;
    if (scrollSpyLockTimer) window.clearTimeout(scrollSpyLockTimer);
    scrollSpyLockTimer = window.setTimeout(() => {
      scrollSpyLocked = false;
      setActive(lastClickedLink);
    }, 1200);
  }

  function releaseScrollSpy() {
    if (!scrollSpyLocked) return;
    scrollSpyLocked = false;
    if (scrollSpyLockTimer) window.clearTimeout(scrollSpyLockTimer);
    setActive(lastClickedLink);
  }

  function unlockScrollSpy() {
    if (!scrollSpyLocked) return;
    scrollSpyLocked = false;
    if (scrollSpyLockTimer) window.clearTimeout(scrollSpyLockTimer);
  }

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      lockScrollSpy(link);
      setActive(link);
      const target = document.getElementById(link.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  window.addEventListener("scroll", scheduleScrollSpy, { passive: true });
  window.addEventListener("resize", scheduleScrollSpy);
  window.addEventListener("scrollend", releaseScrollSpy, { passive: true });
  ["wheel", "touchstart", "keydown"].forEach((eventName) => {
    window.addEventListener(eventName, unlockScrollSpy, { passive: true });
  });
  updateActiveFromScroll();
}

function initEvents() {
  document.getElementById("provinceFilter").addEventListener("change", (event) => {
    selectProvince(event.target.value, event.target.value !== "all");
  });
  document.getElementById("metricSelect").addEventListener("change", updateMap);
  document.getElementById("mapResetView").addEventListener("click", resetMapView);
  document.getElementById("mapFocusJava").addEventListener("click", focusJava);
  document.getElementById("rankingMetric").addEventListener("change", buildRankingChart);
  document.getElementById("rankingDirection").addEventListener("change", buildRankingChart);
  document.getElementById("priorityFilter").addEventListener("change", renderTable);
  document.getElementById("priorityTableBody").addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-province]");
    if (row) selectProvince(row.dataset.province, true);
  });
}

fillSelect();
initMap();
window.dashboardMap = map;
window.dashboardGeojson = geojsonLayer;
initEvents();
initNav();
updateSelectionUi();
buildRankingChart();
buildScatterChart();
buildClusterChart();
buildCoverageChart();
buildGiniChart();

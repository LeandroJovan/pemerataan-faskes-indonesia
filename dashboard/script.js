const DASHBOARD = window.DASHBOARD_DATA;
const GEOJSON = window.DASHBOARD_GEOJSON;
const provinces = [...DASHBOARD.provinces].sort((a, b) => a.provinsi.localeCompare(b.provinsi));
const national = DASHBOARD.national;
const byName = new Map(provinces.map((p) => [p.provinsi, p]));

const nf0 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

const METRICS = {
  pkm_per100k: {
    label: "Puskesmas / 100.000 penduduk",
    short: "Pkm/100k",
    format: (v) => nf1.format(v),
    palette: ["#edf8f2", "#c7ead9", "#8dd4bd", "#4ca99a", "#237b72", "#0d4a4c"],
  },
  rs_per100k: {
    label: "RS / 100.000 penduduk",
    short: "RS/100k",
    format: (v) => nf2.format(v),
    palette: ["#eef4f9", "#cfe1ef", "#a1c5de", "#6ba1c8", "#3978a8", "#1e4e74"],
  },
  desa_pkm_pct: {
    label: "Desa dengan puskesmas (%)",
    short: "Cakupan desa",
    format: (v) => `${nf1.format(v)}%`,
    palette: ["#fff7e8", "#fbe6b9", "#f1cd7e", "#dba94b", "#b98326", "#8d6217"],
  },
  faskes_per_1000km2: {
    label: "Faskes / 1.000 km²",
    short: "Faskes/km²",
    format: (v) => nf1.format(v),
    palette: ["#f5eff8", "#e2d2ec", "#c7addb", "#a47cc2", "#7f52a3", "#5b347c"],
  },
  pkm_ratio_std: {
    label: "Rasio terhadap standar 1 : 30.000",
    short: "Rasio standar",
    format: (v) => `${nf2.format(v)}x`,
    palette: ["#fff0ec", "#f7cfc5", "#eda99a", "#dc7b6e", "#bc514a", "#913330"],
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

let selectedProvince = "all";
let map;
let geojsonLayer;
const layersByName = new Map();
let rankingChart;
let quadrantChart;
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
  return { breaks, palette: METRICS[metric].palette };
}

function colorFor(value, scale) {
  if (!Number.isFinite(value)) return "#c9d8d9";
  for (let i = 0; i < scale.breaks.length - 1; i += 1) {
    if (value <= scale.breaks[i + 1]) return scale.palette[i];
  }
  return scale.palette[scale.palette.length - 1];
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
  const villages = isAll
    ? national.desa_dengan_pkm
    : province["Jumlah Desa"] * province.desa_pkm_pct / 100;
  const villagesSub = isAll
    ? `${nf2.format(national.pct_desa_dengan_pkm)}% dari ${nf0.format(national.desa)} desa`
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
  document.getElementById("nationalPkmWithout").textContent = `${nf2.format(national.pct_desa_tanpa_pkm)}%`;
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
  ].join("");
  noteEl.textContent = p.rsk_missing
    ? "Nilai RS Khusus tidak tersedia; total RS memakai estimasi RS Khusus = 0."
    : "Data faskes menunjukkan keberadaan sarana, bukan waktu tempuh atau akses efektif.";
  renderCoverageBars(coverageEl, p.coverage);
}

function metricTooltip(feature, metric) {
  const value = feature.properties[metric];
  return `<b>${feature.properties.name}</b><br>${METRICS[metric].label}: ${METRICS[metric].format(value)}`;
}

function updateMap() {
  const metric = document.getElementById("metricSelect").value;
  const config = METRICS[metric];
  const scale = getScale(metric);

  geojsonLayer.eachLayer((layer) => {
    const feature = layer.feature;
    const selected = feature.properties.name === selectedProvince;
    layer.setStyle({
      fillColor: colorFor(feature.properties[metric], scale),
      fillOpacity: 0.88,
      color: selected ? "#0b3d42" : "#ffffff",
      weight: selected ? 2.2 : 0.65,
    });
    layer.off("mouseover");
    layer.on("mouseover", () => layer.setTooltipContent(metricTooltip(feature, metric)));
  });

  document.getElementById("legendTitle").textContent = config.label;
  document.getElementById("mapLegend").innerHTML = scale.breaks
    .slice(0, -1)
    .map((start, index) => {
      const end = scale.breaks[index + 1];
      return `<span class="legend-item"><i class="legend-swatch" style="background:${scale.palette[index]}"></i>${config.format(start)}–${config.format(end)}</span>`;
    })
    .join("");
}

function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: false,
    minZoom: 3,
  });
  map.setView([-2.4, 118], 4.4);

  geojsonLayer = L.geoJSON(GEOJSON, {
    style: (feature) => {
      const metric = document.getElementById("metricSelect").value;
      const scale = getScale(metric);
      const selected = feature.properties.name === selectedProvince;
      return {
        fillColor: colorFor(feature.properties[metric], scale),
        fillOpacity: 0.88,
        color: selected ? "#0b3d42" : "#ffffff",
        weight: selected ? 2.2 : 0.65,
      };
    },
    onEachFeature: (feature, layer) => {
      layersByName.set(feature.properties.name, layer);
      layer.bindTooltip("", { sticky: true, direction: "top", opacity: 1 });
      layer.on("mouseover", () => {
        layer.setTooltipContent(metricTooltip(feature, document.getElementById("metricSelect").value));
      });
      layer.on("click", () => selectProvince(feature.properties.name, true));
    },
  }).addTo(map);

  map.fitBounds(geojsonLayer.getBounds(), { padding: [14, 14] });
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
    map.fitBounds(geojsonLayer.getBounds(), { padding: [14, 14] });
    return;
  }

  if (zoom) {
    const layer = layersByName.get(selectedProvince);
    if (layer) map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 7 });
  }
}

function initNav() {
  const links = [...document.querySelectorAll("#sidebarNav .nav-link")];
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      links.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");
      const target = document.getElementById(link.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const sections = links
    .map((link) => document.getElementById(link.dataset.target))
    .filter(Boolean);
  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => {
      link.classList.toggle("active", link.dataset.target === visible.target.id);
    });
  }, { rootMargin: "-15% 0px -65% 0px", threshold: [0, 0.1, 0.25] });
  sections.forEach((section) => observer.observe(section));
}

function initEvents() {
  document.getElementById("provinceFilter").addEventListener("change", (event) => {
    selectProvince(event.target.value, event.target.value !== "all");
  });
  document.getElementById("metricSelect").addEventListener("change", updateMap);
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
initEvents();
initNav();
updateSelectionUi();
buildRankingChart();
buildScatterChart();
buildCoverageChart();
buildGiniChart();

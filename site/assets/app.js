"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const MAP = {
  width: 980,
  height: 700,
  padding: { top: 34, right: 42, bottom: 38, left: 42 },
  bounds: { minLon: 111, maxLon: 155, minLat: -44.5, maxLat: -9 },
};

const CATEGORY_STYLE = {
  "Critical minerals & resources": { color: "#b87827", short: "Critical minerals" },
  "Renewable energy & hydrogen": { color: "#238d68", short: "Renewables & hydrogen" },
  "Offshore wind": { color: "#2f78b7", short: "Offshore wind" },
  "Advanced manufacturing": { color: "#7d5bb5", short: "Advanced manufacturing" },
  "Carbon management": { color: "#57687a", short: "Carbon management" },
  "Digital infrastructure": { color: "#b84968", short: "Digital infrastructure" },
};

const STATE_NAMES = {
  ACT: "Australian Capital Territory",
  NSW: "New South Wales",
  NT: "Northern Territory",
  QLD: "Queensland",
  SA: "South Australia",
  TAS: "Tasmania",
  VIC: "Victoria",
  WA: "Western Australia",
};

const STATE_BOUNDARIES = [
  [[129, -14.8], [129, -26]],
  [[129, -26], [141, -26]],
  [[138, -16.1], [138, -26]],
  [[141, -26], [141, -38.05]],
  [[141, -29], [153.4, -29]],
  [[141, -34.05], [142.35, -34.05], [143.3, -35.25], [144.35, -35.85], [146.15, -36.1], [149.05, -37.15]],
];

const STATE_LABELS = [
  { label: "WA", lon: 121.2, lat: -25.6 },
  { label: "NT", lon: 133.2, lat: -18.9 },
  { label: "SA", lon: 135.2, lat: -30.1 },
  { label: "QLD", lon: 145.1, lat: -23.1 },
  { label: "NSW", lon: 147.1, lat: -32.6 },
  { label: "VIC", lon: 144.7, lat: -37.4 },
  { label: "TAS", lon: 146.6, lat: -42.1 },
];

const state = {
  meta: null,
  projects: [],
  filtered: [],
  markerElements: new Map(),
  selectedId: null,
};

const elements = {
  mapStage: document.querySelector("#map-stage"),
  mapLoading: document.querySelector("#map-loading"),
  mapTooltip: document.querySelector("#map-tooltip"),
  mapLegend: document.querySelector("#map-legend"),
  projectList: document.querySelector("#project-list"),
  resultCount: document.querySelector("#result-count"),
  search: document.querySelector("#search-input"),
  stateFilter: document.querySelector("#state-filter"),
  categoryFilter: document.querySelector("#category-filter"),
  sortFilter: document.querySelector("#sort-filter"),
  clearFilters: document.querySelector("#clear-filters"),
  dialog: document.querySelector("#project-dialog"),
  dialogContent: document.querySelector("#dialog-content"),
  dialogClose: document.querySelector("#dialog-close"),
  snapshotLabel: document.querySelector("#snapshot-label"),
  heroSourceLink: document.querySelector("#hero-source-link"),
  footerSourceLink: document.querySelector("#footer-source-link"),
  stats: {
    projects: document.querySelector("#stat-projects"),
    projectsNote: document.querySelector("#stat-projects-note"),
    capex: document.querySelector("#stat-capex"),
    capexNote: document.querySelector("#stat-capex-note"),
    construction: document.querySelector("#stat-construction"),
    constructionNote: document.querySelector("#stat-construction-note"),
    ongoing: document.querySelector("#stat-ongoing"),
    ongoingNote: document.querySelector("#stat-ongoing-note"),
  },
};

function svgElement(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  return node;
}

function projectPoint(longitude, latitude) {
  const { width, height, padding, bounds } = MAP;
  const usableWidth = width - padding.left - padding.right;
  const usableHeight = height - padding.top - padding.bottom;
  const x = padding.left + ((longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * usableWidth;
  const y = padding.top + ((bounds.maxLat - latitude) / (bounds.maxLat - bounds.minLat)) * usableHeight;
  return { x, y };
}

function pathFromRing(ring) {
  return ring.map(([lon, lat], index) => {
    const { x, y } = projectPoint(lon, lat);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ") + " Z";
}

function geometryPath(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(pathFromRing).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygon.map(pathFromRing)).join(" ");
  }
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function renderBasemap(geojson) {
  const svg = svgElement("svg", {
    class: "project-map",
    viewBox: `0 0 ${MAP.width} ${MAP.height}`,
    role: "img",
    "aria-label": "Map of Australia showing approximate major project locations",
  });

  const feature = geojson.features?.[0];
  if (!feature) throw new Error("Australia basemap contains no feature");

  svg.append(svgElement("path", {
    class: "landmass",
    d: geometryPath(feature.geometry),
    "fill-rule": "evenodd",
  }));

  const boundaries = svgElement("g", { "aria-hidden": "true" });
  STATE_BOUNDARIES.forEach((line) => {
    const points = line.map(([lon, lat]) => {
      const point = projectPoint(lon, lat);
      return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    }).join(" ");
    boundaries.append(svgElement("polyline", { class: "state-boundary", points }));
  });
  svg.append(boundaries);

  const labels = svgElement("g", { "aria-hidden": "true" });
  STATE_LABELS.forEach(({ label, lon, lat }) => {
    const point = projectPoint(lon, lat);
    const text = svgElement("text", { class: "state-label", x: point.x, y: point.y });
    text.textContent = label;
    labels.append(text);
  });
  svg.append(labels);

  const markerLayer = svgElement("g", { class: "marker-layer" });
  state.projects.forEach((project) => {
    const basePoint = projectPoint(project.location.longitude, project.location.latitude);
    const x = basePoint.x + (project.location.marker_offset?.x || 0);
    const y = basePoint.y + (project.location.marker_offset?.y || 0);
    const category = CATEGORY_STYLE[project.category];
    const marker = svgElement("g", {
      class: "project-marker",
      transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})`,
      tabindex: "0",
      role: "button",
      "aria-label": `Project ${project.id}: ${project.name}, ${project.location.label}`,
      style: `--marker-color:${category.color}`,
      "data-project-id": project.id,
    });
    marker.append(svgElement("circle", { class: "marker-halo", r: 18 }));
    marker.append(svgElement("circle", { class: "marker-dot", r: 13 }));
    const number = svgElement("text", { class: "marker-number", x: 0, y: 0 });
    number.textContent = String(project.id);
    marker.append(number);
    const title = svgElement("title");
    title.textContent = `${project.id}. ${project.name}`;
    marker.append(title);

    marker.addEventListener("click", () => openProject(project.id));
    marker.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProject(project.id);
      }
    });
    marker.addEventListener("pointerenter", (event) => showTooltip(event, project));
    marker.addEventListener("pointermove", (event) => positionTooltip(event));
    marker.addEventListener("pointerleave", hideTooltip);

    markerLayer.append(marker);
    state.markerElements.set(project.id, marker);
  });
  svg.append(markerLayer);

  elements.mapStage.append(svg);
  elements.mapLoading.remove();
}

function showTooltip(event, project) {
  elements.mapTooltip.innerHTML = `<strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.location.label)}</span>`;
  elements.mapTooltip.hidden = false;
  positionTooltip(event);
}

function positionTooltip(event) {
  if (elements.mapTooltip.hidden) return;
  const stage = elements.mapStage.getBoundingClientRect();
  const tooltip = elements.mapTooltip.getBoundingClientRect();
  const requestedX = event.clientX - stage.left + 14;
  const requestedY = event.clientY - stage.top + 14;
  const x = Math.min(Math.max(8, requestedX), stage.width - tooltip.width - 8);
  const y = Math.min(Math.max(8, requestedY), stage.height - tooltip.height - 8);
  elements.mapTooltip.style.left = `${x}px`;
  elements.mapTooltip.style.top = `${y}px`;
}

function hideTooltip() {
  elements.mapTooltip.hidden = true;
}

function renderLegend() {
  elements.mapLegend.replaceChildren();
  Object.entries(CATEGORY_STYLE).forEach(([name, style]) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="--legend-color:${style.color}"></span>${escapeHtml(style.short)}`;
    elements.mapLegend.append(item);
  });
}

function populateFilters() {
  Object.keys(state.meta.states).sort().forEach((code) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${STATE_NAMES[code] || code} (${state.meta.states[code]})`;
    elements.stateFilter.append(option);
  });

  Object.keys(state.meta.categories).forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = `${category} (${state.meta.categories[category]})`;
    elements.categoryFilter.append(option);
  });
}

function applyFilters() {
  const query = elements.search.value.trim().toLocaleLowerCase("en-AU");
  const stateCode = elements.stateFilter.value;
  const category = elements.categoryFilter.value;

  state.filtered = state.projects.filter((project) => {
    const matchesQuery = !query || [
      project.name,
      project.proponent,
      project.description,
      project.location.label,
      project.state_display,
      project.category,
    ].join(" ").toLocaleLowerCase("en-AU").includes(query);
    const matchesState = stateCode === "all" || project.state_codes.includes(stateCode);
    const matchesCategory = category === "all" || project.category === category;
    return matchesQuery && matchesState && matchesCategory;
  });

  sortFilteredProjects();
  renderList();
  updateMarkers();
  updateStats();
  updateFilterButton();
}

function sortFilteredProjects() {
  const mode = elements.sortFilter.value;
  const sorters = {
    id: (a, b) => a.id - b.id,
    name: (a, b) => a.name.localeCompare(b.name, "en-AU"),
    expiry: (a, b) => a.status_expires.localeCompare(b.status_expires) || a.id - b.id,
    capex: (a, b) => (b.capex_aud ?? -1) - (a.capex_aud ?? -1) || a.id - b.id,
  };
  state.filtered.sort(sorters[mode] || sorters.id);
}

function renderList() {
  elements.projectList.replaceChildren();
  const count = state.filtered.length;
  elements.resultCount.textContent = `${count} project${count === 1 ? "" : "s"}`;

  if (!count) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No projects match the current filters.";
    elements.projectList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filtered.forEach((project) => {
    const style = CATEGORY_STYLE[project.category];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "project-card";
    card.setAttribute("aria-label", `Open details for ${project.name}`);
    card.innerHTML = `
      <span class="project-card__top">
        <span class="category-tag" style="--category-color:${style.color}">${escapeHtml(style.short)}</span>
        <span class="project-card__number">#${String(project.id).padStart(2, "0")}</span>
      </span>
      <h3>${escapeHtml(project.name)}</h3>
      <p class="project-card__proponent">${escapeHtml(project.proponent)}</p>
      <span class="project-card__meta">
        <span title="Location">${escapeHtml(project.state_display)} · ${escapeHtml(project.location.label)}</span>
        <span title="Reported capital expenditure">${formatCurrency(project.capex_aud)}</span>
      </span>`;
    card.addEventListener("click", () => openProject(project.id));
    fragment.append(card);
  });
  elements.projectList.append(fragment);
}

function updateMarkers() {
  const visibleIds = new Set(state.filtered.map((project) => project.id));
  state.markerElements.forEach((marker, id) => {
    marker.classList.toggle("is-hidden", !visibleIds.has(id));
  });
}

function updateStats() {
  const projects = state.filtered;
  const capex = projects.filter((project) => project.capex_aud !== null);
  const construction = projects.filter((project) => project.construction_jobs !== null);
  const ongoing = projects.filter((project) => project.ongoing_jobs !== null);

  elements.stats.projects.textContent = formatInteger(projects.length);
  elements.stats.projectsNote.textContent = projects.length === state.projects.length
    ? "All projects in the supplied snapshot"
    : `Filtered from ${state.projects.length} total projects`;

  elements.stats.capex.textContent = formatCompactCurrency(sumBy(capex, "capex_aud"));
  elements.stats.capexNote.textContent = coverageText(capex.length, projects.length, "project");

  elements.stats.construction.textContent = formatInteger(sumBy(construction, "construction_jobs"));
  elements.stats.constructionNote.textContent = coverageText(construction.length, projects.length, "project");

  elements.stats.ongoing.textContent = formatInteger(sumBy(ongoing, "ongoing_jobs"));
  elements.stats.ongoingNote.textContent = coverageText(ongoing.length, projects.length, "project");
}

function coverageText(reported, total, noun) {
  if (!total) return "No matching projects";
  return `Reported by ${reported} of ${total} ${noun}${total === 1 ? "" : "s"}`;
}

function sumBy(items, key) {
  return items.reduce((sum, item) => sum + (item[key] || 0), 0);
}

function updateFilterButton() {
  const hasFilters = Boolean(elements.search.value.trim())
    || elements.stateFilter.value !== "all"
    || elements.categoryFilter.value !== "all"
    || elements.sortFilter.value !== "id";
  elements.clearFilters.disabled = !hasFilters;
}

function clearFilters() {
  elements.search.value = "";
  elements.stateFilter.value = "all";
  elements.categoryFilter.value = "all";
  elements.sortFilter.value = "id";
  applyFilters();
  elements.search.focus();
}

function openProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return;

  state.selectedId = projectId;
  state.markerElements.forEach((marker, id) => {
    marker.classList.toggle("is-selected", id === projectId);
  });

  const category = CATEGORY_STYLE[project.category];
  const paragraphs = project.description.split(/\n\n+/).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const source = state.meta.source;

  elements.dialogContent.innerHTML = `
    <header class="dialog-hero">
      <p class="dialog-kicker" style="--category-color:${category.color}">Project ${project.id} · ${escapeHtml(project.category)}</p>
      <h2 id="dialog-title">${escapeHtml(project.name)}</h2>
      <p>${escapeHtml(project.proponent)}</p>
    </header>
    <div class="dialog-body">
      <div class="dialog-metrics" aria-label="Project metrics">
        <div class="dialog-metric"><strong>${formatCurrency(project.capex_aud)}</strong><span>Reported capital expenditure</span></div>
        <div class="dialog-metric"><strong>${formatIntegerOrDash(project.construction_jobs)}</strong><span>Construction jobs</span></div>
        <div class="dialog-metric"><strong>${formatIntegerOrDash(project.ongoing_jobs)}</strong><span>Ongoing jobs</span></div>
      </div>
      <dl class="dialog-details">
        <div class="dialog-detail"><dt>State / territory</dt><dd>${escapeHtml(project.state_display)}</dd></div>
        <div class="dialog-detail"><dt>Approximate location</dt><dd>${escapeHtml(project.location.label)}</dd></div>
        <div class="dialog-detail"><dt>Status granted</dt><dd>${formatDate(project.status_granted)}</dd></div>
        <div class="dialog-detail"><dt>Status expires</dt><dd>${formatDate(project.status_expires)}</dd></div>
      </dl>
      <section class="dialog-description">
        <h3>Project overview</h3>
        ${paragraphs}
      </section>
      <p class="dialog-source-note">Location precision: ${escapeHtml(project.location.precision)}. ${escapeHtml(source.location_note)} <a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">View source dataset ↗</a></p>
    </div>`;

  if (typeof elements.dialog.showModal === "function") {
    elements.dialog.showModal();
  } else {
    elements.dialog.setAttribute("open", "");
  }
}

function closeDialog() {
  if (elements.dialog.open && typeof elements.dialog.close === "function") {
    elements.dialog.close();
  } else {
    elements.dialog.removeAttribute("open");
  }
}

function formatInteger(value) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value || 0);
}

function formatIntegerOrDash(value) {
  return value === null ? "Not reported" : formatInteger(value);
}

function formatCurrency(value) {
  if (value === null) return "Not reported";
  if (value >= 1_000_000_000) {
    return `A$${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 }).format(value / 1_000_000_000)}b`;
  }
  return `A$${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value / 1_000_000)}m`;
}

function formatCompactCurrency(value) {
  if (!value) return "A$0";
  if (value >= 1_000_000_000) {
    return `A$${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 }).format(value / 1_000_000_000)}b`;
  }
  return `A$${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value / 1_000_000)}m`;
}

function formatDate(isoDate) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function bindEvents() {
  [elements.search, elements.stateFilter, elements.categoryFilter].forEach((control) => {
    control.addEventListener("input", applyFilters);
    control.addEventListener("change", applyFilters);
  });
  elements.sortFilter.addEventListener("change", applyFilters);
  elements.clearFilters.addEventListener("click", clearFilters);
  elements.dialogClose.addEventListener("click", closeDialog);
  elements.dialog.addEventListener("close", () => {
    state.selectedId = null;
    state.markerElements.forEach((marker) => marker.classList.remove("is-selected"));
  });
  elements.dialog.addEventListener("click", (event) => {
    const rect = elements.dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) closeDialog();
  });
}

function applySourceMetadata() {
  const source = state.meta.source;
  elements.heroSourceLink.href = source.url;
  elements.footerSourceLink.href = source.url;
  elements.snapshotLabel.textContent = `Repository snapshot: ${formatDate(source.repository_snapshot_date)}`;
}

function showFatalError(error) {
  console.error(error);
  elements.mapStage.innerHTML = `<div class="map-error" role="alert">The project map could not be loaded. Run the repository through a local web server and confirm the generated data files are present.</div>`;
  elements.projectList.innerHTML = `<p class="empty-state">Project data could not be loaded.</p>`;
  elements.resultCount.textContent = "Unavailable";
}

async function initialise() {
  bindEvents();
  try {
    const [projectResponse, mapResponse] = await Promise.all([
      fetch("data/projects.json"),
      fetch("data/australia.geojson"),
    ]);
    if (!projectResponse.ok || !mapResponse.ok) {
      throw new Error(`Data request failed (${projectResponse.status}, ${mapResponse.status})`);
    }
    const payload = await projectResponse.json();
    const geojson = await mapResponse.json();
    state.meta = payload.meta;
    state.projects = payload.projects;
    state.filtered = [...state.projects];

    applySourceMetadata();
    populateFilters();
    renderLegend();
    renderBasemap(geojson);
    applyFilters();
  } catch (error) {
    showFatalError(error);
  }
}

initialise();

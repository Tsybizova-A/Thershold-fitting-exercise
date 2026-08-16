/* Inline SVG renderer for CID breakdown curves. No charting library. */

const SVG_NS = "http://www.w3.org/2000/svg";

const DEFAULT_X_DOMAIN = [0, 12];
const DEFAULT_Y_DOMAIN = [0, 80];

/** Round a domain outward to sensible tick stops and return [domain, ticks]. */
function niceAxis(lo, hi, target = 6) {
  if (!(hi > lo)) return [[lo, lo + 1], [lo, lo + 1]];
  const raw = (hi - lo) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let t = start; t <= end + step / 2; t += step) {
    ticks.push(Math.abs(t) < step / 1e6 ? 0 : Number(t.toFixed(10)));
  }
  return [[start, end], ticks];
}

function tickLabel(v, step) {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return v.toFixed(decimals);
}

const VIEW_WIDTH = 380;
const MARGIN_LEFT = 42;
const MARGIN_RIGHT = 14;
const MARGIN_TOP = 14;
const MARGIN_BOTTOM = 38;
const PLOT_HEIGHT = 220;
const LEGEND_ROW_H = 16;
const LEGEND_PAD_TOP = 8;
const MARKER_LABEL_ROW_H = 11;
const MARKER_LABEL_CHAR_W = 5.2;
const MARKER_LABEL_PAD = 6;
const MARKER_LABEL_GAP = 5;

const STYLE = `
.viz-root {
  color-scheme: light;
  --surface-1:      #f5f7fa;
  --ink:            #17284a;
  --ink-secondary:  #4b5b74;
  --muted:          #74777e;
  --grid:           #d7dde6;
  --baseline:       #b7c0cd;
  --heaviest:       #04070d;
  --signal-red:     #c81f2e;
  --font-sans: "Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", "Cascadia Code", "Roboto Mono", Consolas, "Liberation Mono", monospace;
  font-family: var(--font-sans);
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .viz-root {
    color-scheme: dark;
    --surface-1:      #10141a;
    --ink:            #dbe4f2;
    --ink-secondary:  #a9b6c9;
    --muted:          #9a9da4;
    --grid:           #232830;
    --baseline:       #3a4250;
    --heaviest:       #fbfcff;
    --signal-red:     #ef5b64;
  }
}
:root[data-theme="dark"] .viz-root {
  color-scheme: dark;
  --surface-1:      #10141a;
  --ink:            #dbe4f2;
  --ink-secondary:  #a9b6c9;
  --muted:          #9a9da4;
  --grid:           #232830;
  --baseline:       #3a4250;
  --heaviest:       #fbfcff;
  --signal-red:     #ef5b64;
}
.viz-bg { fill: var(--surface-1); }
.viz-grid { stroke: var(--grid); stroke-width: 1; shape-rendering: crispEdges; }
.viz-axis { stroke: var(--baseline); stroke-width: 1; }
.viz-tick-label { fill: var(--muted); font-family: var(--font-mono); font-size: 9px; }
.viz-axis-label { fill: var(--ink-secondary); font-size: 10px; }
.viz-dot { fill: none; stroke: var(--ink); stroke-width: 1; }
.viz-hit { fill: transparent; cursor: pointer; }
.viz-hit:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
.viz-curve { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.viz-marker-label { font-size: 9px; }
.viz-legend-text { fill: var(--ink-secondary); font-size: 10px; }
.viz-tooltip-bg { fill: var(--surface-1); stroke: var(--baseline); stroke-width: 1; }
.viz-tooltip-value { fill: var(--ink); font-family: var(--font-mono); font-size: 10.5px; font-weight: 600; }
.viz-tooltip-label { fill: var(--ink-secondary); font-family: var(--font-mono); font-size: 9px; }
`;

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, value);
  }
  return node;
}

function text(attrs, content) {
  const node = el("text", attrs);
  node.textContent = content;
  return node;
}

function buildTooltip() {
  const group = el("g", { style: "display:none;", "pointer-events": "none" });
  const bg = el("rect", { class: "viz-tooltip-bg", rx: 3, ry: 3, width: 92, height: 32 });
  const valueLine = text({ class: "viz-tooltip-value", x: 8, y: 14 }, "");
  const labelLine = text({ class: "viz-tooltip-label", x: 8, y: 26 }, "");
  group.append(bg, valueLine, labelLine);
  return { group, bg, valueLine, labelLine };
}

function showTooltip(tooltip, x, y, energy, fraction, unit) {
  const w = 92;
  const h = 32;
  let tx = x + 10;
  if (tx + w > VIEW_WIDTH) tx = x - 10 - w;
  let ty = y - h - 8;
  if (ty < 0) ty = y + 10;

  tooltip.bg.setAttribute("width", w);
  tooltip.bg.setAttribute("height", h);
  tooltip.valueLine.textContent = `${energy.toFixed(2)} eV`;
  tooltip.labelLine.textContent = `${fraction.toFixed(2)} ${unit}`;
  tooltip.group.setAttribute("transform", `translate(${tx}, ${ty})`);
  tooltip.group.setAttribute("style", "display:block;");
}

function hideTooltip(tooltip) {
  tooltip.group.setAttribute("style", "display:none;");
}

/**
 * Assign each marker label a row so horizontally-overlapping labels stagger
 * vertically instead of drawing on top of one another. Rows are packed
 * greedily left-to-right; a label only drops to a new row if it would
 * collide with the last label already placed in every existing row.
 */
function layoutMarkerLabels(markersWithLabels, xScale, plotLeft, plotRight) {
  const items = markersWithLabels
    .map((marker) => {
      const x = xScale(marker.energy);
      const width = marker.label.length * MARKER_LABEL_CHAR_W + MARKER_LABEL_PAD;
      const flip = x > plotRight - width - 6;
      const start = flip ? x - 4 - width : x + 4;
      return { marker, x, flip, start, end: start + width };
    })
    .sort((a, b) => a.start - b.start);

  const rowRightEdge = [];
  for (const item of items) {
    let row = 0;
    while (row < rowRightEdge.length && item.start < rowRightEdge[row] + MARKER_LABEL_GAP) {
      row++;
    }
    rowRightEdge[row] = item.end;
    item.row = row;
  }
  return items;
}

/**
 * Render a CID breakdown curve as inline SVG into `container`.
 *
 * @param {Element} container - element to render into (its content is replaced)
 * @param {Object} options
 * @param {Array<[number, number]>} options.data - measured [Ecm, fraction] points, drawn as dots
 * @param {Array<{points: Array<[number, number]>, color?: string, label?: string}>} [options.curves]
 *   - optional smooth line overlays, drawn as paths
 * @param {Array<{energy: number, color?: string, label?: string, style?: "solid"|"dashed", width?: number}>} [options.markers]
 *   - optional vertical reference lines (width in px, default 1.5)
 * @returns {SVGSVGElement}
 */
export function renderBreakdownCurve(container, {
  data = [],
  curves = [],
  markers = [],
  xLabel = "Collision energy (eV, centre of mass)",
  yLabel = "Reactive cross section (Å²)",
  yUnit = "Å²",
  xDomain = null,
  yDomain = null,
} = {}) {
  container.innerHTML = "";

  // Auto-scale to whatever is being plotted, unless a domain was forced.
  const allX = [...data.map((d) => d[0]), ...curves.flatMap((c) => (c.points || []).map((p) => p[0]))];
  const allY = [...data.map((d) => d[1]), ...curves.flatMap((c) => (c.points || []).map((p) => p[1]))];
  const markerX = markers.map((m) => m.energy).filter((v) => Number.isFinite(v));

  const [X_DOMAIN, X_TICKS] = xDomain
    ? niceAxis(xDomain[0], xDomain[1])
    : niceAxis(Math.min(...allX, ...markerX, DEFAULT_X_DOMAIN[0]), Math.max(...allX, DEFAULT_X_DOMAIN[0] + 1));
  const [Y_DOMAIN, Y_TICKS] = yDomain
    ? niceAxis(yDomain[0], yDomain[1], 5)
    : niceAxis(0, allY.length ? Math.max(...allY) : DEFAULT_Y_DOMAIN[1], 5);
  const xStep = X_TICKS.length > 1 ? X_TICKS[1] - X_TICKS[0] : 1;
  const yStep = Y_TICKS.length > 1 ? Y_TICKS[1] - Y_TICKS[0] : 1;

  const legendEntries = [];
  if (data.length) legendEntries.push({ kind: "dot", color: "var(--ink)", label: "Measured cross sections" });
  for (const curve of curves) {
    if (curve.label) legendEntries.push({ kind: "line", color: curve.color || "var(--ink)", label: curve.label });
  }
  for (const marker of markers) {
    if (marker.label) {
      legendEntries.push({
        kind: marker.style === "dashed" ? "dashed" : "solid",
        color: marker.color || "var(--muted)",
        label: marker.label,
      });
    }
  }

  const showLegend = legendEntries.length > 1;
  const legendHeight = showLegend ? LEGEND_PAD_TOP + legendEntries.length * LEGEND_ROW_H : 0;
  const plotWidth = VIEW_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
  const viewHeight = MARGIN_TOP + PLOT_HEIGHT + MARGIN_BOTTOM + legendHeight;

  const xScale = (e) =>
    MARGIN_LEFT + ((e - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0])) * plotWidth;
  const yScale = (f) =>
    MARGIN_TOP + PLOT_HEIGHT - ((f - Y_DOMAIN[0]) / (Y_DOMAIN[1] - Y_DOMAIN[0])) * PLOT_HEIGHT;

  const svg = el("svg", {
    viewBox: `0 0 ${VIEW_WIDTH} ${viewHeight}`,
    class: "viz-root",
    role: "img",
    "aria-label": `Breakdown curve: ${yLabel} versus ${xLabel}`,
    style: "width:100%; height:auto; display:block;",
  });

  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = STYLE;
  svg.appendChild(style);

  svg.appendChild(el("rect", { x: 0, y: 0, width: VIEW_WIDTH, height: viewHeight, class: "viz-bg" }));

  const gGrid = el("g");
  for (const t of X_TICKS) {
    const x = xScale(t);
    gGrid.appendChild(el("line", { x1: x, y1: MARGIN_TOP, x2: x, y2: MARGIN_TOP + PLOT_HEIGHT, class: "viz-grid" }));
  }
  for (const t of Y_TICKS) {
    const y = yScale(t);
    gGrid.appendChild(el("line", { x1: MARGIN_LEFT, y1: y, x2: MARGIN_LEFT + plotWidth, y2: y, class: "viz-grid" }));
  }
  svg.appendChild(gGrid);

  svg.appendChild(
    el("line", {
      x1: MARGIN_LEFT,
      y1: MARGIN_TOP + PLOT_HEIGHT,
      x2: MARGIN_LEFT + plotWidth,
      y2: MARGIN_TOP + PLOT_HEIGHT,
      class: "viz-axis",
    })
  );
  svg.appendChild(
    el("line", { x1: MARGIN_LEFT, y1: MARGIN_TOP, x2: MARGIN_LEFT, y2: MARGIN_TOP + PLOT_HEIGHT, class: "viz-axis" })
  );

  const gTicks = el("g");
  for (const t of X_TICKS) {
    gTicks.appendChild(
      text({ x: xScale(t), y: MARGIN_TOP + PLOT_HEIGHT + 13, "text-anchor": "middle", class: "viz-tick-label" }, tickLabel(t, xStep))
    );
  }
  for (const t of Y_TICKS) {
    gTicks.appendChild(
      text({ x: MARGIN_LEFT - 6, y: yScale(t) + 3, "text-anchor": "end", class: "viz-tick-label" }, tickLabel(t, yStep))
    );
  }
  svg.appendChild(gTicks);

  svg.appendChild(
    text(
      { x: MARGIN_LEFT + plotWidth / 2, y: MARGIN_TOP + PLOT_HEIGHT + 32, "text-anchor": "middle", class: "viz-axis-label" },
      xLabel
    )
  );
  svg.appendChild(
    text(
      {
        x: 0,
        y: 0,
        "text-anchor": "middle",
        class: "viz-axis-label",
        transform: `translate(12, ${MARGIN_TOP + PLOT_HEIGHT / 2}) rotate(-90)`,
      },
      yLabel
    )
  );

  const gMarkers = el("g");
  const visibleMarkers = markers.filter((m) => {
    const x = xScale(m.energy);
    return x >= MARGIN_LEFT && x <= MARGIN_LEFT + plotWidth;
  });

  for (const marker of visibleMarkers) {
    const x = xScale(marker.energy);
    const color = marker.color || "var(--muted)";
    const width = marker.width || 1.5;
    const lineAttrs = {
      x1: x,
      y1: MARGIN_TOP,
      x2: x,
      y2: MARGIN_TOP + PLOT_HEIGHT,
      style: `stroke:${color}; stroke-width:${width};`,
    };
    if (marker.style === "dashed") lineAttrs["stroke-dasharray"] = "4,3";
    gMarkers.appendChild(el("line", lineAttrs));
  }

  const labelPlacements = layoutMarkerLabels(
    visibleMarkers.filter((m) => m.label),
    xScale,
    MARGIN_LEFT,
    MARGIN_LEFT + plotWidth
  );
  for (const { marker, x, flip, row } of labelPlacements) {
    gMarkers.appendChild(
      text(
        {
          x: flip ? x - 4 : x + 4,
          "text-anchor": flip ? "end" : "start",
          y: MARGIN_TOP + 10 + row * MARKER_LABEL_ROW_H,
          class: "viz-marker-label",
          style: `fill:${marker.color || "var(--muted)"};`,
        },
        marker.label
      )
    );
  }
  svg.appendChild(gMarkers);

  const gCurves = el("g");
  for (const curve of curves) {
    const points = curve.points || [];
    if (!points.length) continue;
    const d = points
      .map(([e, f], i) => `${i === 0 ? "M" : "L"}${xScale(e).toFixed(2)},${yScale(f).toFixed(2)}`)
      .join(" ");
    gCurves.appendChild(el("path", { d, class: "viz-curve", style: `stroke:${curve.color || "var(--ink)"};` }));
  }
  svg.appendChild(gCurves);

  const tooltip = buildTooltip();

  const gData = el("g");
  for (const [e, f] of data) {
    const x = xScale(e);
    const y = yScale(f);
    const hit = el("circle", {
      cx: x,
      cy: y,
      r: 7,
      class: "viz-hit",
      tabindex: "0",
      role: "img",
      "aria-label": `Collision energy ${e.toFixed(2)} electronvolts, ${f.toFixed(2)} ${yUnit}`,
    });
    const dot = el("circle", { cx: x, cy: y, r: 2.2, class: "viz-dot" });
    const show = () => showTooltip(tooltip, x, y, e, f, yUnit);
    const hide = () => hideTooltip(tooltip);
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("focus", show);
    hit.addEventListener("blur", hide);
    gData.append(hit, dot);
  }
  svg.appendChild(gData);

  if (showLegend) {
    const gLegend = el("g", {
      transform: `translate(${MARGIN_LEFT}, ${MARGIN_TOP + PLOT_HEIGHT + MARGIN_BOTTOM + LEGEND_PAD_TOP})`,
    });
    legendEntries.forEach((entry, i) => {
      const y = i * LEGEND_ROW_H;
      if (entry.kind === "dot") {
        gLegend.appendChild(el("circle", { cx: 5, cy: y + 4, r: 4, style: `fill:${entry.color};` }));
      } else if (entry.kind === "line") {
        gLegend.appendChild(
          el("line", { x1: 0, y1: y + 4, x2: 12, y2: y + 4, style: `stroke:${entry.color}; stroke-width:2;` })
        );
      } else {
        const lineAttrs = { x1: 0, y1: y + 4, x2: 12, y2: y + 4, style: `stroke:${entry.color}; stroke-width:1.5;` };
        if (entry.kind === "dashed") lineAttrs["stroke-dasharray"] = "3,2";
        gLegend.appendChild(el("line", lineAttrs));
      }
      gLegend.appendChild(text({ x: 18, y: y + 7, class: "viz-legend-text" }, entry.label));
    });
    svg.appendChild(gLegend);
  }

  svg.appendChild(tooltip.group);
  container.appendChild(svg);
  return svg;
}

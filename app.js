import { CURVE_DATA, KCAL_PER_EV } from "./data.js";
import { naiveEstimators, breakdownCurve } from "./curve.js";
import { renderBreakdownCurve } from "./plot.js";

/* The published L-CID threshold for AdoCbi+. Obscured (base64) only so it is
 * not sitting in plain text for anyone who opens the source before stage 3.
 * This is friction, not security.
 *
 * NOTE ON WHAT THIS NUMBER IS. It is not ground truth — it is the output of a
 * threshold fit with an assumed internal temperature, an assumed reaction time
 * and an assumed transition state. The app says so at stage 5, and that is the
 * point of the exercise rather than a caveat on it. */
const PUBLISHED_E0_EV = parseFloat(atob("MS44MA=="));
const PUBLISHED_ERR_EV = 0.07;

const chartEl = document.getElementById("chart");
const estimateInput = document.getElementById("estimate-input");
const estimateEcho = document.getElementById("estimate-echo");
const lockInBtn = document.getElementById("lock-in-btn");
const stage2 = document.getElementById("stage-2");
const stage3 = document.getElementById("stage-3");
const stage4 = document.getElementById("stage-4");
const stage5 = document.getElementById("stage-5");
const methodsTableHeadRow = document.querySelector("#methods-table thead tr");
const methodsTableBody = document.querySelector("#methods-table tbody");
const showTrueBtn = document.getElementById("show-true-btn");
const whyBtn = document.getElementById("why-btn");
const answerBtn = document.getElementById("answer-btn");
const chart4El = document.getElementById("chart-stage4");
const startAgainBtn = document.getElementById("start-again-btn");

const markers = [];
let estimateEv = null;
let methodResults = [];
let stage3Revealed = false;

const kcal = (ev) => ev * KCAL_PER_EV;
const fmtSigned = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

function updatePlot() {
  renderBreakdownCurve(chartEl, {
    data: CURVE_DATA,
    markers,
    xDomain: [Math.min(1.5, ...markers.map((m) => m.energy), 3), 10],
  });
}

function isValidEstimate(raw) {
  if (raw === "") return false;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 12;
}

updatePlot();

estimateInput.addEventListener("input", () => {
  const ok = isValidEstimate(estimateInput.value);
  lockInBtn.disabled = !ok;
  estimateEcho.textContent = ok
    ? `= ${kcal(Number(estimateInput.value)).toFixed(1)} kcal/mol`
    : "";
});

lockInBtn.addEventListener("click", () => {
  if (estimateEv !== null) return;
  if (!isValidEstimate(estimateInput.value)) return;

  estimateEv = Number(estimateInput.value);
  estimateInput.readOnly = true;
  lockInBtn.disabled = true;
  lockInBtn.textContent = "Saved";

  markers.push({
    energy: estimateEv,
    color: "var(--signal-red)",
    label: "your estimate",
    style: "dashed",
  });
  updatePlot();
  revealStage2();
});

/* ---- Stage 2: three reading rules, computed from the data on screen ---- */
function revealStage2() {
  const Ecm = CURVE_DATA.map((r) => r[0]);
  const F = CURVE_DATA.map((r) => r[1]);
  const e = naiveEstimators(Ecm, F);

  methodResults = [
    { label: "The first point that rises clearly above the flat part at the start", chartLabel: "first rise", ev: e.firstClear },
    { label: "A straight line drawn through the steepest part, extended down to zero", chartLabel: "straight line", ev: e.linearExtrap },
  ].filter((m) => Number.isFinite(m.ev));

  for (const m of methodResults) {
    const row = methodsTableBody.insertRow();
    row.insertCell().textContent = m.label;
    const c = row.insertCell();
    c.className = "num";
    c.setAttribute("data-label", "Estimate (eV)");
    c.textContent = m.ev.toFixed(2);
    markers.push({ energy: m.ev, label: m.chartLabel, style: "dashed" });
  }
  updatePlot();

  const spread = Math.max(...methodResults.map((m) => m.ev)) - Math.min(...methodResults.map((m) => m.ev));
  document.getElementById("spread-note").textContent =
    `The two estimates differ by ${spread.toFixed(1)} eV, which is ${kcal(spread).toFixed(0)} kcal/mol. ` +
    `That gap is larger than many of the bond energies you would want to measure.`;

  stage2.classList.remove("hidden");
}

/* ---- Stage 3: the published value ---- */
showTrueBtn.addEventListener("click", revealStage3);

function revealStage3() {
  // Guard: this rewrites the table, so running it twice duplicates the rows
  // and the extra column. Disabling the button is not enough on its own —
  // a second call can still arrive from a double tap or a stray keypress.
  if (stage3Revealed) return;
  stage3Revealed = true;
  showTrueBtn.disabled = true;

  markers.push({
    energy: PUBLISHED_E0_EV,
    color: "var(--heaviest)",
    label: `published, ${PUBLISHED_E0_EV.toFixed(2)} eV`,
    style: "solid",
    width: 3.5,
  });
  updatePlot();

  const th = document.createElement("th");
  th.className = "num";
  th.textContent = "Difference (eV)";
  methodsTableHeadRow.appendChild(th);

  methodsTableBody.querySelectorAll("tr").forEach((tr, i) => {
    const c = tr.insertCell();
    c.className = "num";
    c.setAttribute("data-label", "Difference (eV)");
    c.textContent = fmtSigned(methodResults[i].ev - PUBLISHED_E0_EV);
  });

  const yours = methodsTableBody.insertRow(0);
  yours.insertCell().textContent = "Your estimate";
  const yv = yours.insertCell();
  yv.className = "num";
  yv.setAttribute("data-label", "Estimate (eV)");
  yv.textContent = estimateEv.toFixed(2);
  const ye = yours.insertCell();
  ye.className = "num";
  ye.setAttribute("data-label", "Difference (eV)");
  ye.textContent = fmtSigned(estimateEv - PUBLISHED_E0_EV);

  const pub = methodsTableBody.insertRow();
  pub.className = "true-row";
  pub.insertCell().textContent = "From the paper";
  const pv = pub.insertCell();
  pv.className = "num";
  pv.setAttribute("data-label", "Estimate (eV)");
  pv.textContent = `${PUBLISHED_E0_EV.toFixed(2)} ± ${PUBLISHED_ERR_EV.toFixed(2)}`;
  const pe = pub.insertCell();
  pe.className = "num";
  pe.setAttribute("data-label", "Difference (eV)");
  pe.textContent = "—";

  const lowestMeasured = Math.min(...CURVE_DATA.map((r) => r[0]));
  const note = document.getElementById("reveal-note");
  note.innerHTML = "";
  for (const line of [
    `The value published for this bond is ${PUBLISHED_E0_EV.toFixed(2)} eV, or ${kcal(PUBLISHED_E0_EV).toFixed(1)} kcal/mol.`,
    `Both estimates in the table are far above it, and so is almost every estimate anyone makes by eye.`,
    `There is something stranger. The published value of ${PUBLISHED_E0_EV.toFixed(2)} eV is lower than ${lowestMeasured.toFixed(
      2
    )} eV, which is the lowest collision energy at which any signal was recorded. The number the authors report lies outside the range they measured.`,
  ]) {
    const p = document.createElement("p");
    p.textContent = line;
    note.appendChild(p);
  }

  stage3.classList.remove("hidden");
}

whyBtn.addEventListener("click", () => {
  stage4.classList.remove("hidden");
  renderStage4Plot();
});

/* ---- Stage 4: the three effects, one slider at a time (schematic) ---- */
const STAGE4_ECM = Array.from({ length: 301 }, (_, i) => (i * 8) / 300);
const STAGE4_DECIMALS = { internal: 2, kinetic: 2, spread: 2 };
const STAGE4_E0 = 2.0;
const STAGE4_N = 1.5;

const sliders = {
  internal: document.getElementById("slider-internal"),
  kinetic: document.getElementById("slider-kinetic"),
  spread: document.getElementById("slider-spread"),
};
const readouts = {
  internal: document.getElementById("readout-internal"),
  kinetic: document.getElementById("readout-kinetic"),
  spread: document.getElementById("readout-spread"),
};

let rafScheduled = false;

function renderStage4Plot() {
  const v = {};
  for (const k of Object.keys(sliders)) v[k] = Number(sliders[k].value);

  const current = {
    E0: STAGE4_E0,
    n: STAGE4_N,
    kineticShift: v.kinetic,
    internalEnergy: v.internal,
    energySpread: v.spread,
    scale: 1,
  };
  const ideal = { ...current, internalEnergy: 0, kineticShift: 0, energySpread: 0 };

  const idealF = breakdownCurve(STAGE4_ECM, ideal);
  const currentF = breakdownCurve(STAGE4_ECM, current);

  // Scale both curves by the SAME fixed reference, the maximum of the ideal
  // curve, which does not depend on any slider. Using the joint maximum of the
  // two curves made the grey reference line move whenever the dark one rose,
  // which it does when internal energy is added. The y-axis is then fixed with
  // headroom, since the dark curve can legitimately exceed the grey one by up
  // to about 25% at the top of the internal-energy slider.
  const top = Math.max(...idealF);

  renderBreakdownCurve(chart4El, {
    data: [],
    curves: [
      { points: STAGE4_ECM.map((e, i) => [e, idealF[i] / top]), color: "var(--muted)", label: "if none of the three were happening" },
      { points: STAGE4_ECM.map((e, i) => [e, currentF[i] / top]), color: "var(--ink)", label: "with the sliders as you have set them" },
    ],
    markers: [{ energy: STAGE4_E0, color: "var(--heaviest)", label: "true E₀", style: "dashed", width: 3 }],
    xLabel: "Collision energy (schematic)",
    yLabel: "Fragment signal (schematic)",
    yUnit: "",
    xDomain: [0, 8],
    yDomain: [0, 1.3],
  });
}

function schedule() {
  if (rafScheduled) return;
  rafScheduled = true;
  requestAnimationFrame(() => {
    rafScheduled = false;
    renderStage4Plot();
  });
}

for (const k of Object.keys(sliders)) {
  sliders[k].addEventListener("input", () => {
    readouts[k].textContent = `${Number(sliders[k].value).toFixed(STAGE4_DECIMALS[k])} eV`;
    schedule();
  });
}

/* ---- Stage 5 ---- */
answerBtn.addEventListener("click", () => {
  stage5.classList.remove("hidden");
});

/* ---- reset ---- */
function resetExercise() {
  estimateEv = null;
  estimateInput.value = "";
  estimateInput.readOnly = false;
  estimateEcho.textContent = "";
  lockInBtn.disabled = true;
  lockInBtn.textContent = "Save my estimate";

  markers.length = 0;
  updatePlot();

  methodResults = [];
  stage3Revealed = false;
  showTrueBtn.disabled = false;
  methodsTableBody.innerHTML = "";
  while (methodsTableHeadRow.cells.length > 2) methodsTableHeadRow.deleteCell(2);
  document.getElementById("spread-note").textContent = "";
  document.getElementById("reveal-note").textContent = "";

  for (const s of [stage2, stage3, stage4, stage5]) s.classList.add("hidden");

  for (const k of Object.keys(sliders)) {
    sliders[k].value = sliders[k].defaultValue;
    readouts[k].textContent = `${Number(sliders[k].value).toFixed(STAGE4_DECIMALS[k])} eV`;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

startAgainBtn.addEventListener("click", resetExercise);

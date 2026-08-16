/* Threshold model and by-eye reading rules for CID cross-section curves. */

/* ------------------------------------------------------------------ *
 * Schematic threshold model — drives the three sliders in stage 4.
 * Unitless: this illustrates the shape of each distortion, it is not a
 * fit to the cobinamide data.
 * ------------------------------------------------------------------ */

function sigmaThreshold(E, E0eff, n) {
  if (E <= E0eff) return 0;
  return Math.pow(E - E0eff, n) / E;
}

function convolveInternalEnergy(Ecm, E0eff, n, internalEnergy) {
  if (internalEnergy === 0) {
    return Ecm.map((E) => sigmaThreshold(E, E0eff, n));
  }

  const nPts = 400;
  const EiMax = 8 * internalEnergy;
  const dEi = EiMax / (nPts - 1);
  const theta = internalEnergy / 2;

  const Ei = new Array(nPts);
  const P = new Array(nPts);
  let norm = 0;
  for (let j = 0; j < nPts; j++) {
    const e = j * dEi;
    Ei[j] = e;
    const p = e * Math.exp(-e / theta);
    P[j] = p;
    norm += p * dEi;
  }
  for (let j = 0; j < nPts; j++) P[j] /= norm;

  return Ecm.map((E) => {
    let sum = 0;
    for (let j = 0; j < nPts; j++) {
      sum += P[j] * sigmaThreshold(E + Ei[j], E0eff, n) * dEi;
    }
    return sum;
  });
}

function convolveEnergySpread(values, Ecm, energySpread) {
  if (energySpread === 0) return values;

  const dE = Ecm[1] - Ecm[0];
  const halfWidth = Math.floor((4 * energySpread) / dE);

  const kernel = [];
  let kNorm = 0;
  for (let k = -halfWidth; k <= halfWidth; k++) {
    const x = k * dE;
    const w = Math.exp(-(x * x) / (2 * energySpread * energySpread));
    kernel.push(w);
    kNorm += w;
  }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= kNorm;

  const N = values.length;
  const out = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    let wsum = 0;
    for (let k = -halfWidth; k <= halfWidth; k++) {
      const idx = i + k;
      if (idx >= 0 && idx < N) {
        sum += values[idx] * kernel[k + halfWidth];
        wsum += kernel[k + halfWidth];
      }
    }
    out[i] = wsum > 0 ? sum / wsum : 0;   // renormalise at the edges
  }
  return out;
}

export function breakdownCurve(Ecm, params) {
  const { E0, n, kineticShift, internalEnergy, energySpread, scale } = params;
  const E0eff = E0 + kineticShift;
  let s = convolveInternalEnergy(Ecm, E0eff, n, internalEnergy);
  s = convolveEnergySpread(s, Ecm, energySpread);
  return s.map((v) => Math.max(0, v / (scale || 1)));
}

/* ------------------------------------------------------------------ *
 * Two ways of deciding where the rise begins.
 *
 * A real cross-section curve climbs all the way to the end of the scan,
 * so any rule that needs the curve to level off (half of the maximum,
 * a fraction of the plateau) cannot be applied to it at all. What is
 * left is a judgement about where the flat part stops being flat, and
 * these are two ways of making that judgement explicit. They disagree
 * by about 2 eV, which is the point of the exercise.
 * ------------------------------------------------------------------ */

/** Mean and standard deviation of the flat region at the start of the scan. */
function baselineStats(Ecm, F, fraction = 0.25) {
  const nBase = Math.max(5, Math.floor(F.length * fraction));
  const slice = F.slice(0, nBase);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  return { mean, sd: Math.sqrt(variance) };
}

/** Local slope by least squares over a window, so noise does not pick the steepest point. */
function smoothedGradient(Ecm, F, half = 8) {
  const N = F.length;
  const g = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(N - 1, i + half);
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const m = hi - lo + 1;
    for (let j = lo; j <= hi; j++) {
      sx += Ecm[j]; sy += F[j]; sxx += Ecm[j] * Ecm[j]; sxy += Ecm[j] * F[j];
    }
    const denom = m * sxx - sx * sx;
    g[i] = denom === 0 ? 0 : (m * sxy - sx * sy) / denom;
  }
  return g;
}

export function naiveEstimators(Ecm, F) {
  const { mean, sd } = baselineStats(Ecm, F);

  // 1. First point that lifts clear of the baseline scatter.
  let firstClear = null;
  for (let i = 0; i < F.length; i++) {
    if (F[i] > mean + 3 * sd) {
      // require the rise to persist, so one noisy point does not trigger it
      const ahead = F.slice(i, i + 4);
      if (ahead.length === 4 && ahead.every((v) => v > mean + 2 * sd)) {
        firstClear = Ecm[i];
        break;
      }
    }
  }

  // 2. Straight line through the steepest part of the rise, extrapolated to zero.
  const g = smoothedGradient(Ecm, F);
  let best = 0;
  for (let i = 0; i < g.length; i++) if (g[i] > g[best]) best = i;
  const linearExtrap = g[best] > 0 ? Ecm[best] - F[best] / g[best] : null;

  return { firstClear, linearExtrap };
}

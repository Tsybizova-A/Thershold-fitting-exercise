/* Sanity check: run `node test.js` after touching data.js or curve.js.
 * Prints what each by-eye rule reads off each curve, against the published
 * L-CID threshold. If these numbers move, the script and the slides move too. */

import { SYSTEMS, KCAL_PER_EV } from "./data.js";
import { naiveEstimators } from "./curve.js";

for (const key of Object.keys(SYSTEMS)) {
  const s = SYSTEMS[key];
  const Ecm = s.data.map((r) => r[0]);
  const F = s.data.map((r) => r[1]);
  const { firstClear, linearExtrap } = naiveEstimators(Ecm, F);

  const row = (name, ev) =>
    `  ${name.padEnd(24)} ${ev.toFixed(2)} eV   ${(ev * KCAL_PER_EV).toFixed(1).padStart(6)} kcal/mol   ` +
    `${ev - s.E0 >= 0 ? "+" : "−"}${Math.abs(ev - s.E0).toFixed(2)} eV vs published`;

  console.log(`\n${s.label}   ${s.reaction}`);
  console.log(`  ${String(Ecm.length).padEnd(24)} points, ${Ecm[0].toFixed(2)}–${Ecm[Ecm.length - 1].toFixed(2)} eV`);
  console.log(row("first clear of baseline", firstClear));
  console.log(row("linear extrapolation", linearExtrap));
  console.log(`  ${"published (L-CID)".padEnd(24)} ${s.E0.toFixed(2)} eV   ${(s.E0 * KCAL_PER_EV).toFixed(1).padStart(6)} kcal/mol   ± ${s.E0err}`);
}
console.log();
